# A · Multi-torneo con código de invitación

Fecha: 2026-09-03 · Estado: spec, sin implementar

## Problema

`meta/config` es hoy un índice global: un `activeId` y **un** `adminPin` para todo el
mundo. Solo puede existir un torneo a la vez y solo hay un administrador posible. Eso
impide que cualquiera arme su propio torneo con sus amigos, que es lo que se busca.

Los sub-proyectos B (sorteo visible para todos), C (alias protegido) y D (notificaciones)
dependen de esto: los tres necesitan responder "¿de qué torneo hablamos y quién eres tú
en él?".

## Decisiones y su porqué

**El organizador tiene cuenta; el jugador no.** La fricción se paga donde rinde: hay un
organizador y muchos jugadores. Si el jugador borra los datos del navegador, vuelve a
pegar el código y no perdió nada. Si el organizador pierde el dispositivo, el torneo se
queda sin nadie que cargue marcadores ni corone campeón — y eso no lo arregla un código
guardado en el mismo lugar que se perdió.

**Google Sign-In, vía Firebase Auth.** Es otro módulo del mismo CDN de gstatic que ya
carga la app; no es una dependencia nueva. Un botón, sin contraseñas que resetear.
Requiere autorizar el dominio de GitHub Pages en la consola de Firebase, una vez.
La alternativa —usuario y código de recuperación hechos a mano— sería reescribir peor
lo que la plataforma ya da.

**Las reglas de Firestore siguen abiertas.** La cuenta existe para no perder el torneo,
no como seguridad. Cerrarlas a "solo el dueño escribe" es imposible sin romper la
inscripción: hoy el jugador hace `fresh.players.push(...)` y guarda el documento entero
con `saveTournament()`. Protegerlo obligaría a mover los jugadores a una subcolección, y
eso desarma `saveTournament`, el `onSnapshot`, el CSV y `computeStandings`. Es la misma
decisión consciente que ya documenta el README sobre el PIN.

**"Mis torneos" es una vista real, no un torneo único.** Un jugador puede pertenecer a
varios a la vez. Esto es lo que hace A más grande que el mínimo: `CURRENT` deja de ser
un singleton implícito.

## Modelo de datos

```
meta/config
  { validTeams: { clubs:[], countries:[] } }      <- ya no lleva tournaments/activeId/adminPin

tournaments/{id}
  { ...blankTournament(),
    ownerUid,      // uid de Firebase Auth del organizador
    ownerName,     // displayName, para mostrar "Organiza: Hares"
    joinCode }     // "NOV-4K2P" — compartible

localStorage
  misTorneos: [ { id, nombre, rol: 'admin'|'jugador' } ]
```

`joinCode`: prefijo `NOV-` más 4 caracteres de un alfabeto sin ambigüedades visuales
(sin `O`/`0`, sin `I`/`1`/`L`). Se genera al crear y no cambia.

Unirse por link: `?j=NOV-4K2P` en la URL. `boot()` lo lee, resuelve el torneo y lo
agrega a `misTorneos`. Como no hay índice global, la resolución código → id necesita una
consulta: `query(collection(db,'tournaments'), where('joinCode','==',code))`. Es la
primera consulta del proyecto — hasta ahora todo era `getDoc` por id.

## Flujos

**Organizador crea un torneo**
1. Entra a Admin → si no hay sesión, un solo botón "Entrar con Google".
2. Crea el torneo como hoy (`renderAdminTorneos`), y ahora se le graba `ownerUid`.
3. Ve la tarjeta de invitación: el `joinCode` grande, botón Copiar, y "Copiar link".

**Jugador se une**
1. Abre el link, o pega el código en la pantalla de inicio.
2. Se valida contra Firestore. Si existe, entra a `misTorneos` y se vuelve el torneo
   activo del dispositivo.
3. El botón "Inscribirme" queda habilitado. Sin código, no hay a qué inscribirse.

**Cambiar de torneo**
"Mis torneos" lista los que tengo cuyo `status !== 'finished'`, con su estado y quién
organiza. Tocar uno lo hace el activo.

## Qué se toca en el código

| Zona | Cambio |
|---|---|
| imports | agregar `firebase-auth.js` y `query/where/getDocs` de firestore |
| `loadIndex` | `meta/config` se reduce a `validTeams`; migrar el doc existente |
| `blankTournament` | agrega `ownerUid`, `ownerName`, `joinCode` |
| `renderAdmin` | el muro de PIN se reemplaza por el botón de Google |
| `renderHome` | entra el campo "Pegar código" y el acceso a "Mis torneos" |
| `renderAdminTorneos` | ya no lista todos los torneos: solo los del `ownerUid` |
| `boot` | leer `?j=` de la URL; elegir torneo activo desde `localStorage` |
| nuevo | `renderMisTorneos()`, `unirsePorCodigo()`, `generarJoinCode()` |
| `index.html` | la pestaña "Admin" pasa a "Mis torneos"; Admin aparece solo si eres organizador del torneo activo |

**No se tocan** `computeStandings`, `goleoTable`, `buildBracketFromGroups`,
`tryAdvanceBracket`, `renderGrupos`, `renderTabla`, `renderLlave` ni el CSV. Todos
siguen recibiendo un torneo y comportándose igual.

## Migración

No hay nada que migrar: los torneos existentes se borraron antes de empezar A
(confirmado 2026-09-03). Queda solo el saneo de `meta/config`, que todavía trae
`tournaments[]`, `activeId` y `adminPin`: al arrancar, `loadIndex()` conserva
`validTeams` y descarta el resto.

Esto elimina el concepto de "torneo heredado" que contemplaba el borrador de este spec:
todo torneo nace con `ownerUid`, sin caso de reclamo.

## Marca

Según `MARCA.md` §07 y §08:

- El `joinCode` es **información en reposo**: `.n4` sobre `--silver`, sin glow.
- El verde solo en el **momento** de copiar (confirmación breve), nunca como fondo fijo.
- "Mis torneos" reusa `.pill.live` para el torneo en inscripción — eso sí es estado.
- Nivel 01 (`.n1`) sigue apareciendo una sola vez por pantalla; la vista de códigos no
  compite con el wordmark.

## Verificación

No hay suite de pruebas y `app.js` no es importable desde node. `tools/check-liga.mjs`
extrae el bloque entre `function newId()` (línea 97) y `/* ---- bracket ---- */`
(línea 196) — **A no debe mover esos marcadores**; `blankTournament` vive justo en medio,
así que al agregarle campos hay que volver a correr `node tools/check-liga.mjs`.

Lo nuevo que sí es lógica pura y merece una comprobación: `generarJoinCode()` (alfabeto
sin ambigüedades, formato estable) puede probarse en el mismo bloque extraíble si se
define ahí dentro.

Prueba manual mínima, con dos navegadores:
1. A entra con Google, crea torneo, copia el código.
2. B abre el link en incógnito, se une, se inscribe.
3. A ve a B en la lista de inscritos sin recargar (`onSnapshot`).
4. B crea su propio torneo con otra cuenta; ninguno ve el torneo del otro en su lista.
5. Recargar el navegador de B: sigue en el torneo de A.

## Fuera de alcance

- Cuenta para el jugador (se resuelve en C con el alias protegido).
- Cerrar las reglas de Firestore.
- Transferir la organización de un torneo a otra persona.
- Borrar o archivar torneos ajenos.
