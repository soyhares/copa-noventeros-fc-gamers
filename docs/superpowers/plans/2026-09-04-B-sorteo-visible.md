# B · Sorteo visible para todos — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el jugador vea el sorteo animado cuando entra a la app, no solo el admin que aprieta el botón.

**Architecture:** Cada `runDrawX` se parte en `sortearX()` (decide, puro) + `animarX()` (pinta, puro). El resultado que el jugador reproduce se **deriva del documento del torneo que ya está en Firestore** — `drawnTeams`, `players[].assignedTeam`, `groups` — así que no hay campos nuevos ni migración. Un drawer fijo abajo avisa de cada etapa nueva y lleva a una subpestaña `Sorteo` que reproduce lo que falta ver. Un flag `ANIMANDO` evita que `onSnapshot` repinte encima de la animación.

**Tech Stack:** HTML/CSS/JS sin build ni framework. Firebase 10.13.2 desde el CDN de gstatic como módulos ES. Pruebas: `node` a secas con `node:assert/strict`.

**Spec:** [`docs/superpowers/specs/2026-09-04-B-sorteo-visible-design.md`](../specs/2026-09-04-B-sorteo-visible-design.md)

## Global Constraints

- **Cero campos nuevos en Firestore.** El resultado del sorteo se deriva de `t.drawnTeams`, `t.players[].assignedTeam` y `t.groups`. Si en algún momento parece que hace falta guardar algo para reproducir, es que la derivación está mal: revisar, no agregar el campo.
- **Todo va en `app.js`.** No crear módulos nuevos ni introducir framework, vdom o librería de estado. `render()` despacha sobre el global `VIEW` y repinta la vista entera con `innerHTML`; los handlers se asignan después con `el.onclick = …`. Seguir ese patrón.
- **Sin dependencias nuevas.** Nada de librerías de animación ni de bottom-sheet: CSS `position:fixed` y `setTimeout`, que es lo que ya usa el proyecto.
- **Español para todo lo que ve el usuario.** Identificadores del código en inglés, salvo los que ya existen en español en este archivo (`conCarga`, `esLiga`) — los nuevos siguen esa misma mezcla ya establecida.
- **No mover los marcadores `function newId()` (línea 152) ni `/* ---- bracket ---- */` (línea 279)** de `app.js`: `tools/check-liga.mjs`, `tools/check-invitacion.mjs` y el nuevo `tools/check-sorteo.mjs` recortan el bloque entre ambos para poder evaluarlo en node.
- **No envolver `fSet`/`fDelete` en try/catch que devuelva `false`.** Deben propagar el error.
- **`t.bracket.rounds` es `[{partidos:[…]}, …]`**, nunca un array de arrays. Este plan no toca bracket, pero si algo lo roza: ningún array puede vivir directamente dentro de otro array.
- **Marca (`MARCA.md` §07, §08):** el neon verde marca *estado o momento*, nunca decora una superficie en reposo. El drawer anuncia un evento que acaba de pasar → verde permitido. La tarjeta de la pestaña `Sorteo` en reposo → `--silver`/`--muted`, sin glow.
- Tras cada tarea que cambie `app.js`, correr **las tres**: `node tools/check-liga.mjs`, `node tools/check-invitacion.mjs` y (desde la Tarea 1) `node tools/check-sorteo.mjs`. Las tres recortan el mismo bloque, así que un error de sintaxis ahí las rompe juntas.

---

### Task 1: Helpers puros de derivación

Las cuatro funciones que traducen "lo que está guardado" a "lo que hay que animar". Van **dentro del bloque de lógica pura** para que se puedan probar en node; es la única parte de B con test automático.

**Files:**
- Modify: `app.js:278` — insertar justo **antes** de la línea `/* ---- bracket ---- */`, después de la última función del bloque puro
- Create: `tools/check-sorteo.mjs`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `poolDe(t) -> Array<{label: string, type: 'club'|'country'}>` — el pool de equipos propuestos, dos por jugador.
  - `asignacionDe(t) -> {[playerId: string]: string}` — jugador → equipo asignado; omite a quien no tenga.
  - `etapasSorteadas(t) -> Array<'equipos'|'asignacion'|'grupos'>` — las etapas ya sorteadas, en orden, recortada a lo que existe.
  - `ordenGrupos(groups) -> Array<{grupo: string, id: string}>` — la secuencia intercalada en que los jugadores cayeron en los grupos.

- [ ] **Step 1: Escribir el test que falla**

Crear `tools/check-sorteo.mjs`:

```js
// Chequeo de la derivación del sorteo. Corre con: node tools/check-sorteo.mjs
//
// Mismo truco que check-liga.mjs: app.js es un módulo de navegador y no se puede importar
// desde node, así que se recorta el bloque de funciones puras (entre `function newId()` y
// el marcador `/* ---- bracket ---- */`) y se evalúa. Si alguien mueve esos límites, falla.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const src = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const desde = src.indexOf('function newId()');
const hasta = src.indexOf('/* ---- bracket ---- */');
assert.ok(desde > 0 && hasta > desde, 'no se encontró el bloque de lógica pura en app.js');

const { poolDe, asignacionDe, etapasSorteadas, ordenGrupos } =
  await import('data:text/javascript,' + encodeURIComponent(
    src.slice(desde, hasta) +
    '\nexport { poolDe, asignacionDe, etapasSorteadas, ordenGrupos };'
  ));

const jugador = (i, equipo) => ({ id:'p'+i, alias:'J'+i, club:'Club'+i, country:'Pais'+i, assignedTeam: equipo });

/* ---- poolDe: dos equipos propuestos por jugador ---- */
const t2 = { players:[jugador(0), jugador(1)] };
assert.equal(poolDe(t2).length, 4, 'cada jugador aporta club y país al pool');
assert.deepEqual(poolDe(t2)[0], {label:'Club0', type:'club'}, 'primero el club');
assert.deepEqual(poolDe(t2)[1], {label:'Pais0', type:'country'}, 'después el país');
assert.deepEqual(poolDe({}), [], 'un torneo sin players no rompe el pool');

/* ---- asignacionDe ---- */
assert.deepEqual(asignacionDe({players:[jugador(0,'Milan'), jugador(1,'Boca')]}),
  {p0:'Milan', p1:'Boca'}, 'mapea jugador a equipo asignado');
assert.deepEqual(asignacionDe({players:[jugador(0,'Milan'), jugador(1)]}),
  {p0:'Milan'}, 'omite al jugador sin equipo asignado');

/* ---- etapasSorteadas: acumulativa, en orden ---- */
const enInscripcion = { drawnTeams:[], players:[jugador(0)], groups:null };
assert.deepEqual(etapasSorteadas(enInscripcion), [], 'sin sorteo no hay etapas');
assert.deepEqual(etapasSorteadas({...enInscripcion, drawnTeams:['Milan','Boca']}),
  ['equipos'], 'con drawnTeams ya va la etapa 1');
assert.deepEqual(etapasSorteadas({drawnTeams:['Milan'], players:[jugador(0,'Milan')], groups:null}),
  ['equipos','asignacion'], 'todos con equipo asignado suma la etapa 2');
assert.deepEqual(etapasSorteadas({drawnTeams:['Milan'], players:[jugador(0,'Milan')], groups:{L:['p0']}}),
  ['equipos','asignacion','grupos'], 'con groups van las tres');
assert.deepEqual(etapasSorteadas({drawnTeams:['Milan'], players:[jugador(0,'Milan'), jugador(1)], groups:null}),
  ['equipos'], 'si a uno le falta equipo, la etapa 2 no cuenta');
assert.deepEqual(etapasSorteadas(null), [], 'sin torneo no hay etapas');

/* ---- ordenGrupos: reconstruye el reparto round robin ---- */
// runDrawGroups reparte el jugador i en letters[i % nLetras]: A,B,A,B,A,B…
const dosGrupos = { A:['p0','p2','p4'], B:['p1','p3','p5'] };
assert.deepEqual(ordenGrupos(dosGrupos).map(x=>x.id),
  ['p0','p1','p2','p3','p4','p5'], 'devuelve el orden original de aparición');
assert.deepEqual(ordenGrupos(dosGrupos).map(x=>x.grupo),
  ['A','B','A','B','A','B'], 'alterna de grupo en grupo');

// Grupos desparejos: el último ciclo queda incompleto y no debe inventar entradas.
assert.deepEqual(ordenGrupos({ A:['p0','p2'], B:['p1'] }).map(x=>x.id),
  ['p0','p1','p2'], 'un grupo más corto no rompe ni duplica');

// Liga: grupo único, el orden es el de la lista tal cual.
assert.deepEqual(ordenGrupos({ L:['p2','p0','p1'] }).map(x=>x.id),
  ['p2','p0','p1'], 'la liga es un solo grupo, sin intercalado');

// El orden de las letras no puede depender de cómo Firestore devolvió el mapa.
assert.deepEqual(ordenGrupos({ B:['p1'], A:['p0'] }).map(x=>x.grupo),
  ['A','B'], 'las letras se recorren ordenadas, no en orden de inserción');

assert.deepEqual(ordenGrupos({}), [], 'sin grupos no hay secuencia');

console.log('✓ derivación del sorteo OK');
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node tools/check-sorteo.mjs`
Expected: FAIL con un `SyntaxError` sobre `poolDe` (o similar) al exportar funciones que todavía no existen en el bloque.

- [ ] **Step 3: Escribir la implementación mínima**

En `app.js`, insertar justo **antes** de la línea `/* ---- bracket ---- */`:

```js
/* ---- sorteo: derivación del resultado guardado ---- */
// El sorteo se reproduce desde lo que ya está en el torneo — no hay campos extra en
// Firestore. Estas cuatro traducen "lo guardado" a "lo que hay que animar".

// Los equipos propuestos: club y país de cada inscrito. Es lo que gira en la ruleta
// antes de que cada casillero aterrice en el equipo que salió sorteado.
function poolDe(t){
  const pool = [];
  ((t && t.players) || []).forEach(p => {
    pool.push({label:p.club, type:'club'});
    pool.push({label:p.country, type:'country'});
  });
  return pool;
}

function asignacionDe(t){
  const a = {};
  ((t && t.players) || []).forEach(p => { if(p.assignedTeam) a[p.id] = p.assignedTeam; });
  return a;
}

// El admin corre las tres etapas en orden y en momentos distintos, así que esto siempre
// devuelve un prefijo: nunca 'grupos' sin 'equipos'.
function etapasSorteadas(t){
  if(!t) return [];
  const e = [];
  if(t.drawnTeams && t.drawnTeams.length) e.push('equipos');
  if(t.players && t.players.length && t.players.every(p => p.assignedTeam)) e.push('asignacion');
  if(t.groups) e.push('grupos');
  return e;
}

// runDrawGroups reparte al jugador i en letters[i % nLetras], así que groups[L][k] salió
// en el paso k*nLetras + índice(L). Recorrer k por fuera y las letras por dentro devuelve
// esa misma secuencia, que es lo que hace que la reproducción se vea igual al sorteo.
// Las letras se ordenan: Firestore no garantiza el orden de las claves de un mapa.
function ordenGrupos(groups){
  const letras = Object.keys(groups || {}).sort();
  const salida = [];
  const largo = Math.max(0, ...letras.map(L => groups[L].length));
  for(let k = 0; k < largo; k++){
    for(const L of letras){
      if(k < groups[L].length) salida.push({grupo:L, id:groups[L][k]});
    }
  }
  return salida;
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `node tools/check-sorteo.mjs && node tools/check-liga.mjs && node tools/check-invitacion.mjs`
Expected: PASS — imprime `✓ derivación del sorteo OK`, `✓ lógica de liga OK` y la línea de check-invitacion.

- [ ] **Step 5: Commit**

```bash
git add app.js tools/check-sorteo.mjs
git commit -m "B · helpers de derivación del sorteo + su chequeo"
```

---

### Task 2: Partir decidir de animar

Refactor puro: el admin tiene que seguir sorteando **exactamente igual** después de esta tarea. Lo único que cambia de comportamiento es la velocidad de grupos.

**Files:**
- Modify: `app.js:917-1010` — reemplazar el cuerpo de `runDrawTeams`, `runDrawAssign` y `runDrawGroups`
- Modify: `app.js:41-43` — agregar el global `ANIMANDO` junto a `VIEW` / `SUBVIEW_TOURN`

**Interfaces:**
- Consumes: `ordenGrupos(groups)` de la Tarea 1. `shuffle`, `esLiga`, `roundRobinPairs`, `playerName`, `esc`, `loadTournament`, `saveTournament`, `renderAdmin` ya existen.
- Produces:
  - `let ANIMANDO` — global, `true` mientras corre una animación.
  - `conAnimacion(fn) -> Promise<void>` — levanta `ANIMANDO`, corre `fn`, lo baja en un `finally`.
  - `sortearEquipos(t, pool) -> string[]` — los labels elegidos, en el orden en que salen.
  - `sortearAsignacion(t) -> {[pid]: string}`
  - `sortearGrupos(t) -> {groups: {[L]: string[]}, groupMatches: {[L]: object[]}}`
  - `animarEquipos(holder, pool, elegidos) -> Promise<void>`
  - `animarAsignacion(holder, t, asignacion) -> Promise<void>`
  - `animarGrupos(holder, t, groups) -> Promise<void>`

- [ ] **Step 1: Agregar el global y el helper**

En `app.js`, junto a `let SUBVIEW_TOURN = 'grupos';` (línea 43):

```js
// Mientras una animación de sorteo corre, onSnapshot no debe repintar y borrarla.
// Antes no hacía falta: solo animaba el admin, que era justo quien escribía.
let ANIMANDO = false;
async function conAnimacion(fn){
  ANIMANDO = true;
  try { await fn(); } finally { ANIMANDO = false; }
}
```

- [ ] **Step 2: Reemplazar las tres `runDrawX` por sortear + animar + wrapper**

En `app.js`, reemplazar el bloque entero de `async function runDrawTeams` hasta el final de `runDrawGroups` (justo antes del comentario `// El código es información en reposo…`) por:

```js
/* ---- sorteo: decidir ---- */
// Puras: deciden el resultado y no tocan Firestore ni el DOM.

function sortearEquipos(t, pool){
  return shuffle(pool).slice(0, t.size).map(c => c.label);
}

function sortearAsignacion(t){
  const teams = shuffle(t.drawnTeams);
  const asignacion = {};
  t.players.forEach((p, i) => asignacion[p.id] = teams[i]);
  return asignacion;
}

function sortearGrupos(t){
  // La liga es un grupo único 'L' con todos los jugadores; el sorteo solo define el
  // orden de la tabla inicial y el del calendario.
  const liga = esLiga(t);
  const letters = liga ? 'L' : 'ABCDEFGH'.slice(0, t.size/4);
  const shuffled = shuffle(t.players.map(p => p.id));
  const groups = {};
  letters.split('').forEach(L => groups[L] = []);
  shuffled.forEach((id, i) => groups[letters[i % letters.length]].push(id));

  const groupMatches = {};
  for(const key in groups){
    let pares = roundRobinPairs(groups[key]);
    if(liga && t.vuelta) pares = [...pares, ...pares.map(([a,b]) => [b,a])];
    groupMatches[key] = pares.map(([p1,p2], i) => ({id:key+'-'+i, p1, p2, s1:null, s2:null, played:false}));
  }
  return { groups, groupMatches };
}

/* ---- sorteo: animar ---- */
// Puras de pintura: reciben el resultado ya decidido y no tocan Firestore. El admin las
// llama con lo que acaba de sortear; el jugador, con lo que derivó del documento.

async function animarEquipos(holder, pool, elegidos){
  holder.innerHTML = `<div class="card"><b>Sorteando equipos…</b><div id="slots" style="margin-top:12px;"></div></div>`;
  const slotsEl = holder.querySelector('#slots');
  for(let i = 0; i < elegidos.length; i++){
    const div = document.createElement('div');
    div.className = 'draw-slot rolling';
    div.textContent = '???';
    slotsEl.appendChild(div);
    let ticks = 0;
    await new Promise(res => {
      const iv = setInterval(() => {
        div.textContent = shuffle(pool)[0].label;
        ticks++;
        if(ticks > 8){ clearInterval(iv); div.textContent = elegidos[i]; div.className = 'draw-slot landed'; res(); }
      }, 70);
    });
  }
}

async function animarAsignacion(holder, t, asignacion){
  holder.innerHTML = `<div class="card"><b>Asignando equipos…</b><div id="flips" style="margin-top:12px;"></div></div>`;
  const flipsEl = holder.querySelector('#flips');
  for(const p of t.players){
    const card = document.createElement('div');
    card.className = 'flip-card';
    card.innerHTML = `<div class="alias">${esc(p.alias)}</div><div class="team">${esc(asignacion[p.id])}</div>`;
    flipsEl.appendChild(card);
    await new Promise(r => setTimeout(r, 120));
    card.classList.add('revealed');
    await new Promise(r => setTimeout(r, 280));
  }
}

async function animarGrupos(holder, t, groups){
  const liga = esLiga(t);
  const letras = Object.keys(groups).sort();
  holder.innerHTML = `<div class="card"><b>${liga?'Generando calendario…':'Formando grupos…'}</b><div class="group-cols" id="gcols" style="flex-wrap:wrap;margin-top:12px;"></div></div>`;
  const gcols = holder.querySelector('#gcols');
  const colEls = {};
  letras.forEach(L => {
    const col = document.createElement('div');
    col.className = 'group-col';
    col.style.minWidth = '120px';
    if(liga) col.style.flex = '1 1 100%';
    col.innerHTML = `<h4>${liga?'Liga':'Grupo '+L}</h4><div class="slots"></div>`;
    gcols.appendChild(col);
    colEls[L] = col.querySelector('.slots');
  });
  for(const {grupo, id} of ordenGrupos(groups)){
    const slot = document.createElement('div');
    slot.className = 'slot';
    slot.textContent = playerName(t, id);
    colEls[grupo].appendChild(slot);
    // 220ms fijo para los dos modos: el cálculo viejo bajaba hasta 40ms por jugador en
    // ligas grandes y no se leía nada.
    await new Promise(r => setTimeout(r, 220));
    slot.classList.add('in');
  }
}

/* ---- sorteo: los tres pasos del admin ---- */
// Deciden, animan y guardan. Marcan el sorteo como visto para que el aviso no le salte
// a quien lo acaba de mirar en vivo.

async function runDrawTeams(t, pool, holder){
  const elegidos = sortearEquipos(t, pool);
  await conAnimacion(() => animarEquipos(holder, pool, elegidos));
  const fresh = await loadTournament(t.id);
  fresh.drawnTeams = elegidos;
  fresh.status = 'drawn';
  await saveTournament(fresh);
  CURRENT = fresh;
  marcarSorteoVisto(fresh);
  setTimeout(() => renderAdmin(), 500);
}

async function runDrawAssign(t, holder){
  const asignacion = sortearAsignacion(t);
  await conAnimacion(() => animarAsignacion(holder, t, asignacion));
  const fresh = await loadTournament(t.id);
  fresh.players.forEach(p => p.assignedTeam = asignacion[p.id]);
  await saveTournament(fresh);
  CURRENT = fresh;
  marcarSorteoVisto(fresh);
  setTimeout(() => renderAdmin(), 500);
}

async function runDrawGroups(t, holder){
  const { groups, groupMatches } = sortearGrupos(t);
  await conAnimacion(() => animarGrupos(holder, t, groups));
  const fresh = await loadTournament(t.id);
  fresh.groups = groups;
  fresh.groupMatches = groupMatches;
  fresh.status = 'groups';
  await saveTournament(fresh);
  CURRENT = fresh;
  marcarSorteoVisto(fresh);
  setTimeout(() => renderAdmin(), 600);
}
```

`marcarSorteoVisto` todavía no existe — se crea en la Tarea 4. Hasta entonces la app va a
tirar `ReferenceError` al terminar un sorteo. Para no dejar el árbol roto entre tareas,
agregar **ya** el stub junto al resto de helpers de `localStorage` (después de
`setTorneoActivoId`, `app.js:98`), que la Tarea 4 completa:

```js
const LS_SORTEO = 'noventeros.sorteoVisto';
function marcarSorteoVisto(t){ /* Tarea 4 */ }
```

- [ ] **Step 3: Verificar que el bloque puro sigue sano**

Run: `node tools/check-sorteo.mjs && node tools/check-liga.mjs && node tools/check-invitacion.mjs`
Expected: PASS las tres. (Esta tarea no toca el bloque puro; si algo falla, es un error de sintaxis introducido más arriba en el archivo.)

- [ ] **Step 4: Probar el sorteo del admin a mano**

```bash
python3 -m http.server 8000
```

Abrir `http://localhost:8000`, entrar como organizador, crear un torneo Liga con 3+ inscritos,
cerrar inscripciones y correr las tres etapas desde Admin → Sorteos.
Expected: las tres animaciones se ven igual que antes; la de grupos ahora va claramente más
lenta y legible; al terminar cada una se llega al paso siguiente sin errores en consola.

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "B · partir cada sorteo en decidir + animar, y fijar la velocidad de grupos"
```

---

### Task 3: El reproductor y la pestaña Sorteo

Con esto el jugador ya puede ver el sorteo, aunque todavía nadie le avise.

**Files:**
- Modify: `app.js:135` y `app.js:142` — el guard `ANIMANDO` en los dos listeners
- Modify: `app.js:41-43` — el global `AUTOPLAY_DESDE`
- Modify: `app.js:573-598` — `renderTournament`: la pestaña condicional y el despacho
- Modify: `app.js` — `renderSorteo` y `reproducirSorteo`, nuevos, junto a `renderLlave` (después de `app.js:735`)

**Interfaces:**
- Consumes: `etapasSorteadas`, `poolDe`, `asignacionDe` (Tarea 1); `conAnimacion`, `animarEquipos`, `animarAsignacion`, `animarGrupos`, `ANIMANDO` (Tarea 2).
- Produces:
  - `let AUTOPLAY_DESDE` — global, `null` o el número de etapas ya vistas desde el que arrancar solo.
  - `reproducirSorteo(holder, t, desde = 0) -> Promise<void>`
  - `renderSorteo(holder, t) -> void`

- [ ] **Step 1: Poner el guard en los dos listeners**

En `attachTournamentListener` (`app.js:135`), reemplazar:

```js
    if(isTypingNow()) return; // no interrumpir si alguien está escribiendo
    CURRENT = snap.exists() ? snap.data() : null;
    render();
```

por:

```js
    if(isTypingNow()) return; // no interrumpir si alguien está escribiendo
    CURRENT = snap.exists() ? snap.data() : null;
    // Durante una animación se actualiza el estado pero no se repinta: repintar cortaría
    // la película a la mitad. reproducirSorteo llama render() al terminar.
    if(ANIMANDO) return;
    render();
```

En `attachIndexListener` (`app.js:142`), reemplazar `if(!snap.exists() || isTypingNow()) return;` por:

```js
    if(!snap.exists() || isTypingNow() || ANIMANDO) return;
```

- [ ] **Step 2: Agregar el global de autoplay**

Junto a `let ANIMANDO = false;` (Tarea 2):

```js
// Si el aviso te trajo hasta acá, la reproducción arranca sola y solo desde lo que no
// viste. Entrar a la pestaña a dedo no dispara nada: ahí está el botón de repetir.
let AUTOPLAY_DESDE = null;
```

- [ ] **Step 3: Escribir el reproductor y la vista**

En `app.js`, después de `renderLlave` (línea 735, antes de `function renderAdmin()`):

```js
// El mismo reproductor para el admin y para el jugador. `desde` saltea las etapas ya
// vistas: el aviso reproduce solo lo nuevo, el botón de repetir reproduce todo.
async function reproducirSorteo(holder, t, desde = 0){
  const etapas = etapasSorteadas(t).slice(desde);
  if(!etapas.length) return;
  await conAnimacion(async () => {
    for(const etapa of etapas){
      if(etapa === 'equipos')    await animarEquipos(holder, poolDe(t), t.drawnTeams);
      if(etapa === 'asignacion') await animarAsignacion(holder, t, asignacionDe(t));
      if(etapa === 'grupos')     await animarGrupos(holder, t, t.groups);
    }
  });
  // El listener no repintó mientras corría la animación: hay que ponerse al día.
  render();
}

// Información en reposo: plata y sin glow (MARCA.md §07).
function renderSorteo(holder, t){
  const total = etapasSorteadas(t).length;
  const desde = AUTOPLAY_DESDE;
  AUTOPLAY_DESDE = null;
  const nombres = {equipos:'Equipos', asignacion:'Asignación', grupos: esLiga(t)?'Calendario':'Grupos'};
  holder.innerHTML = `<div class="card tight">
    <b>Sorteo</b>
    <p class="small muted">${total === 3 ? 'El sorteo está completo.' : `Van ${total} de 3 etapas.`}</p>
    <p class="small">${etapasSorteadas(t).map(e => esc(nombres[e])).join(' · ')}</p>
    <button class="btn secondary" id="ver-sorteo">Repetir sorteo</button>
  </div>`;
  holder.querySelector('#ver-sorteo').onclick = () => reproducirSorteo(holder, t, 0);
  if(desde !== null) reproducirSorteo(holder, t, desde);
}
```

- [ ] **Step 4: Colgar la pestaña**

En `renderTournament` (`app.js:578-584`), reemplazar:

```js
  const tabs = esLiga(t)
    ? [['grupos','Calendario'],['tabla','Tabla'],['goleo','Goleo']]
    : [['grupos','Grupos'],['tabla','Tabla'],['goleo','Goleo'],['llave','Llave']];
  // La liga no tiene llave: si venías de un torneo Copa, esa subvista ya no existe.
  if(esLiga(t) && SUBVIEW_TOURN==='llave') SUBVIEW_TOURN='tabla';
```

por:

```js
  const tabs = esLiga(t)
    ? [['grupos','Calendario'],['tabla','Tabla'],['goleo','Goleo']]
    : [['grupos','Grupos'],['tabla','Tabla'],['goleo','Goleo'],['llave','Llave']];
  // La pestaña del sorteo no existe hasta que hay algo que reproducir.
  const haySorteo = etapasSorteadas(t).length > 0;
  if(haySorteo) tabs.push(['sorteo','Sorteo']);
  // La liga no tiene llave: si venías de un torneo Copa, esa subvista ya no existe.
  if(esLiga(t) && SUBVIEW_TOURN==='llave') SUBVIEW_TOURN='tabla';
  if(!haySorteo && SUBVIEW_TOURN==='sorteo') SUBVIEW_TOURN='grupos';
```

Y en el despacho del final (`app.js:595-598`), agregar antes del `renderLlave`:

```js
  if(SUBVIEW_TOURN==='sorteo') return renderSorteo(holder,t);
```

- [ ] **Step 5: Probarlo a mano**

Con el server andando y el torneo de la Tarea 2 ya sorteado, ir a **Torneo**.
Expected:
- Aparece una pestaña **Sorteo** al final; tocarla muestra la tarjeta con "Repetir sorteo".
- El botón reproduce las tres animaciones seguidas y al terminar vuelve solo a la tarjeta.
- En un torneo todavía en inscripción, la pestaña **no** aparece.
- Mientras la animación corre, cargar un marcador desde otro navegador **no** la corta.

- [ ] **Step 6: Verificar los chequeos y commitear**

```bash
node tools/check-sorteo.mjs && node tools/check-liga.mjs && node tools/check-invitacion.mjs
git add app.js
git commit -m "B · pestaña Sorteo y reproductor, con guard para que onSnapshot no la corte"
```

---

### Task 4: El aviso

El drawer fijo abajo que avisa de cada etapa nueva y lleva a verla.

**Files:**
- Modify: `index.html:56` — el contenedor del drawer
- Modify: `style.css` — al final del bloque de estilos, junto a `.tabbar`
- Modify: `app.js:98` — completar `marcarSorteoVisto` y agregar sus dos hermanas
- Modify: `app.js:330-341` — llamar al drawer desde `render()`
- Modify: `app.js` — `renderDrawerSorteo`, nueva, junto a `renderSorteo`

**Interfaces:**
- Consumes: `etapasSorteadas` (Tarea 1); `ANIMANDO` (Tarea 2); `AUTOPLAY_DESDE` (Tarea 3); `LS_SORTEO` y el stub `marcarSorteoVisto` (Tarea 2).
- Produces:
  - `sorteoVisto() -> {[tournamentId: string]: number}`
  - `marcarSorteoVisto(t) -> void` — deja el torneo con todas sus etapas marcadas como vistas.
  - `etapasNuevas(t) -> number`
  - `renderDrawerSorteo() -> void`

- [ ] **Step 1: El contenedor**

En `index.html`, entre `<main id="main"></main>` (línea 56) y `<nav class="tabbar">`:

```html
  <div id="drawer"></div>
```

- [ ] **Step 2: Los estilos**

En `style.css`, después del bloque `.tabbar button.active .ic{…}` (línea 120):

```css
  /* Aviso de sorteo nuevo. Se apoya sobre el tabbar y solo se va si lo atendés.
     Anuncia un momento que acaba de pasar, no una superficie en reposo: acá el verde
     está permitido (MARCA.md §07, §08). */
  #drawer{
    position:fixed;bottom:calc(62px + env(safe-area-inset-bottom));left:0;right:0;
    max-width:480px;margin:0 auto;z-index:29;pointer-events:none;
  }
  .drawer-sorteo{
    pointer-events:auto;display:flex;align-items:center;gap:10px;margin:0 12px;
    padding:12px 14px;border-radius:14px;background:var(--panel-elevated);
    border:1px solid var(--lineBright);
    box-shadow:0 10px 30px var(--shadow-deep), 0 0 20px var(--accent-glow);
  }
  .drawer-sorteo .ds-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;}
  .drawer-sorteo .ds-text b{font-size:13px;color:var(--accent);}
  .drawer-sorteo .ds-x{
    background:none;border:none;color:var(--muted-dark);font-size:18px;line-height:1;
    padding:6px;cursor:pointer;flex-shrink:0;
  }
  .drawer-sorteo .ds-x:hover{color:var(--silver);}
```

- [ ] **Step 3: Completar los helpers de `localStorage`**

En `app.js`, reemplazar el stub de la Tarea 2 por:

```js
/* ---- sorteo visto (dispositivo) ---- */
// Cuántas etapas del sorteo ya vio (o descartó) este dispositivo, por torneo. Es un
// número y no un set porque las etapas siempre avanzan en orden.
const LS_SORTEO = 'noventeros.sorteoVisto';
function sorteoVisto(){
  try{ return JSON.parse(localStorage.getItem(LS_SORTEO)) || {}; }
  catch(e){ return {}; }   // modo privado o JSON corrupto: se empieza de cero
}
function marcarSorteoVisto(t){
  if(!t) return;
  try{
    const visto = sorteoVisto();
    visto[t.id] = etapasSorteadas(t).length;
    localStorage.setItem(LS_SORTEO, JSON.stringify(visto));
  }catch(e){}
}
function etapasNuevas(t){
  if(!t) return 0;
  return etapasSorteadas(t).length - (sorteoVisto()[t.id] || 0);
}
```

- [ ] **Step 4: El drawer**

En `app.js`, después de `renderSorteo`:

```js
// Vive fuera de #main para sobrevivir el cambio de vista; render() lo repinta siempre.
function renderDrawerSorteo(){
  const el = document.getElementById('drawer');
  const t = CURRENT;
  if(!t || ANIMANDO || etapasNuevas(t) <= 0){ el.innerHTML = ''; return; }
  const visto = sorteoVisto()[t.id] || 0;
  const n = etapasNuevas(t);
  el.innerHTML = `<div class="drawer-sorteo">
    <div class="ds-text">
      <b>${n === 1 ? 'Se sorteó una etapa nueva' : `Se sortearon ${n} etapas nuevas`}</b>
      <span class="small muted">${esc(t.name || '')}</span>
    </div>
    <button class="btn small" id="ds-ver">Ver sorteo</button>
    <button class="ds-x" id="ds-x" aria-label="Cerrar sin ver el sorteo">✕</button>
  </div>`;
  el.querySelector('#ds-ver').onclick = () => {
    AUTOPLAY_DESDE = visto;
    marcarSorteoVisto(t);
    VIEW = 'tournament'; SUBVIEW_TOURN = 'sorteo';
    render();
  };
  // Cerrar es definitivo: el sorteo queda igual a un toque, en la pestaña Sorteo.
  el.querySelector('#ds-x').onclick = () => { marcarSorteoVisto(t); render(); };
}
```

- [ ] **Step 5: Llamarlo desde `render()`**

En `render()` (`app.js:330`), después de las tres líneas del `pillEl` y **antes** del primer
`if(VIEW===…)` — que hace `return` y se saltearía todo lo que venga después:

```js
  renderDrawerSorteo();
```

- [ ] **Step 6: Probarlo a mano, con dos dispositivos**

Con el server andando, un navegador como organizador y otro (o una ventana privada) entrando
con el `joinCode`:

1. El organizador corre la etapa 1. Expected: al organizador **no** le sale el aviso; al jugador sí, diciendo "Se sorteó una etapa nueva".
2. El jugador toca **Ver sorteo**. Expected: va a Torneo → Sorteo, reproduce la etapa 1 sola, y al terminar el aviso ya no está.
3. El organizador corre la etapa 2. Expected: al jugador le reaparece el aviso, y **Ver sorteo** reproduce solo la etapa 2.
4. El organizador corre la etapa 3; el jugador toca la **✕**. Expected: el aviso se va y no vuelve al navegar ni al recargar; el sorteo sigue disponible en Torneo → Sorteo con "Repetir sorteo", que reproduce las tres.

- [ ] **Step 7: Verificar los chequeos y commitear**

```bash
node tools/check-sorteo.mjs && node tools/check-liga.mjs && node tools/check-invitacion.mjs
git add index.html style.css app.js
git commit -m "B · aviso de sorteo nuevo, fijo abajo hasta que se atiende"
```

---

### Task 5: Cerrar el sub-proyecto

**Files:**
- Modify: `ROADMAP.md:32` — el estado y el link al plan

- [ ] **Step 1: Correr la verificación del roadmap**

```bash
grep -n 'reproducirSorteo' app.js
node tools/check-sorteo.mjs
```

Expected: `reproducirSorteo` aparece definida y llamada desde `renderSorteo` — que es la vista
del jugador, no la del admin. Si solo apareciera dentro de `renderAdmin*`, B no está hecho.

- [ ] **Step 2: Actualizar el roadmap**

En `ROADMAP.md`, en el sub-proyecto B: `**Estado:** hecho` y agregar el link al plan junto al
del spec, con el mismo formato que usa A:

```
**Estado:** hecho · **Depende de:** A · **Spec:** [design](docs/superpowers/specs/2026-09-04-B-sorteo-visible-design.md) · **Plan:** [5 tareas](docs/superpowers/plans/2026-09-04-B-sorteo-visible.md)
```

- [ ] **Step 3: Commit**

```bash
git add ROADMAP.md
git commit -m "B · sorteo visible para todos: hecho"
```
