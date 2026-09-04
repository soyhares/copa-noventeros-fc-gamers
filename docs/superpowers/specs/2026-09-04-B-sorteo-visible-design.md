# B · Sorteo visible para todos — diseño

**Fecha:** 2026-09-04 · **Depende de:** A (multi-torneo con código de invitación)

## Problema

Hoy la animación del sorteo la ve una sola persona: el admin, en el momento en que
la dispara desde `renderAdminSorteos`. El jugador entra después y se encuentra con los
grupos ya formados, sin enterarse de nada. El sorteo es el momento más divertido del
torneo y se lo pierde todo el mundo menos quien aprieta el botón.

## Idea

Sorteo **reproducido**, no en vivo. El resultado ya está en Firestore; el jugador lo ve
animado cuando entra. No hay sincronización, no hay "sala de espera", no hay estado
compartido de reproducción: cada quien ve la película cuando abre la app.

## Decisión de fondo: el resultado se deriva, no se guarda

Todo lo necesario para reproducir el sorteo **ya está en el documento del torneo**:

| Etapa | Fuente | Qué aporta |
|---|---|---|
| Equipos | `t.drawnTeams` | los equipos elegidos, en el orden en que salieron |
| Asignación | `t.players[].assignedTeam` | qué equipo le tocó a cada jugador |
| Grupos | `t.groups[L]` | el orden dentro de cada grupo |

El "pool" que alimenta el efecto ruleta se deriva de `t.players` (club + país de cada
uno). El orden intercalado con que aparecen los jugadores al formar grupos se reconstruye:
`groups[L][k]` salió en el paso `k * nGrupos + índice(L)`.

**Cero campos nuevos, cero migración, cero riesgo de arrays anidados.** Se descartaron
dos alternativas: guardar un `t.drawLog` explícito (campo nuevo, escribe más, es la clase
de estructura que ya explotó una vez con "nested arrays", y los torneos viejos igual
necesitarían la derivación como fallback) y un flag `soloAnimar` dentro de las funciones
actuales (diff mínimo pero deja tres funciones con dos modos entrelazados con los
`await saveTournament` en el medio).

## Arquitectura

### 1 · Partición decide / pinta

Cada `runDrawX` se parte en tres piezas. Las que deciden y las que pintan quedan puras:
ninguna toca Firestore.

```
sortearEquipos(t, pool)  → [labels]                animarEquipos(holder, pool, elegidos)
sortearAsignacion(t)     → {pid: equipo}           animarAsignacion(holder, t, asignacion)
sortearGrupos(t)         → {groups, groupMatches}  animarGrupos(holder, t, groups)
```

`runDrawTeams` / `runDrawAssign` / `runDrawGroups` sobreviven como wrappers de tres
líneas (sortear → animar → guardar), así los `onclick` de `renderAdminSorteos` no cambian.

### 2 · Helpers de derivación

Lo que el jugador usa en lugar de `sortearX`:

- `poolDe(t)` → `[{label, type}]` a partir de club y país de cada jugador
- `asignacionDe(t)` → `{pid: equipo}` a partir de `p.assignedTeam`
- `etapasSorteadas(t)` → `['equipos','asignacion','grupos']` recortado a las que ya existen
- `ordenGrupos(groups)` → la secuencia intercalada `[{L, pid}]` de aparición

Los cuatro viven **dentro del bloque de lógica pura** de `app.js` (entre `function newId()`
y el marcador `/* ---- bracket ---- */`), para que `tools/check-sorteo.mjs` los pruebe con
el mismo truco que `check-liga.mjs`. `ordenGrupos` es el único con un bucle que puede salir
mal; es el que justifica el test.

### 3 · El reproductor

```
reproducirSorteo(holder, t, desde = 0)
```

Corre las etapas de `etapasSorteadas(t).slice(desde)` en secuencia continua; cada etapa
reemplaza la pantalla anterior, como ya hace el admin hoy. Levanta `ANIMANDO` al empezar
y lo baja en un `finally`, donde además llama `render()` para volver al estado fresco.

Es el mismo reproductor para el admin y para el jugador.

### 4 · Pestaña Sorteo

Se agrega `['sorteo','Sorteo']` al final de `tabs` en `renderTournament`, **solo si
`etapasSorteadas(t).length > 0`**: antes del sorteo la pestaña no existe. Mismo guard que
ya tiene `llave`: si `SUBVIEW_TOURN === 'sorteo'` y no hay etapas, cae a `'grupos'`.

Adentro, un botón "Ver sorteo" / "Repetir sorteo" que reproduce **desde cero**. Si se llegó
por el drawer, arranca solo y **solo desde lo que no se vio**, vía un `AUTOPLAY_DESDE` a
nivel de módulo que se limpia al usarse.

### 5 · El drawer

Un `<div id="drawer">` en `index.html`, entre `</main>` y el `<nav class="tabbar">`,
repintado al final de `render()` para que sobreviva el cambio de vista. Fijo abajo, sobre
el tabbar.

Aparece cuando `etapasSorteadas(t).length > visto[t.id]`, leyendo
`localStorage['noventeros.sorteoVisto']` = `{ [idTorneo]: nEtapasVistas }`.

Dos salidas, las dos marcan visto = total:

- **"Ver sorteo"** → fija `AUTOPLAY_DESDE` en el valor visto anterior, navega a
  Torneo → Sorteo y reproduce.
- **X** → se cierra y no vuelve. Queda el botón permanente en la pestaña.

Los tres `runDrawX` marcan visto = total al terminar, para que al admin no le salte el
aviso de un sorteo que acaba de mirar.

### 6 · Guard del listener

Hoy anima solo el admin, que es quien escribe. Si anima el jugador, cualquier marcador que
cargue otro dispara `onSnapshot` → `render()` → le corta la película a la mitad.

En `attachTournamentListener`:

```js
if (isTypingNow()) return;
CURRENT = snap.exists() ? snap.data() : null;
if (ANIMANDO) return;   // no repintar encima de la animación
render();
```

`CURRENT` se actualiza igual; solo se posterga el repintado, y el `finally` de
`reproducirSorteo` lo dispara al terminar. Mismo cambio en `attachIndexListener`.

### 7 · Velocidad de grupos

En `animarGrupos`, `Math.max(40, 220 - shuffled.length * 8)` se borra: 220 ms fijo para
los dos modos. Hoy una Liga de 24 jugadores corre a 40 ms por jugador, que es ilegible.
Es menos código y arregla el problema que señala el roadmap.

## Fuera de alcance

- **Botón de saltar la animación.** Cambiar de pestaña ya la corta y las pestañas nunca
  desaparecen durante la reproducción.
- **Cualquier campo nuevo en Firestore.** La derivación cubre las tres etapas.
- **Sorteo en vivo sincronizado.** Explícitamente no es esto: no hay estado compartido de
  reproducción.

## Pruebas

- `tools/check-sorteo.mjs` (nuevo): `etapasSorteadas` con torneos en las cuatro fases,
  `ordenGrupos` contra el intercalado esperado en Copa (varios grupos) y en Liga (grupo
  único), `poolDe` y `asignacionDe` sobre un torneo de ejemplo.
- `node tools/check-liga.mjs` y `node tools/check-invitacion.mjs` deben seguir pasando: los
  helpers nuevos entran en el mismo bloque que ellos recortan, así que un error de sintaxis
  ahí los rompe a los tres.
- Manual: dos dispositivos, uno como organizador y otro como jugador con `joinCode`. El
  organizador corre la etapa 1; al jugador le aparece el drawer, ve la animación, y el
  drawer no vuelve. El organizador corre la etapa 2; el drawer reaparece y reproduce solo
  la etapa 2. Cargar un marcador desde el otro dispositivo mientras la animación corre no
  debe cortarla.

## Verificación para el roadmap

La línea actual (`grep -n 'runDrawGroups\|runDrawTeams' app.js` — si solo se llaman desde
`renderAdminSorteos`, B no está hecho) queda falsa: esas funciones siguen viviendo en el
admin por diseño. Se reemplaza por:

> `grep -n 'reproducirSorteo' app.js` debe mostrarla llamada desde la pestaña del jugador,
> no solo desde admin. Más `node tools/check-sorteo.mjs`.
