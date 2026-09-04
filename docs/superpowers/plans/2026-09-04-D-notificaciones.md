# D · Notificaciones sin infraestructura — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Avisar a todos los inscritos (jugadores y organizador, sin distinción) de
marcadores cargados, avances de fase y borrado del torneo — hasta que hay campeón —
mirando la app, en segundo plano, o al volver, sin infraestructura nueva.

**Architecture:** Un único motor de diff puro (`diffTorneo`) compara la snapshot actual
de Firestore contra la última que el dispositivo vio (guardada en `localStorage`) y
produce una lista de eventos tipados. Un solo punto de integración
(`procesarNovedades`, colgado de `attachTournamentListener`) consume esos eventos y
decide destino según `document.visibilityState`: toast si la app está visible,
`showNotification()` si está en segundo plano y hay permiso. El mismo motor cubre el
caso "recién abierto" porque el primer snapshot tras conectar el listener no tiene base
en memoria y cae a comparar contra `localStorage`.

**Tech Stack:** Vanilla JS (ES modules), Firestore `onSnapshot` (ya en uso), Notification
API + Service Worker `showNotification()` (sin FCM), `localStorage`. Cero dependencias
nuevas.

**Spec:** `docs/superpowers/specs/2026-09-04-D-notificaciones-design.md`

## Global Constraints

- Todo el texto de cara al usuario va en español; los identificadores de código, en inglés.
- Cero dependencias nuevas — Firebase (ya cargado) sigue siendo la única.
- `app.js` es un módulo de navegador: no se puede importar desde Node. La única forma de
  testear lógica es recortar el bloque puro entre `function newId()` y el marcador
  `/* ---- bracket ---- */` (ver `tools/check-liga.mjs`). Mover esos marcadores rompe los
  cuatro scripts de `tools/` a la vez, no solo el nuevo.
- Firestore rechaza un documento con un array cuyos elementos son arrays: cualquier dato
  nuevo que viaje a Firestore tendría que respetar esa forma — pero esta feature no agrega
  ningún campo nuevo al documento del torneo, así que no aplica en la práctica.
- No hay framework ni componentes: todo es `innerHTML` + `el.onclick=…` imperativo,
  siguiendo el patrón ya usado por `renderDrawer()`/`renderDrawerSorteo()`.
- Un evento (toast, notificación) que aparece ya cuenta como visto — no hace falta un
  gesto explícito de "marcar visto" como en el drawer de sorteo.
- Esta feature no escribe nada nuevo a Firestore, solo lee `onSnapshot` y escribe a
  `localStorage`: no aplica `conCarga` (es para botones que disparan una escritura) ni el
  cuidado de "capturar el DOM antes del await" (no hay awaits en el camino nuevo).

---

### Task 1: Motor de diff puro (`resumenTorneo` + `diffTorneo`)

**Files:**
- Modify: `app.js:244` (insertar después de `agregarTorneo`, antes de
  `/* ================= TOURNAMENT MODEL ================= */`) — dentro del bloque
  pure-logic que ya recortan los otros `tools/check-*.mjs`.
- Create: `tools/check-novedades.mjs`

**Interfaces:**
- Produces: `resumenTorneo(t) -> {status, champion, grupos:{[key]:[{p1,p2,s1,s2,played}]}, rounds:[[{p1,p2,s1,s2,played}]]}`
  — proyección mínima de un torneo, usada como "snapshot" tanto en memoria como en
  `localStorage`.
- Produces: `diffTorneo(anterior, actual) -> Eventos[]` donde `anterior` es el resultado
  de una llamada previa a `resumenTorneo` (o `null` si es la primera vez que se mira este
  torneo) y `actual` es un torneo completo tal cual llega de Firestore (o `undefined` si
  el documento ya no existe). Cada evento es uno de:
  - `{tipo:'resultado', p1, p2, s1, s2}`
  - `{tipo:'fase', de, a}`
  - `{tipo:'campeon', jugadorId}`
  - `{tipo:'torneo_eliminado'}`
  El orden de la lista siempre pone `resultado` antes que `fase`, y `campeon` al final.
  `torneo_eliminado`, cuando aparece, es el único elemento de la lista.
- Consumes: nada de tareas anteriores (es la base).

- [ ] **Step 1: Escribir el chequeo (va a fallar: las funciones no existen todavía)**

Crear `tools/check-novedades.mjs`:

```js
// Chequeo del motor de diff de novedades (sub-proyecto D). Corre con: node tools/check-novedades.mjs
//
// Mismo truco que check-liga.mjs: app.js es un módulo de navegador y no se puede
// importar desde node, así que se recorta el bloque de funciones puras (entre
// `function newId()` y el marcador `/* ---- bracket ---- */`) y se evalúa.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const src = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const desde = src.indexOf('function newId()');
const hasta = src.indexOf('/* ---- bracket ---- */');
assert.ok(desde > 0 && hasta > desde, 'no se encontró el bloque de lógica pura en app.js');

const { resumenTorneo, diffTorneo } =
  await import('data:text/javascript,' + encodeURIComponent(
    src.slice(desde, hasta) +
    '\nexport { resumenTorneo, diffTorneo };'
  ));

const base = () => ({
  status: 'groups', champion: null,
  groupMatches: { A: [
    {id:'A-0', p1:'p1', p2:'p2', s1:null, s2:null, played:false},
    {id:'A-1', p1:'p3', p2:'p4', s1:null, s2:null, played:false},
  ]},
  bracket: null,
});

/* ---- snapshot idéntica: nada cambió ---- */
{
  const t = base();
  assert.deepEqual(diffTorneo(resumenTorneo(t), t), [], 'sin cambios, sin eventos');
}

/* ---- un partido de grupo pasa a jugado ---- */
{
  const anterior = resumenTorneo(base());
  const despues = base();
  despues.groupMatches.A[0] = {...despues.groupMatches.A[0], s1:2, s2:1, played:true};
  const eventos = diffTorneo(anterior, despues);
  assert.equal(eventos.length, 1, 'un solo partido cambió');
  assert.deepEqual(eventos[0], {tipo:'resultado', p1:'p1', p2:'p2', s1:2, s2:1});
}

/* ---- dos partidos de bracket en rondas distintas, mismo diff ---- */
{
  const antes = base();
  antes.bracket = { rounds: [
    {partidos:[{p1:'p1',p2:'p2',s1:null,s2:null,played:false,winner:null}]},
    {partidos:[{p1:'p3',p2:'p4',s1:null,s2:null,played:false,winner:null}]},
  ]};
  const anterior = resumenTorneo(antes);
  const despues = base();
  despues.bracket = { rounds: [
    {partidos:[{p1:'p1',p2:'p2',s1:2,s2:0,played:true,winner:'p1'}]},
    {partidos:[{p1:'p3',p2:'p4',s1:1,s2:3,played:true,winner:'p4'}]},
  ]};
  const eventos = diffTorneo(anterior, despues);
  assert.equal(eventos.length, 2, 'los dos partidos generan su propio evento');
  assert.ok(eventos.every(e=>e.tipo==='resultado'), 'ambos son eventos de resultado');
}

/* ---- cambio de fase ---- */
{
  const anterior = resumenTorneo(base());
  const despues = base();
  despues.status = 'playoffs';
  assert.deepEqual(diffTorneo(anterior, despues), [{tipo:'fase', de:'groups', a:'playoffs'}]);
}

/* ---- aparece campeón: va al final, después de resultado y fase ---- */
{
  const antes = base();
  antes.status = 'playoffs';
  antes.bracket = { rounds:[{partidos:[{p1:'p1',p2:'p2',s1:null,s2:null,played:false,winner:null}]}] };
  const anterior = resumenTorneo(antes);
  const despues = base();
  despues.status = 'finished';
  despues.champion = 'p1';
  despues.bracket = { rounds:[{partidos:[{p1:'p1',p2:'p2',s1:2,s2:0,played:true,winner:'p1'}]}] };
  const eventos = diffTorneo(anterior, despues);
  assert.equal(eventos.length, 3, 'resultado + fase + campeón');
  assert.equal(eventos[eventos.length-1].tipo, 'campeon', 'el campeón siempre va último');
  assert.deepEqual(eventos[eventos.length-1], {tipo:'campeon', jugadorId:'p1'});
}

/* ---- torneo eliminado antes de campeón ---- */
{
  const anterior = resumenTorneo(base());
  assert.deepEqual(diffTorneo(anterior, undefined), [{tipo:'torneo_eliminado'}]);
}

/* ---- torneo eliminado ya finalizado: limpieza normal, no noticia ---- */
{
  const antes = base();
  antes.status = 'finished'; antes.champion = 'p1';
  const anterior = resumenTorneo(antes);
  assert.deepEqual(diffTorneo(anterior, undefined), [], 'borrar un torneo finalizado no avisa nada');
}

/* ---- primera vez que este dispositivo mira el torneo: sin base, sin eventos ---- */
{
  const despues = base();
  despues.status = 'finished'; despues.champion = 'p1';
  assert.deepEqual(diffTorneo(null, despues), [], 'sin snapshot anterior no hay novedades que contar');
}

console.log('✓ lógica de novedades OK');
```

- [ ] **Step 2: Correr el chequeo y confirmar que falla**

Run: `node tools/check-novedades.mjs`
Expected: falla (ReferenceError o similar — `resumenTorneo`/`diffTorneo` no existen aún).

- [ ] **Step 3: Implementar `resumenTorneo` y `diffTorneo` en `app.js`**

Insertar en `app.js` inmediatamente después de la función `agregarTorneo` (línea 244:
`return [...lista.filter(x=>x.id!==entrada.id), entrada]; }`) y antes de la línea
`/* ================= TOURNAMENT MODEL ================= */`:

```js
/* ---- novedades: diff entre snapshots del torneo ---- */
// Proyección mínima para comparar: solo lo que diffTorneo necesita, no el documento
// entero. Los partidos de bracket no tienen id propio: se identifican por su posición
// (ronda, índice), estable porque las rondas solo se agregan, nunca se reordenan.
function resumenTorneo(t){
  const partido = m => ({p1:m.p1, p2:m.p2, s1:m.s1, s2:m.s2, played:m.played});
  const grupos = {};
  Object.entries(t.groupMatches||{}).forEach(([k,ms])=>{ grupos[k] = ms.map(partido); });
  const rounds = (t.bracket ? t.bracket.rounds : []).map(r => r.partidos.map(partido));
  return { status:t.status, champion:t.champion||null, grupos, rounds };
}

// anterior: resumenTorneo() de la última vez que este dispositivo miró (o null si es la
// primera vez). actual: el torneo tal cual llega de Firestore, o undefined si el
// documento ya no existe. Los grupos se recorren por clave explícita (no flattening por
// orden de iteración): Firestore no garantiza el orden de las claves de un mapa, y dos
// lecturas del mismo documento podrían traerlas en orden distinto.
function diffTorneo(anterior, actual){
  if(actual === undefined){
    if(anterior && anterior.status !== 'finished') return [{tipo:'torneo_eliminado'}];
    return [];
  }
  if(anterior === null) return [];

  const eventos = [];
  const actualResumen = resumenTorneo(actual);

  Object.keys(actualResumen.grupos).sort().forEach(k => {
    (actualResumen.grupos[k]||[]).forEach((m,i) => {
      const previo = (anterior.grupos[k]||[])[i];
      if(m.played && !(previo && previo.played)){
        eventos.push({tipo:'resultado', p1:m.p1, p2:m.p2, s1:m.s1, s2:m.s2});
      }
    });
  });
  (actualResumen.rounds||[]).forEach((ronda, ri) => {
    ronda.forEach((m,i) => {
      const previo = ((anterior.rounds||[])[ri]||[])[i];
      if(m.played && !(previo && previo.played)){
        eventos.push({tipo:'resultado', p1:m.p1, p2:m.p2, s1:m.s1, s2:m.s2});
      }
    });
  });
  if(actual.status !== anterior.status){
    eventos.push({tipo:'fase', de:anterior.status, a:actual.status});
  }
  if(actual.champion && !anterior.champion){
    eventos.push({tipo:'campeon', jugadorId:actual.champion});
  }
  return eventos;
}
```

- [ ] **Step 4: Correr el chequeo y confirmar que pasa**

Run: `node tools/check-novedades.mjs`
Expected: `✓ lógica de novedades OK`

- [ ] **Step 5: Commit**

```bash
git add app.js tools/check-novedades.mjs
git commit -m "$(cat <<'EOF'
Add diffTorneo: motor de diff puro para D (notificaciones)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Persistencia de "último visto" en `localStorage`

**Files:**
- Modify: `app.js:129` (insertar después del bloque `sorteoVisto`/`etapasNuevas`, antes
  de `/* ---- mi código de alias (dispositivo) ---- */`)

**Interfaces:**
- Consumes: nada (usa solo `localStorage`, ya disponible en el navegador).
- Produces: `novedadesVisto() -> {[torneoId]: resumenTorneoObj}`,
  `marcarNovedadesVisto(id, resumen)`, `borrarNovedadesVisto(id)`. Task 4 los llama con
  el objeto que devuelve `resumenTorneo()` de Task 1.

- [ ] **Step 1: Agregar las funciones**

Insertar en `app.js` después del bloque que termina en (aproximadamente línea 129):

```js
function etapasNuevas(t){
  if(!t) return 0;
  return etapasSorteadas(t).length - (sorteoVisto()[t.id] || 0);
}
```

el siguiente bloque nuevo, antes de `/* ---- mi código de alias (dispositivo) ---- */`:

```js
/* ---- novedades vistas (dispositivo) ---- */
// Última snapshot resumida (resumenTorneo) que este dispositivo vio de cada torneo. A
// diferencia de sorteoVisto, acá no hace falta un gesto de "marcar visto" aparte:
// mostrar el aviso (toast, notificación o resumen al volver) ya cuenta como visto.
const LS_NOVEDADES = 'noventeros.novedadesVisto';
function novedadesVisto(){
  try{ return JSON.parse(localStorage.getItem(LS_NOVEDADES)) || {}; }
  catch(e){ return {}; }   // modo privado o JSON corrupto: se empieza de cero
}
function marcarNovedadesVisto(id, resumen){
  try{
    const visto = novedadesVisto();
    visto[id] = resumen;
    localStorage.setItem(LS_NOVEDADES, JSON.stringify(visto));
  }catch(e){}
}
function borrarNovedadesVisto(id){
  try{
    const visto = novedadesVisto();
    delete visto[id];
    localStorage.setItem(LS_NOVEDADES, JSON.stringify(visto));
  }catch(e){}
}
```

- [ ] **Step 2: Verificar manualmente (no hay test automatizado — mismo trato que `sorteoVisto`/`misAlias`, funciones triviales de `localStorage` que ningún otro helper del proyecto testea)**

Run: `python3 -m http.server` desde la raíz del repo, abrir `http://localhost:8000` en el
navegador, abrir la consola de DevTools y correr:

```js
marcarNovedadesVisto('t1', {status:'groups', champion:null, grupos:{}, rounds:[]});
novedadesVisto();          // debe mostrar {t1: {...}}
borrarNovedadesVisto('t1');
novedadesVisto();          // debe mostrar {}
```

Expected: cada paso imprime lo esperado, sin excepciones en consola.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "$(cat <<'EOF'
Add localStorage helpers for novedades vistas (D)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: UI de toasts

**Files:**
- Modify: `index.html:57` (agregar `<div id="toasts"></div>` después de `<div id="drawer"></div>`)
- Modify: `style.css` (agregar reglas `#toasts` / `.toast-card`, después del bloque
  `.drawer-card` que termina en `.drawer-card .ds-x:hover{color:var(--silver);}`)
- Modify: `app.js` (agregar `encolarToast`, `renderToasts`, `navegarDesdeToast`; llamar
  `renderToasts()` desde `render()`)

**Interfaces:**
- Consumes: `esc()` (ya existe, línea ~59), `render()`, `VIEW`/`SUBVIEW_TOURN` globals,
  `esLiga(t)` (ya existe).
- Produces: `encolarToast(ev, texto)` donde `texto` es `{titulo, cuerpo}` — Task 4 lo
  llama con el resultado de su propia `textoEvento(ev, t)`. `ev` es cualquiera de los
  cuatro tipos de evento de Task 1 (se usa solo para decidir a dónde navegar al hacer
  click, `encolarToast` no interpreta su contenido).

- [ ] **Step 1: Agregar el contenedor en `index.html`**

En `index.html`, cambiar:

```html
  <main id="main"></main>
  <div id="drawer"></div>
```

por:

```html
  <main id="main"></main>
  <div id="drawer"></div>
  <div id="toasts"></div>
```

- [ ] **Step 2: Agregar los estilos en `style.css`**

Después del bloque que termina en `.drawer-card .ds-x:hover{color:var(--silver);}`,
agregar:

```css
  /* Cola de toasts: a diferencia del drawer (un solo slot, se apoya en el tabbar y
     espera a que lo atiendan), acá pueden llegar varios eventos a la vez y ninguno
     bloquea nada — arriba de la pantalla, autodesaparecen. */
  #toasts{
    position:fixed;top:calc(64px + env(safe-area-inset-top));left:0;right:0;
    max-width:480px;margin:0 auto;z-index:35;pointer-events:none;
    display:flex;flex-direction:column;gap:8px;padding:0 12px;
  }
  .toast-card{
    pointer-events:auto;display:flex;flex-direction:column;gap:2px;
    padding:12px 14px;border-radius:14px;background:var(--panel-elevated);
    border:1px solid var(--lineBright);cursor:pointer;
    box-shadow:0 10px 30px var(--shadow-deep), 0 0 20px var(--accent-glow);
    animation:toast-in .18s ease;
  }
  .toast-card b{font-size:13px;color:var(--accent);}
  .toast-card span{font-size:12px;color:var(--silver);}
  @keyframes toast-in{ from{opacity:0;transform:translateY(-6px);} to{opacity:1;transform:translateY(0);} }
```

- [ ] **Step 3: Agregar la cola y el render en `app.js`**

Agregar después de la función `renderDrawerAlias` (justo antes de donde siga el
siguiente bloque de funciones de UI):

```js
/* ---- toasts: cola de avisos, apilan y autodesaparecen ---- */
let TOASTS = [];
function encolarToast(ev, texto){
  const id = 'tst'+Math.random().toString(36).slice(2,9);
  TOASTS.push({id, ev, texto});
  renderToasts();
  setTimeout(()=>{ TOASTS = TOASTS.filter(x=>x.id!==id); renderToasts(); }, 5000);
}
function renderToasts(){
  const el = document.getElementById('toasts');
  if(!el) return;
  el.innerHTML = TOASTS.map(({id,texto})=>`<div class="toast-card" data-toast="${id}">
    <b>${esc(texto.titulo)}</b><span>${esc(texto.cuerpo)}</span>
  </div>`).join('');
  el.querySelectorAll('[data-toast]').forEach(card => card.onclick = () => {
    const item = TOASTS.find(x=>x.id===card.dataset.toast);
    TOASTS = TOASTS.filter(x=>x.id!==card.dataset.toast);
    renderToasts();
    if(item) navegarDesdeToast(item.ev);
  });
}
// torneo_eliminado no navega a ningún lado: la entrada ya no existe en "Mis torneos".
function navegarDesdeToast(ev){
  if(ev.tipo==='resultado'){ VIEW='tournament'; SUBVIEW_TOURN='grupos'; }
  else if(ev.tipo==='fase'){ VIEW='tournament'; SUBVIEW_TOURN = ev.a==='playoffs' ? 'llave' : 'grupos'; }
  else if(ev.tipo==='campeon'){ VIEW='tournament'; SUBVIEW_TOURN='tabla'; }
  else return;
  render();
}
```

Y en la función `render()` (donde hoy dice `renderDrawer();`), agregar la llamada
inmediatamente después:

```js
  renderDrawer();
  renderToasts();
```

- [ ] **Step 4: Verificar manualmente**

Run: `python3 -m http.server`, abrir la app en el navegador, en DevTools console:

```js
encolarToast({tipo:'resultado'}, {titulo:'Resultado cargado', cuerpo:'ElCraque22 3-1 Mengano99'});
```

Expected: aparece una tarjeta arriba de la pantalla con ese texto, y desaparece sola a
los 5 segundos. Repetir la llamada dos veces seguidas: deben apilarse ambas tarjetas, no
reemplazarse. Click en una: desaparece al toque y navega a la pestaña Torneo → Grupos.

- [ ] **Step 5: Commit**

```bash
git add index.html style.css app.js
git commit -m "$(cat <<'EOF'
Add toast queue UI for D (notificaciones)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Conectar el motor de diff al listener en tiempo real

**Files:**
- Modify: `app.js:182-194` (`attachTournamentListener`)

**Interfaces:**
- Consumes: `diffTorneo`/`resumenTorneo` (Task 1), `novedadesVisto`/`marcarNovedadesVisto`/`borrarNovedadesVisto`
  (Task 2), `encolarToast` (Task 3), `leerMisTorneos`/`guardarMisTorneos`/`torneoActivoId`/`setTorneoActivoId`
  (ya existentes), `playerName(t,id)` y `statusLabel(t)` (ya existentes, para redactar el
  texto de cada evento).
- Produces: nada que otra tarea consuma — es el punto de integración final de D.

- [ ] **Step 1: Reemplazar `attachTournamentListener` y agregar las funciones de soporte**

En `app.js`, reemplazar:

```js
/* ---- suscripciones en tiempo real (reemplazan el polling) ---- */
function attachTournamentListener(id){
  if(unsubTournament){ unsubTournament(); unsubTournament=null; }
  if(!id){ CURRENT = null; return; }
  unsubTournament = onSnapshot(doc(db,'tournaments', id), (snap)=>{
    if(isTypingNow()) return; // no interrumpir si alguien está escribiendo
    CURRENT = snap.exists() ? snap.data() : null;
    // Durante una animación se actualiza el estado pero no se repinta: repintar cortaría
    // la película a la mitad. reproducirSorteo llama render() al terminar.
    if(ANIMANDO) return;
    render();
  });
}
```

por:

```js
/* ---- suscripciones en tiempo real (reemplazan el polling) ---- */
// Resumen en memoria de la última snapshot que ya procesamos para detectar novedades.
// Se resetea cada vez que attachTournamentListener cambia de torneo: mientras valga
// null, el próximo snapshot que llegue se diffea contra localStorage en vez de memoria
// — así "recién abierto" y "sigue mirando con la app abierta" comparten el mismo motor.
let ULTIMO_RESUMEN_NOVEDADES = null;
function attachTournamentListener(id){
  if(unsubTournament){ unsubTournament(); unsubTournament=null; }
  ULTIMO_RESUMEN_NOVEDADES = null;
  if(!id){ CURRENT = null; return; }
  unsubTournament = onSnapshot(doc(db,'tournaments', id), (snap)=>{
    if(isTypingNow()) return; // no interrumpir si alguien está escribiendo
    const actual = snap.exists() ? snap.data() : undefined;
    procesarNovedades(id, actual);
    CURRENT = actual ?? null;
    // Durante una animación se actualiza el estado pero no se repinta: repintar cortaría
    // la película a la mitad. reproducirSorteo llama render() al terminar.
    if(ANIMANDO) return;
    render();
  });
}

// Único punto que corre diffTorneo contra un snapshot real. Guardar en localStorage acá
// (no en quien consume el evento) es lo que hace que mostrarlo ya cuente como visto: no
// hace falta un gesto explícito como en el drawer de sorteo.
function procesarNovedades(id, actual){
  const anterior = ULTIMO_RESUMEN_NOVEDADES ?? novedadesVisto()[id] ?? null;
  const eventos = diffTorneo(anterior, actual);
  ULTIMO_RESUMEN_NOVEDADES = actual ? resumenTorneo(actual) : null;
  if(actual) marcarNovedadesVisto(id, ULTIMO_RESUMEN_NOVEDADES);
  else borrarNovedadesVisto(id);
  if(!eventos.length) return;
  if(eventos[0].tipo === 'torneo_eliminado'){
    const entrada = leerMisTorneos().find(x=>x.id===id);
    quitarTorneoEliminado(id);
    despacharEvento({tipo:'torneo_eliminado', nombre: entrada ? entrada.nombre : 'el torneo'}, undefined, id);
    return;
  }
  eventos.forEach(ev => despacharEvento(ev, actual, id));
}

// Mismo camino que ya usa el botón "Eliminar" del admin (bindAccionesTorneo), sin el
// fDelete (el documento ya no existe) ni la confirmación (esto no lo disparó el usuario
// de este dispositivo).
function quitarTorneoEliminado(id){
  guardarMisTorneos(leerMisTorneos().filter(x=>x.id!==id));
  if(torneoActivoId()===id){
    const resto = leerMisTorneos()[0];
    setTorneoActivoId(resto ? resto.id : null);
    attachTournamentListener(resto ? resto.id : null);
  }
}

// Visible: toast. Segundo plano con permiso concedido y soporte del navegador:
// notificación nativa. Sin permiso o sin soporte, esta capa simplemente no dispara nada
// — límite conocido (depende de que la pestaña siga viva), no es un error.
function despacharEvento(ev, t, id){
  const texto = textoEvento(ev, t);
  if(document.visibilityState === 'visible'){
    encolarToast(ev, texto);
  } else if(typeof Notification !== 'undefined' && Notification.permission === 'granted' && 'serviceWorker' in navigator){
    navigator.serviceWorker.ready.then(reg => reg.showNotification(texto.titulo, {
      body: texto.cuerpo, icon:'assets/icon-192.png', tag:'noventeros-'+id
    }));
  }
}

// Único lugar que traduce cada tipo de evento a texto — toast y showNotification
// muestran lo mismo, solo cambia el contenedor. Reusa el mapa de statusLabel para no
// duplicar las etiquetas de fase.
function textoEvento(ev, t){
  if(ev.tipo==='resultado'){
    const nombre = pid => t ? playerName(t,pid) : pid;
    return {titulo:'Resultado cargado', cuerpo:`${nombre(ev.p1)} ${ev.s1}-${ev.s2} ${nombre(ev.p2)}`};
  }
  if(ev.tipo==='fase'){
    return {titulo:'Avanzó el torneo', cuerpo: statusLabel({status:ev.a}).text};
  }
  if(ev.tipo==='campeon'){
    return {titulo:'¡Hay campeón!', cuerpo: t ? playerName(t, ev.jugadorId) : ev.jugadorId};
  }
  return {titulo:'Torneo eliminado', cuerpo:`El organizador eliminó "${ev.nombre}".`};
}
```

- [ ] **Step 2: Verificar manualmente con dos pestañas**

Run: `python3 -m http.server`, abrir la app en dos pestañas del mismo navegador (o dos
navegadores), unirse al mismo torneo en ambas (mismo `joinCode`), dejar una en
`visibilityState:'visible'`.

1. Desde la pestaña admin (u otro jugador), cargar el resultado de un partido de esa
   grupo/liga. **Expected:** la otra pestaña muestra un toast "Resultado cargado" con el
   marcador correcto, sin recargar.
2. Cerrar sesiones de inscripción (avanzar `status`). **Expected:** toast "Avanzó el
   torneo" con la etiqueta de fase correcta.
3. Como admin, eliminar el torneo desde "Mis torneos" (con el torneo aún en
   `groups`/`playoffs`, sin campeón). **Expected:** la otra pestaña muestra el toast
   "Torneo eliminado" y esa entrada desaparece de su "Mis torneos" al recargar esa vista.
4. Repetir el paso 3 pero con un torneo ya `finished`. **Expected:** ningún toast, la
   entrada igual se sanea (mismo comportamiento que ya tenía `renderMisTorneos` al
   purgar torneos borrados).

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "$(cat <<'EOF'
Wire diffTorneo into attachTournamentListener (D: notificaciones)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Pedir permiso de notificaciones al inscribirse

**Files:**
- Modify: `app.js:728-730` (dentro del handler de `btn-submit` en `renderRegister`)

**Interfaces:**
- Consumes: nada nuevo — usa `Notification` (global del navegador) en el mismo punto
  donde ya se confirma la inscripción.
- Produces: nada que otra tarea consuma.

- [ ] **Step 1: Agregar el pedido de permiso tras una inscripción exitosa**

En `app.js`, dentro del `onclick` de `btn-submit` (`renderRegister`), cambiar:

```js
    regMsg.innerHTML = '<span class="field-ok"><span class="material-symbols-outlined" style="font-size:1em;">check_circle</span> ¡Inscripción confirmada! Nos vemos en la cancha.</span>'
      + (resultado.codigoNuevo ? `<br><span class="small muted">Guardá este código por si usás este alias desde otro dispositivo: <b>${esc(resultado.codigoNuevo)}</b> (no es una contraseña, solo evita que otro jugador use tu alias por error).</span>` : '');
    setTimeout(()=>render(), 700);
```

por:

```js
    regMsg.innerHTML = '<span class="field-ok"><span class="material-symbols-outlined" style="font-size:1em;">check_circle</span> ¡Inscripción confirmada! Nos vemos en la cancha.</span>'
      + (resultado.codigoNuevo ? `<br><span class="small muted">Guardá este código por si usás este alias desde otro dispositivo: <b>${esc(resultado.codigoNuevo)}</b> (no es una contraseña, solo evita que otro jugador use tu alias por error).</span>` : '');
    // Mismo gesto de click que confirma la inscripción: si el navegador no soporta
    // Notification, o el usuario ya decidió antes (granted/denied), no hay nada que
    // pedir. Sin permiso, la capa de segundo plano de D simplemente no dispara nada.
    if(typeof Notification !== 'undefined' && Notification.permission === 'default'){
      Notification.requestPermission();
    }
    setTimeout(()=>render(), 700);
```

- [ ] **Step 2: Verificar manualmente**

Run: `python3 -m http.server`, abrir la app, ir a "Inscribirme" en un torneo con
inscripciones abiertas, completar el formulario y confirmar.

Expected: el navegador muestra el prompt nativo de permiso de notificaciones en el mismo
momento en que se confirma la inscripción (no antes, no en un flujo separado). Aceptar o
rechazar no debe romper ni bloquear el mensaje de "¡Inscripción confirmada!".

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "$(cat <<'EOF'
Request notification permission on registration (D: notificaciones)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Cerrar el sub-proyecto en el roadmap

**Files:**
- Modify: `ROADMAP.md` (sección `### D · Notificaciones sin infraestructura`)

**Interfaces:**
- Consumes: nada.
- Produces: nada.

- [ ] **Step 1: Correr la verificación real antes de declarar nada**

Run: `grep -n 'showNotification' app.js` — debe encontrar la llamada agregada en Task 4.
Run: `node tools/check-novedades.mjs` — debe imprimir `✓ lógica de novedades OK`.

- [ ] **Step 2: Actualizar la sección D de `ROADMAP.md`**

Reemplazar el bloque completo de la sección D (desde `### D · Notificaciones sin
infraestructura` hasta el final de su párrafo de verificación, antes de `### E · Push...`)
por:

```markdown
### D · Notificaciones sin infraestructura
**Estado:** hecho · **Depende de:** A · **Spec:** [design](docs/superpowers/specs/2026-09-04-D-notificaciones-design.md) · **Plan:** [6 tareas](docs/superpowers/plans/2026-09-04-D-notificaciones.md)

Un único motor de diff (`diffTorneo`/`resumenTorneo`) compara la snapshot actual del
torneo contra la última que el dispositivo vio (`localStorage`) y alimenta tres capas
sobre el `onSnapshot` que ya existe: toast si la app está visible, `showNotification()`
si está en segundo plano y hay permiso (pedido en el mismo click de inscripción, sin
FCM — límite conocido en iOS), y el mismo diff contra localStorage cuando recién se abre.
Cubre marcadores y avances de fase para todos los inscritos por igual, organizador
incluido si se registró como jugador, hasta que hay campeón. También avisa si el
organizador borra el torneo antes de ese punto, y saca esa entrada de "Mis torneos" en
el dispositivo que recibe el aviso.

**Verificación:** `grep -n 'showNotification' app.js` debe tener resultado (la capa de
segundo plano). Más `node tools/check-novedades.mjs` para el motor de diff.
```

- [ ] **Step 3: Commit**

```bash
git add ROADMAP.md
git commit -m "$(cat <<'EOF'
Mark D (notificaciones) as done in ROADMAP.md

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
