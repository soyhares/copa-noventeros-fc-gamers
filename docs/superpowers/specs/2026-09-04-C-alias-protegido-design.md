# C · Alias protegido — diseño

**Fecha:** 2026-09-04 · **Depende de:** A (multi-torneo con código de invitación)

## Problema

Hoy un alias solo se valida contra el torneo en el que te inscribís
(`aliasTaken(t, alias)`): "ElCraque22" en el Torneo 1 y "ElCraque22" en el Torneo 2 no
tienen ninguna relación entre sí, aunque los haya escrito la misma persona o dos
personas distintas. El historial de campeones (`meta/history`, `showHistory()`) ya
muestra el alias de cada campeón a través del tiempo, pero sin nada que confirme que
"ElCraque22" del año pasado es "ElCraque22" de este torneo — el salón de la fama no
tiene detrás una identidad real.

## Idea

Un registro global de alias con un código de protección. La primera vez que alguien usa
un alias en cualquier torneo, queda reclamado: se genera un código y el dispositivo que
lo reclamó lo recuerda, así nunca vuelve a pedírselo. Si el mismo alias aparece en otro
dispositivo, hace falta ese código para usarlo — si no se aporta, hay que elegir otro
alias. **No es seguridad**: con las reglas de Firestore abiertas el código es legible por
cualquiera que sepa mirar; es el mismo tope de velocidad que tenía el viejo PIN de admin,
y así se lo nombra en la UI (nunca como "contraseña").

## Modelo de datos

Un documento único, mismo patrón que ya usa `meta/history`:

```js
// meta/aliases → { items: { [aliasNormalizado]: código } }
async function loadAliases(){ const a = await fGet('meta','aliases'); return (a && a.items) || {}; }
async function saveAliases(a){ await fSet('meta','aliases', {items:a}); }
```

`fGet`/`fSet` de un documento entero, como todo lo demás en el proyecto — cero
infraestructura nueva. Se descartó una colección `aliases/{alias}` (un documento por
alias): es más correcta bajo concurrencia, pero introduce un patrón de acceso que hoy no
existe en el proyecto (todo es lectura/escritura de un documento completo, nunca una
colección con muchos documentos chicos). El riesgo que acepta el documento único —dos
reclamos de alias *distintos* en el mismo instante, la segunda escritura puede pisar la
primera— es el mismo que ya acepta `pushHistory()` con dos campeones coronados a la vez,
y por la misma razón: no vale la pena una transacción para un caso de colisión rarísimo
en una app de amigos.

`normAlias = norm(alias)` (el mismo `norm` que ya usa `aliasTaken`). El código: 4
caracteres de `ALFABETO_CODIGO` (el alfabeto sin caracteres que se confunden al dictar,
que ya usa `generarJoinCode()`), sin el prefijo `NOV-` — ese prefijo es de los códigos de
torneo, no de este registro.

```js
function generarCodigoAlias(){
  let s = '';
  for(let i=0;i<4;i++) s += ALFABETO_CODIGO[Math.floor(Math.random()*ALFABETO_CODIGO.length)];
  return s;
}
```

## Persistencia local

`localStorage['noventeros.misAlias']` = `{ [aliasNormalizado]: código }`, mismo patrón
try/catch vacío que `leerMisTorneos`/`guardarMisTorneos`:

```js
const LS_ALIAS = 'noventeros.misAlias';
function misAliasCodigos(){
  try{ return JSON.parse(localStorage.getItem(LS_ALIAS)) || {}; }
  catch(e){ return {}; }
}
function guardarAliasCodigo(alias, codigo){
  try{
    const m = misAliasCodigos();
    m[norm(alias)] = codigo;
    localStorage.setItem(LS_ALIAS, JSON.stringify(m));
  }catch(e){}
}
```

## Flujo de reclamo (alias nuevo, el caso común)

Sin cambio visible para el jugador: se inscribe como siempre, y por dentro la app nota
que el alias no está en `meta/aliases`, genera un código, lo guarda en el registro global
y en `localStorage`. El mensaje de éxito de la inscripción suma una línea con el código y
la aclaración de que no es una contraseña:

> ¡Inscripción confirmada! Nos vemos en la cancha.
> Guardá este código por si usás este alias desde otro dispositivo: **XYZ2** (no es una
> contraseña, solo evita que otro jugador use tu alias por error).

## Flujo de colisión (alias ya protegido, otro dispositivo)

Aquí es donde entra el drawer. Hasta ahora el único drawer que existe (`#drawer`,
`renderDrawerSorteo()`) es una notificación ambiente: aparece según el estado del torneo,
en cualquier vista, y no está atado a una acción puntual del jugador. Este caso es
distinto — es la respuesta directa a un intento de inscripción — pero la instrucción es
canalizarlo por el mismo mecanismo en vez de introducir un modal nuevo, así que `#drawer`
pasa a tener un despachador:

```js
let DRAWER_ALIAS = null;   // {tournamentId, alias, club, country} o null

function renderDrawer(){
  if(DRAWER_ALIAS) return renderDrawerAlias();
  renderDrawerSorteo();
}
```

`render()` llama `renderDrawer()` en vez de `renderDrawerSorteo()` directamente. Un
pedido de código (`DRAWER_ALIAS` no nulo) tiene prioridad sobre el aviso ambiente de
sorteo — mientras el jugador está resolviendo una inscripción bloqueada, no tiene sentido
taparle el drawer con un aviso de otro torneo.

`renderDrawerAlias()` pinta el alias en cuestión, un `<input>` para el código (los
estilos genéricos de `input` ya alcanzan, no hace falta CSS nuevo para el campo) y dos
botones, "Confirmar" y "Cancelar". "Cancelar" limpia `DRAWER_ALIAS` y vuelve a renderizar
— el formulario de inscripción, que nunca se tocó, sigue ahí con lo que el jugador había
escrito perdido (mismo costo que cualquier repintado de `render()`, aceptable: puede
volver a escribir su alias). "Confirmar" compara el código tipeado contra
`(await loadAliases())[norm(DRAWER_ALIAS.alias)]`:
- Coincide: `guardarAliasCodigo(...)`, se completa la inscripción con
  `intentarRegistro()` (ver abajo), se limpia `DRAWER_ALIAS`, se repinta.
- No coincide: error inline dentro del drawer mismo, sin límite de intentos — el drawer
  se queda abierto para reintentar.

CSS: la clase `.drawer-sorteo` se renombra a `.drawer-card` (el cascarón visual
compartido: el borde y el glow verde, porque los dos casos son "algo que necesita tu
atención ahora", MARCA.md §07/§08); el contenido interno de adentro es lo único que
cambia según cuál de los dos drawers está activo.

## Refactor: un solo camino para escribir el jugador

Hoy el submit del formulario de inscripción hace, en una sola función anónima: capturar
referencias del DOM, validar formato/duplicados, recargar el torneo fresco, y escribir.
Con el drawer, ese mismo "recargar fresco + re-chequear duplicados/cupo + escribir" tiene
que poder dispararse también desde la confirmación del código, sin repetir la lógica:

```js
async function intentarRegistro(tournamentId, {alias, club, country}){
  const fresh = await loadTournament(tournamentId);
  if(!fresh) return {ok:false, campo:null, error:'El torneo ya no existe.'};
  if(!hayCupo(fresh)) return {ok:false, campo:null, error:'Los cupos se llenaron justo ahora.'};
  if(aliasTaken(fresh, alias)) return {ok:false, campo:'alias', error:'Ese alias ya está tomado.'};
  if(clubTaken(fresh, club)) return {ok:false, campo:'club', error:'Ese club ya fue propuesto por otro jugador.'};
  if(countryTaken(fresh, country)) return {ok:false, campo:'country', error:'Ese país ya fue propuesto por otro jugador.'};
  fresh.players.push({id:uid(), alias, club, country, assignedTeam:null});
  await saveTournament(fresh);
  return {ok:true};
}
```

`intentarRegistro` solo re-valida lo que puede haber cambiado en Firestore mientras el
jugador escribía o buscaba su código (duplicados dentro del torneo, cupo). La validación
de formato — que el club/país exista en `INDEX.validTeams` (`findTeamMatch`) — sigue
viviendo en el handler del submit, antes de llegar acá: es una validación contra el
índice global, no contra el estado del torneo, así que no necesita recargarse.

El submit normal, tras las validaciones de formato, llama a `intentarRegistro`
directamente. Si el alias está libre en `meta/aliases` (o el dispositivo ya tiene su
código), el resultado se usa tal cual. Si el alias está tomado y el dispositivo no tiene
el código, el submit **no** llama a `intentarRegistro` todavía: guarda
`{tournamentId, alias, club, country}` en `DRAWER_ALIAS` y espera la confirmación del
drawer, que es quien finalmente llama a `intentarRegistro`.

Después de un `intentarRegistro` exitoso con un alias que no estaba en el registro
global, se lo reclama: `generarCodigoAlias()`, `saveAliases({...actual, [norm(alias)]:
codigo})`, `guardarAliasCodigo(alias, codigo)`. Esta escritura va **después** de que la
inscripción al torneo ya se guardó — si el reclamo del alias fallara (ej. se cortó la
conexión), el jugador ya quedó inscrito; en el peor caso alguien más podría reclamar ese
alias antes que él la próxima vez. Aceptable: es el mismo tipo de degradación suave que
ya tolera el resto del proyecto en vez de sumar transacciones.

## Fuera de alcance

- **Alias distintos entre torneos siguen sin relación forzada.** El registro solo impide
  que dos personas usen el *mismo* alias sin saber el código; no exige que un jugador use
  siempre el mismo alias.
- **No hay forma de "liberar" un alias** ni de recuperarlo si se perdió el código y el
  dispositivo. Se elige otro alias — el mismo costo que perder el `joinCode` de un
  torneo.
- **Ningún cambio a `meta/history` ni a `showHistory()`.** El registro le da sentido al
  salón de la fama existente sin tocarlo.

## Pruebas

- Nada de esto entra en el bloque de lógica pura de `app.js` de forma limpia:
  `intentarRegistro`, `loadAliases`/`saveAliases` y `guardarAliasCodigo` tocan Firestore o
  `localStorage`, igual que `leerMisTorneos`/`aliasTaken` ya no se prueban con
  `node tools/check-*.mjs`. `generarCodigoAlias()` sí es pura (igual que
  `generarJoinCode`) pero es una única línea de azar sin lógica que romper — no amerita
  un chequeo nuevo, mismo criterio que ya se aplicó a `generarJoinCode` (sin test propio
  en `check-invitacion.mjs`, que prueba `normCodigo`/`agregarTorneo` en cambio).
- `node tools/check-liga.mjs` y `node tools/check-invitacion.mjs` deben seguir pasando:
  esta rama no toca el bloque de lógica pura entre `function newId()` y
  `/* ---- bracket ---- */`, así que un chequeo roto ahí sería una regresión.
- Manual, con dos dispositivos: inscribirse con un alias nuevo en el dispositivo A (queda
  el mensaje con el código); inscribirse con el mismo alias en un torneo distinto desde
  el dispositivo B sin código a mano (aparece el drawer); código incorrecto (error
  inline, el drawer sigue abierto); código correcto (la inscripción se completa); volver
  a usar el mismo alias en el dispositivo A en un tercer torneo (no pide nada).

## Verificación para el roadmap

La verificación declarada ya sirve tal cual: `grep -n 'misAlias\|meta.,.aliases' app.js`
va a encontrar `LS_ALIAS`, `misAliasCodigos`, `guardarAliasCodigo`, y las llamadas
`fGet('meta','aliases')`/`fSet('meta','aliases', …)`.
