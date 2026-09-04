# D · Notificaciones sin infraestructura — diseño

**Fecha:** 2026-09-04 · **Depende de:** A (multi-torneo con código de invitación)

## Problema

Hoy la única forma de enterarse de un resultado o un avance de fase es tener la app
abierta en la pestaña correcta cuando `onSnapshot` repinta. Si el jugador cierra la app,
o la deja en segundo plano, o directamente no la abrió en todo el día, no se entera de
nada hasta que entra a mirar. Tampoco hay ningún aviso si el organizador borra el torneo:
otros dispositivos con ese torneo activo simplemente ven `CURRENT=null` sin explicación.

## Idea

Un único motor de diff, reusado por tres capas de aviso (según estén mirando la app, en
segundo plano, o recién vuelven) y por el caso de borrado. Nada de infraestructura nueva:
todo corre sobre el `onSnapshot` que ya existe, comparando la snapshot actual contra la
última que ese dispositivo vio.

Alcance: avisa a **todos los inscritos por igual, organizador incluido si se registró
como jugador** (el organizador administra, pero solo se vuelve destinatario de avisos si
se inscribió con un alias — igual que cualquier otro jugador). Cubre marcadores y avances
de fase **hasta que hay campeón**; pasado ese punto el torneo dejó de generar noticias.

## Motor de diff

```js
// anterior: snapshot resumida guardada la última vez (o null si es la primera vez que
// este dispositivo mira este torneo). actual: t tal cual llega de Firestore, o
// undefined si el documento ya no existe (torneo borrado).
function diffTorneo(anterior, actual) {
  // devuelve una lista de eventos, en el orden en que conviene mostrarlos:
  // {tipo:'torneo_eliminado', nombre}
  // {tipo:'resultado', j1, j2, s1, s2}
  // {tipo:'fase', de, a}
  // {tipo:'campeon', nombre}
}
```

- **`resultado`**: cualquier partido de `groupMatches[*]` o de
  `bracket.rounds[*].partidos` que pasó de `played:false` a `played:true` entre
  `anterior` y `actual`. Sin distinguir si el que mira participó — todos ven todo, como
  se pidió. Los partidos de bracket no tienen `id` propio; se identifican por
  `(ronda, índice)`, estable porque las rondas solo se agregan, nunca se reordenan.
- **`fase`**: `actual.status !== anterior.status`.
- **`campeon`**: `actual.champion` está seteado y `anterior.champion` no lo estaba.
- **`torneo_eliminado`**: `actual` es `undefined` (el doc ya no existe) y
  `anterior.status !== 'finished'`. Si `anterior` ya era `finished`, borrar es limpieza
  normal — no dispara nada. Este evento, cuando aparece, es el único de la lista: no
  tiene sentido diffear resultados de un torneo que ya no existe.
- Si `anterior` es `null` (primera vez que este dispositivo ve el torneo, torneo recién
  unido) no se genera ningún evento — no hay "novedades" sin una base previa.

`diffTorneo` es lógica pura (dos snapshots → lista de eventos), sin tocar Firestore ni el
DOM. Vive en el mismo bloque pure-logic que ya recorta `tools/check-liga.mjs` /
`tools/check-invitacion.mjs` (entre `newId()` y el marcador `/* ---- bracket ---- */`, o
el que corresponda una vez ubicada).

## Persistencia del "último visto"

Mismo patrón que `sorteoVisto`/`misAlias`: una entrada por torneo en `localStorage`, con
la snapshot resumida (no el documento entero — alcanza con lo que `diffTorneo` necesita
comparar: `status`, `champion`, y por cada partido su `played`/`s1`/`s2`).

```js
const LS_NOVEDADES = 'noventeros.novedadesVisto';
function novedadesVisto(){ /* lee y parsea, {} si falta o está corrupto */ }
function resumenTorneo(t){ /* proyecta t a lo que diffTorneo necesita */ }
function marcarNovedadesVisto(t){ /* guarda resumenTorneo(t) bajo t.id */ }
```

A diferencia del drawer de sorteo (que exige tocar "Ver" o la ✕ para marcar visto), acá
no hace falta un gesto aparte: **mostrar el evento ya cuenta como visto**. Apenas
`diffTorneo` corre y produce la lista (para cualquiera de las tres capas), se guarda la
nueva snapshot. Esto simplifica la capa 2 en particular: no hay que esperar a que el
usuario abra la notificación del navegador para dejar de repetirla.

## Las tres capas + borrado

Una sola llamada a `diffTorneo` dentro de `attachTournamentListener`, disparada en cada
`onSnapshot`, alimenta todo:

- **Visible** (`document.visibilityState==='visible'`): cada evento nuevo se apila como
  un toast.
- **Segundo plano** (`hidden`, con permiso concedido): los mismos eventos van a
  `registration.showNotification()` en vez de al toast. Sin FCM: depende de que la
  pestaña siga viva para que el propio `onSnapshot` del cliente dispare el aviso — límite
  conocido y documentado en el roadmap, no hay arreglo sin infraestructura (en iOS el
  navegador suspende el JS de fondo rápido).
- **Recién abierto** (no había snapshot en memoria — recarga, o primera vez en la
  sesión que se entra a ese torneo): se diffea `actual` contra lo guardado en
  `localStorage` y el lote completo entra como toasts de una sola vez.
- **Borrado**: en cualquiera de las tres capas, si el evento es `torneo_eliminado`, además
  de mostrarlo se saca esa entrada de `leerMisTorneos()` en el momento — no queda un
  torneo fantasma que nunca vuelve a cargar. Si era el torneo activo
  (`torneoActivoId()===t.id`), se cae al mismo camino que ya usa el botón "Eliminar" del
  admin (activar el siguiente de la lista, o ninguno).

## UI de toasts

Nuevo contenedor `#toasts` en `index.html`, fuera de `#main` (como `#drawer`, para
sobrevivir cambios de vista). Pila simple: cada evento entra como una tarjeta chica,
auto-desaparece a los ~5s, un click la saca antes y navega a la subpestaña relevante
(`grupos`/`bracket`/`sorteo` según el tipo de evento; `torneo_eliminado` no navega a
ningún lado, la entrada ya no existe).

No reutiliza `#drawer`: ese ya tiene dueño (aviso de sorteo + pedido de código de alias,
sub-proyectos B y C) y es de un solo slot con reemplazo; esto necesita apilar varios
eventos a la vez cuando llegan juntos (por ejemplo, al reabrir después de perderse varios
resultados).

## Permiso de notificaciones (capa 2)

Se pide `Notification.requestPermission()` en el mismo click con que se confirma la
inscripción — cubre tanto al jugador como al organizador-que-también-se-inscribe-como-
jugador, sin un flujo separado para cada rol. Si el navegador no soporta
`Notification`/`serviceWorker`, o el usuario rechaza el permiso, la capa 2 simplemente no
dispara nada; las capas 1 y 3 no dependen de este permiso y siguen funcionando igual.

## Apagado natural

Una vez `t.status==='finished'`, `diffTorneo` no genera más eventos de `resultado` ni
`fase` para ese torneo (no puede haberlos: el estado ya no cambia). El evento `campeon`
es, por construcción, el último que se muestra.

## Testing

`diffTorneo` es la única pieza con lógica de ramificación real. Se agrega
`node tools/check-novedades.mjs`, mismo mecanismo que los checks existentes: recorta el
bloque pure-logic de `app.js` y corre estos casos —

- snapshot idéntica → `[]`
- un partido de grupo pasa a jugado → un evento `resultado`
- dos partidos de bracket en rondas distintas pasan a jugados en el mismo diff → dos
  eventos `resultado`, uno por cada uno
- `status` cambia → evento `fase`
- `champion` aparece → evento `campeon`, y ningún evento de `fase`/`resultado` después
- `anterior` no nulo con `status!=='finished'` y `actual` `undefined` → un único evento
  `torneo_eliminado`, sin nada más en la lista
- `anterior.status==='finished'` y `actual` `undefined` → `[]` (limpieza normal, no
  noticia)
- `anterior` nulo (primera vez) → `[]` sin importar qué traiga `actual`

Mover el marcador de recorte del pure-logic block rompe este check tan silenciosamente
como rompe a los otros dos — mismo trato, sin excepción.
