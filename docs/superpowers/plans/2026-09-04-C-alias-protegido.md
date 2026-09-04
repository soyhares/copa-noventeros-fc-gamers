# C · Alias protegido — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que "ElCraque22" sea siempre la misma persona: el primer uso de un alias en cualquier torneo lo reclama con un código; usarlo desde otro dispositivo exige ese código.

**Architecture:** Un documento único `meta/aliases` (mismo patrón que `meta/history`) guarda `{alias: código}`. El dispositivo que reclama un alias lo recuerda en `localStorage` y nunca vuelve a pedírselo. Cuando otro dispositivo intenta usar un alias ya reclamado, el submit de inscripción no escribe nada: guarda el intento pendiente y abre un drawer pidiendo el código — generalizando el `#drawer` que ya existe para el aviso de sorteo, con un despachador que decide cuál de los dos mostrar. Un helper `intentarRegistro()` centraliza la escritura del jugador al torneo para que el submit directo y la confirmación del drawer no dupliquen esa lógica.

**Tech Stack:** HTML/CSS/JS sin build ni framework. Firebase 10.13.2 desde el CDN de gstatic. Pruebas: `node` a secas con `node:assert/strict`.

**Spec:** [`docs/superpowers/specs/2026-09-04-C-alias-protegido-design.md`](../specs/2026-09-04-C-alias-protegido-design.md)

## Global Constraints

- **Sin dependencias nuevas ni módulos nuevos.** Todo va en `app.js`. `render()` despacha sobre `VIEW`/`SUBVIEW_TOURN` con `innerHTML` total y handlers asignados después (`el.onclick = …`); seguir ese patrón.
- **`meta/aliases` es un documento único** (`{items:{alias:código}}`), leído/escrito entero con `fGet`/`fSet`, igual que `meta/history`. No crear una colección `aliases/{alias}`.
- **No envolver `fSet`/`fDelete`/`saveTournament` en try/catch que devuelva `false`.** Los errores de escritura deben propagarse hasta el `unhandledrejection` global. Los accesos a `localStorage` sí van en try/catch vacío (modo privado) — mismo patrón que `leerMisTorneos`/`guardarMisTorneos`.
- **No mover los marcadores `function newId()` (línea 189) ni `/* ---- bracket ---- */` (línea 364)** de `app.js`: `tools/check-liga.mjs` y `tools/check-invitacion.mjs` recortan el bloque entre ambos para evaluarlo en node.
- **Español para todo lo que ve el usuario**; identificadores en inglés o en la mezcla ya establecida (`intentarRegistro`, `aliasTaken`, etc.).
- **El código de alias nunca se llama "contraseña" ni "PIN" en la UI.** Es un tope de velocidad, no seguridad — nombrarlo así donde aparezca (mensaje de éxito y drawer).
- **Todo botón que escriba va en `conCarga(boton, texto, accion)`**, y las referencias al DOM que ese handler necesita se capturan en `const` **antes del primer `await`**, nunca con un `getElementById` posterior — un `onSnapshot` remoto puede repintar `#main` en medio de un `await`.
- **`t.bracket.rounds` es `[{partidos:[…]}, …]`, nunca un array de arrays.** Esta rama no toca bracket, pero ningún array puede quedar directamente dentro de otro array en nada que se guarde.
- Tras cada tarea que cambie `app.js`, correr `node tools/check-liga.mjs` y `node tools/check-invitacion.mjs`; ninguna tarea de este plan mueve los marcadores, así que las dos deben seguir imprimiendo su línea de éxito.

---

### Task 1: Registro global de alias — lectura/escritura y generación de código

Las funciones puras y las de Firestore que sostienen todo lo demás. `generarCodigoAlias` es pura y va dentro del bloque recortable; `loadAliases`/`saveAliases` tocan Firestore y van justo al lado de `loadHistory`/`saveHistory`, que siguen el mismo patrón.

**Files:**
- Modify: `app.js:198` — inmediatamente después de `function generarJoinCode(){...}`, agregar `generarCodigoAlias` (queda dentro del bloque puro, antes de `/* ---- bracket ---- */`)
- Modify: `app.js:155` — inmediatamente después de `async function pushHistory(t){...}`, agregar `loadAliases`/`saveAliases`

**Interfaces:**
- Consumes: `ALFABETO_CODIGO` (ya existe, `app.js:197`), `fGet`/`fSet` (ya existen, `app.js:19-26`).
- Produces:
  - `generarCodigoAlias() -> string` — 4 caracteres de `ALFABETO_CODIGO`, sin prefijo.
  - `loadAliases() -> Promise<{[aliasNormalizado]: string}>` — el mapa completo, `{}` si el documento no existe.
  - `saveAliases(mapa: {[aliasNormalizado]: string}) -> Promise<void>`.

- [ ] **Step 1: Agregar `generarCodigoAlias` al lado de `generarJoinCode`**

En `app.js`, después de la función `generarJoinCode`:

```js
// Código del registro global de alias: mismo alfabeto que generarJoinCode (sin
// caracteres que se confunden al dictar), pero sin el prefijo NOV- — ese prefijo
// identifica códigos de torneo, este es un namespace distinto.
function generarCodigoAlias(){
  let s = '';
  for(let i=0;i<4;i++) s += ALFABETO_CODIGO[Math.floor(Math.random()*ALFABETO_CODIGO.length)];
  return s;
}
```

- [ ] **Step 2: Agregar `loadAliases`/`saveAliases` al lado de `loadHistory`/`saveHistory`**

En `app.js`, después de `async function pushHistory(t){...}`:

```js
/* ---- alias protegido (global) ---- */
// meta/aliases: un documento único { items: { [aliasNormalizado]: código } }, mismo
// patrón de lectura/escritura entera que meta/history — cero infraestructura nueva.
async function loadAliases(){ const a = await fGet('meta','aliases'); return (a && a.items) || {}; }
async function saveAliases(mapa){ await fSet('meta','aliases', {items:mapa}); }
```

- [ ] **Step 3: Verificar que el bloque puro sigue sano**

Run: `node tools/check-liga.mjs && node tools/check-invitacion.mjs`
Expected: PASS las dos — `generarCodigoAlias` no rompe el recorte entre `function newId()` y `/* ---- bracket ---- */` porque queda antes de ambos marcadores, y `loadAliases`/`saveAliases` quedan fuera del bloque recortado (usan `fGet`/`fSet`, que tampoco están en ese bloque).

- [ ] **Step 4: Verificar sintaxis del archivo completo**

Run: `node --input-type=module --check < app.js`
Expected: exit 0, sin salida.

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "C · registro global de alias: generarCodigoAlias, loadAliases, saveAliases"
```

---

### Task 2: Persistencia local del código por dispositivo

`localStorage['noventeros.misAlias']`, mismo patrón try/catch vacío que `leerMisTorneos`/`guardarMisTorneos`.

**Files:**
- Modify: `app.js:107` — inmediatamente después de `function setTorneoActivoId(id){...}`, antes de `async function loadIndex(){...}`

**Interfaces:**
- Consumes: `norm` (ya existe, `app.js:58`).
- Produces:
  - `LS_ALIAS` — constante, `'noventeros.misAlias'`.
  - `misAliasCodigos() -> {[aliasNormalizado]: string}` — `{}` si no hay nada guardado o `localStorage` no está disponible.
  - `guardarAliasCodigo(alias: string, codigo: string) -> void`.

- [ ] **Step 1: Agregar los tres**

En `app.js`, después de `function setTorneoActivoId(id){...}`:

```js
/* ---- mi código de alias (dispositivo) ---- */
// Qué código conoce este dispositivo para cada alias que reclamó o desbloqueó. Si el
// dispositivo ya tiene el código correcto para un alias, nunca vuelve a pedírselo.
const LS_ALIAS = 'noventeros.misAlias';
function misAliasCodigos(){
  try{ return JSON.parse(localStorage.getItem(LS_ALIAS)) || {}; }
  catch(e){ return {}; }   // modo privado o JSON corrupto: se empieza de cero
}
function guardarAliasCodigo(alias, codigo){
  try{
    const m = misAliasCodigos();
    m[norm(alias)] = codigo;
    localStorage.setItem(LS_ALIAS, JSON.stringify(m));
  }catch(e){}
}
```

- [ ] **Step 2: Verificar**

Run: `node tools/check-liga.mjs && node tools/check-invitacion.mjs && node --input-type=module --check < app.js`
Expected: las dos líneas de éxito, y el parse-check sin salida (exit 0).

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "C · localStorage.misAlias: el código que este dispositivo ya conoce por alias"
```

---

### Task 3: `intentarRegistro` — el único camino que escribe un jugador

Extrae la lógica de escritura que hoy vive inline en el submit de `renderRegister`, para que el submit directo y (en la Tarea 5) la confirmación del drawer compartan el mismo camino.

**Files:**
- Modify: `app.js:581-651` — dentro de `renderRegister`, se **mueve** la lógica de recarga+re-chequeo+escritura a una función nueva, y el handler de submit pasa a llamarla

**Interfaces:**
- Consumes: `loadTournament`, `hayCupo`, `aliasTaken`, `clubTaken`, `countryTaken`, `saveTournament`, `uid` (todas ya existen).
- Produces:
  - `intentarRegistro(tournamentId: string, {alias, club, country}: {alias:string, club:string, country:string}) -> Promise<{ok:true} | {ok:false, campo:'alias'|'club'|'country'|null, error:string}>`

- [ ] **Step 1: Agregar `intentarRegistro`**

En `app.js`, inmediatamente **antes** de `function renderRegister(){`:

```js
// Único camino que escribe un jugador a un torneo. Recarga el torneo fresco y
// re-chequea cupo/duplicados contra ese estado, no contra lo que se validó al tipear —
// puede haber pasado tiempo entre que alguien completó el formulario y que esto corre
// (por ejemplo, mientras busca el código de un alias protegido en el drawer).
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

- [ ] **Step 2: Reemplazar el cuerpo del submit para usar `intentarRegistro`**

En `renderRegister`, el handler de `document.getElementById('btn-submit').onclick` queda así (reemplaza el bloque completo actual, desde `const elAlias = ...` hasta el `setTimeout(()=>render(), 700);` final, sin tocar nada antes ni después de ese `onclick`):

```js
  document.getElementById('btn-submit').onclick = async (ev)=> conCarga(ev.currentTarget, 'Enviando…', async ()=>{
    // Referencias capturadas UNA vez, antes de cualquier await: si mientras se
    // envía llega una actualización remota (otro jugador inscribiéndose a la vez)
    // y eso repinta #main, document.getElementById ya no encontraría estos nodos.
    // Con la referencia ya en mano, escribir en un nodo desprendido no falla, solo
    // no se ve — que es exactamente lo correcto si la vista ya cambió.
    const elAlias = document.getElementById('in-alias'), elClub = document.getElementById('in-club'), elCountry = document.getElementById('in-country');
    const errAlias = document.getElementById('err-alias'), errClub = document.getElementById('err-club'), errCountry = document.getElementById('err-country');
    const regMsg = document.getElementById('reg-msg');
    const alias = elAlias.value.trim();
    const club = elClub.value.trim();
    const country = elCountry.value.trim();
    errAlias.textContent='';
    errClub.textContent='';
    errCountry.textContent='';
    let formatoOk = true;
    if(!alias){ errAlias.textContent='Escribe un alias.'; formatoOk=false; }
    const clubMatch = findTeamMatch(club,'club');
    if(!club){ errClub.textContent='Escribe un club.'; formatoOk=false; }
    else if(!clubMatch){ errClub.textContent='Ese club no existe en la lista válida de FC26.'; formatoOk=false; }
    const countryMatch = findTeamMatch(country,'country');
    if(!country){ errCountry.textContent='Escribe un país.'; formatoOk=false; }
    else if(!countryMatch){ errCountry.textContent='Ese país no existe en la lista válida de FC26.'; formatoOk=false; }
    if(!formatoOk) return;

    const resultado = await intentarRegistro(t.id, {alias, club:clubMatch, country:countryMatch});
    if(!resultado.ok){
      if(resultado.campo==='alias') errAlias.textContent = resultado.error;
      else if(resultado.campo==='club') errClub.textContent = resultado.error;
      else if(resultado.campo==='country') errCountry.textContent = resultado.error;
      else regMsg.innerHTML = `<span class="field-error">${esc(resultado.error)}</span>`;
      return;
    }
    regMsg.innerHTML = '<span class="field-ok"><span class="material-symbols-outlined" style="font-size:1em;">check_circle</span> ¡Inscripción confirmada! Nos vemos en la cancha.</span>';
    setTimeout(()=>render(), 700);
  });
```

Nota para quien implemente: esta tarea **no** agrega todavía el chequeo de alias global (`loadAliases`) ni el drawer — eso es la Tarea 5. Esta tarea solo mueve la escritura a `intentarRegistro` y verifica que el formulario sigue funcionando exactamente igual que antes (mismos mensajes, mismo comportamiento). `findTeamMatch(club,'club')`/`findTeamMatch(country,'country')` siguen llamándose antes de `intentarRegistro`, porque son validación de formato contra `INDEX.validTeams`, no contra el estado del torneo — no tienen por qué recargarse.

- [ ] **Step 3: Verificar**

Run: `node tools/check-liga.mjs && node tools/check-invitacion.mjs && node --input-type=module --check < app.js`
Expected: las dos líneas de éxito, y el parse-check sin salida.

- [ ] **Step 4: Probarlo a mano**

```bash
python3 -m http.server 8000
```

Con un torneo en inscripción, entrar como jugador (vía `joinCode`) e inscribirse con un
alias, club y país válidos. Expected: mismo comportamiento que antes de esta tarea —
mensaje de éxito, jugador aparece en la lista de inscritos. Probar también un alias
duplicado dentro del mismo torneo: debe seguir mostrando "Ese alias ya está tomado." bajo
el campo de alias, igual que siempre.

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "C · extraer intentarRegistro() del submit de inscripción"
```

---

### Task 4: Generalizar el drawer — despachador y CSS compartido

Antes de que exista un segundo drawer, se prepara el terreno: `renderDrawer()` como despachador, y `.drawer-sorteo` pasa a `.drawer-card` (el cascarón visual compartido). Esta tarea no cambia ningún comportamiento visible — el aviso de sorteo se sigue viendo idéntico.

**Files:**
- Modify: `app.js:420` — `render()` llama `renderDrawer()` en vez de `renderDrawerSorteo()`
- Modify: `app.js:889-912` — la función `renderDrawerSorteo` (agregar `renderDrawer` justo antes; renombrar la clase CSS usada adentro)
- Modify: `style.css:131-150` — renombrar `.drawer-sorteo` a `.drawer-card`

**Interfaces:**
- Consumes: `renderDrawerSorteo` (ya existe, sin cambios de firma).
- Produces:
  - `let DRAWER_ALIAS = null;` — global, la Tarea 5 lo llena y lo lee.
  - `renderDrawer() -> void` — despachador; si `DRAWER_ALIAS` no es `null` llama a `renderDrawerAlias()` (Tarea 5), si no, a `renderDrawerSorteo()`.

- [ ] **Step 1: Renombrar la clase en CSS**

En `style.css`, reemplazar cada aparición de `.drawer-sorteo` por `.drawer-card` (son 5:
la definición y `.drawer-sorteo .ds-text`, `.drawer-sorteo .ds-text b`, `.drawer-sorteo
.ds-x`, `.drawer-sorteo .ds-x:hover`). El comentario de arriba del bloque (`/* Aviso de
sorteo nuevo. ...*/`) se actualiza para reflejar que ya no es solo del sorteo:

```css
  /* Cascarón compartido por cualquier drawer: se apoya sobre el tabbar y no se va hasta
     que se lo atiende. Anuncia un momento que acaba de pasar o una acción que necesita
     tu atención ahora — nunca decora en reposo, así que el verde está permitido
     (MARCA.md §07, §08). */
  #drawer{
    position:fixed;bottom:calc(62px + env(safe-area-inset-bottom));left:0;right:0;
    max-width:480px;margin:0 auto;z-index:29;pointer-events:none;
  }
  .drawer-card{
    pointer-events:auto;display:flex;align-items:center;gap:10px;margin:0 12px;
    padding:12px 14px;border-radius:14px;background:var(--panel-elevated);
    border:1px solid var(--lineBright);
    box-shadow:0 10px 30px var(--shadow-deep), 0 0 20px var(--accent-glow);
  }
  .drawer-card .ds-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;}
  .drawer-card .ds-text b{font-size:13px;color:var(--accent);}
  .drawer-card .ds-x{
    background:none;border:none;color:var(--muted-dark);font-size:18px;line-height:1;
    padding:6px;cursor:pointer;flex-shrink:0;
  }
  .drawer-card .ds-x:hover{color:var(--silver);}
```

- [ ] **Step 2: Actualizar la clase en `renderDrawerSorteo` y agregar el despachador**

En `app.js`, dentro de `renderDrawerSorteo`, cambiar `<div class="drawer-sorteo">` por
`<div class="drawer-card">`. Justo **antes** de `function renderDrawerSorteo(){`, agregar:

```js
// Un pedido de código de alias (Tarea 5) tiene prioridad sobre el aviso ambiente de
// sorteo: mientras el jugador resuelve una inscripción bloqueada, no tiene sentido
// taparle el drawer con el aviso de otro torneo.
let DRAWER_ALIAS = null;
function renderDrawer(){
  if(DRAWER_ALIAS) return renderDrawerAlias();
  renderDrawerSorteo();
}
```

`renderDrawerAlias` todavía no existe — lo agrega la Tarea 5. Como `DRAWER_ALIAS` arranca
en `null`, `renderDrawer()` siempre cae a `renderDrawerSorteo()` hasta que exista esa
función, así que esta tarea no deja el árbol roto.

- [ ] **Step 3: Cambiar la llamada en `render()`**

En `app.js`, dentro de `render()`, cambiar la línea `renderDrawerSorteo();` por
`renderDrawer();`.

- [ ] **Step 4: Verificar**

Run: `node tools/check-liga.mjs && node tools/check-invitacion.mjs && node --input-type=module --check < app.js`
Expected: las dos líneas de éxito, y el parse-check sin salida.

- [ ] **Step 5: Probarlo a mano**

Con el server andando, provocar el aviso de sorteo existente (un torneo con al menos una
etapa sorteada, visto desde un dispositivo/joinCode que todavía no lo vio). Expected: el
drawer se ve y se comporta exactamente igual que antes de esta tarea — mismo texto,
mismos botones "Ver sorteo"/"✕".

- [ ] **Step 6: Commit**

```bash
git add app.js style.css
git commit -m "C · generalizar el drawer: renderDrawer() como despachador, .drawer-card compartida"
```

---

### Task 5: El drawer de código y el reclamo de alias

Conecta todo: el submit detecta un alias protegido, el drawer pide el código, y el reclamo de un alias nuevo deja el código en el mensaje de éxito.

**Files:**
- Modify: `app.js` — dentro de `intentarRegistro` y del submit de `renderRegister` (Tarea 3), agregar el chequeo del registro global y el reclamo
- Modify: `app.js` — agregar `renderDrawerAlias`, justo después de `renderDrawerSorteo`

**Interfaces:**
- Consumes: `loadAliases`, `saveAliases`, `generarCodigoAlias` (Tarea 1); `misAliasCodigos`, `guardarAliasCodigo` (Tarea 2); `intentarRegistro` (Tarea 3, se le agrega un paso); `DRAWER_ALIAS`, `renderDrawer` (Tarea 4); `norm`, `conCarga`, `esc` (ya existen).
- Produces:
  - `renderDrawerAlias() -> void`.
  - El submit de `renderRegister` pasa a poder dejar `DRAWER_ALIAS` seteado en vez de completar la inscripción.

- [ ] **Step 1: Agregar el reclamo al final de `intentarRegistro`**

En `app.js`, reemplazar el final de `intentarRegistro` (desde `fresh.players.push` hasta el `return {ok:true};`) por:

```js
  fresh.players.push({id:uid(), alias, club, country, assignedTeam:null});
  await saveTournament(fresh);
  // Reclamo del alias: va DESPUÉS de que la inscripción ya se guardó. Si esto falla
  // (ej. se cortó la conexión), el jugador ya quedó inscrito — en el peor caso alguien
  // más podría reclamar el alias antes que él la próxima vez, degradación aceptable en
  // vez de sumar una transacción para un caso raro.
  if(!(norm(alias) in await loadAliases())){
    const codigo = generarCodigoAlias();
    const registro = await loadAliases();
    await saveAliases({...registro, [norm(alias)]: codigo});
    guardarAliasCodigo(alias, codigo);
    return {ok:true, codigoNuevo:codigo};
  }
  return {ok:true};
```

Nota: `loadAliases()` se llama dos veces a propósito (una para el chequeo `in`, otra para
tener el mapa fresco justo antes de escribir) — es la misma clase de "recargar antes de
escribir" que ya usa el resto del archivo (`loadTournament` antes de cada guardado), no
una lectura redundante a eliminar.

- [ ] **Step 2: Chequear el alias global ANTES de escribir, en el submit**

En `app.js`, dentro del handler de `btn-submit` de `renderRegister` (el que dejó la Tarea
3), reemplazar el bloque:

```js
    const resultado = await intentarRegistro(t.id, {alias, club:clubMatch, country:countryMatch});
    if(!resultado.ok){
      if(resultado.campo==='alias') errAlias.textContent = resultado.error;
      else if(resultado.campo==='club') errClub.textContent = resultado.error;
      else if(resultado.campo==='country') errCountry.textContent = resultado.error;
      else regMsg.innerHTML = `<span class="field-error">${esc(resultado.error)}</span>`;
      return;
    }
    regMsg.innerHTML = '<span class="field-ok"><span class="material-symbols-outlined" style="font-size:1em;">check_circle</span> ¡Inscripción confirmada! Nos vemos en la cancha.</span>';
    setTimeout(()=>render(), 700);
```

por:

```js
    const registroGlobal = await loadAliases();
    const codigoConocido = misAliasCodigos()[norm(alias)];
    if(registroGlobal[norm(alias)] && registroGlobal[norm(alias)] !== codigoConocido){
      // Alias protegido por otra persona (u otro dispositivo): no se escribe nada
      // todavía, se abre el drawer a pedir el código.
      DRAWER_ALIAS = {tournamentId: t.id, alias, club: clubMatch, country: countryMatch};
      render();
      return;
    }

    const resultado = await intentarRegistro(t.id, {alias, club:clubMatch, country:countryMatch});
    if(!resultado.ok){
      if(resultado.campo==='alias') errAlias.textContent = resultado.error;
      else if(resultado.campo==='club') errClub.textContent = resultado.error;
      else if(resultado.campo==='country') errCountry.textContent = resultado.error;
      else regMsg.innerHTML = `<span class="field-error">${esc(resultado.error)}</span>`;
      return;
    }
    regMsg.innerHTML = '<span class="field-ok"><span class="material-symbols-outlined" style="font-size:1em;">check_circle</span> ¡Inscripción confirmada! Nos vemos en la cancha.</span>'
      + (resultado.codigoNuevo ? `<br><span class="small muted">Guardá este código por si usás este alias desde otro dispositivo: <b>${esc(resultado.codigoNuevo)}</b> (no es una contraseña, solo evita que otro jugador use tu alias por error).</span>` : '');
    setTimeout(()=>render(), 700);
```

- [ ] **Step 3: Agregar `renderDrawerAlias`**

En `app.js`, inmediatamente después del cierre de `renderDrawerSorteo` (después del `}`
que cierra esa función):

```js
// El pedido de código que abre el submit de inscripción cuando el alias ya está
// protegido por otro dispositivo. "Cancelar" no deshace nada: el formulario de
// inscripción sigue intacto detrás, solo se limpia el pedido pendiente.
function renderDrawerAlias(){
  const el = document.getElementById('drawer');
  const pedido = DRAWER_ALIAS;
  el.innerHTML = `<div class="drawer-card" style="align-items:flex-start;flex-direction:column;gap:10px;">
    <div class="ds-text">
      <b>Este alias ya está protegido</b>
      <span class="small muted">Alguien ya usa "${esc(pedido.alias)}" en otro dispositivo. Si sos vos, escribí el código que guardaste.</span>
    </div>
    <input id="da-codigo" placeholder="Código" maxlength="4" style="text-transform:uppercase;">
    <div id="da-error" class="field-error"></div>
    <div class="row" style="width:100%;gap:8px;">
      <button class="btn ghost" id="da-cancelar" style="flex:1;">Cancelar</button>
      <button class="btn" id="da-confirmar" style="flex:1;">Confirmar</button>
    </div>
  </div>`;
  el.querySelector('#da-cancelar').onclick = () => { DRAWER_ALIAS = null; render(); };
  el.querySelector('#da-confirmar').onclick = async (ev) => conCarga(ev.currentTarget, 'Verificando…', async ()=>{
    const inputEl = document.getElementById('da-codigo');
    const errorEl = document.getElementById('da-error');
    const codigo = inputEl.value.trim().toUpperCase();
    const registro = await loadAliases();
    if(registro[norm(pedido.alias)] !== codigo){
      errorEl.textContent = 'Código incorrecto.';
      return;
    }
    guardarAliasCodigo(pedido.alias, codigo);
    const resultado = await intentarRegistro(pedido.tournamentId, pedido);
    DRAWER_ALIAS = null;
    if(!resultado.ok){
      await mostrarAviso(resultado.error, {titulo:'No se pudo completar', icono:'error'});
      render();
      return;
    }
    render();
  });
}
```

Nota: si `intentarRegistro` falla en este punto (ej. el torneo se cerró mientras el
jugador buscaba su código), se usa `mostrarAviso` — el modal genérico que ya existe
(`app.js`, cerca de `mostrarConfirmacion`) — porque en ese momento ya no hay formulario
de inscripción visible al que devolver un error inline: `render()` ya movió la vista al
estado post-cierre de inscripciones antes de que el aviso se muestre.

- [ ] **Step 4: Verificar**

Run: `node tools/check-liga.mjs && node tools/check-invitacion.mjs && node --input-type=module --check < app.js`
Expected: las dos líneas de éxito, y el parse-check sin salida.

- [ ] **Step 5: Probarlo a mano, con dos dispositivos**

Con el server andando, dos torneos abiertos (o el mismo torneo con cupo para dos):

1. Desde el dispositivo A, inscribirse en el Torneo 1 con un alias nuevo, ej.
   "ElCraque22". Expected: mensaje de éxito con una línea de código, ej. "Guardá este
   código... **XYZ2**".
2. Desde el dispositivo B (o una ventana privada), inscribirse en el Torneo 2 con el
   mismo alias "ElCraque22". Expected: no se inscribe todavía — aparece el drawer "Este
   alias ya está protegido".
3. En el drawer, escribir un código incorrecto y confirmar. Expected: "Código
   incorrecto.", el drawer sigue abierto, se puede reintentar.
4. Escribir el código correcto (el de paso 1) y confirmar. Expected: la inscripción se
   completa, el drawer se cierra, el jugador aparece en la lista del Torneo 2.
5. Desde el dispositivo A, inscribirse con el mismo alias "ElCraque22" en un Torneo 3.
   Expected: no aparece el drawer — el dispositivo ya tiene el código guardado.

- [ ] **Step 6: Commit**

```bash
git add app.js
git commit -m "C · drawer de código y reclamo de alias en el submit de inscripción"
```

---

### Task 6: Cerrar el sub-proyecto

**Files:**
- Modify: `ROADMAP.md:45-55` — estado y link al plan

- [ ] **Step 1: Correr la verificación del roadmap**

```bash
grep -n 'misAlias\|meta.,.aliases' app.js
```

Expected: no vacío — debe encontrar `LS_ALIAS`, `misAliasCodigos`, `guardarAliasCodigo`,
y las llamadas a `fGet('meta','aliases')`/`fSet('meta','aliases', …)` dentro de
`loadAliases`/`saveAliases`.

- [ ] **Step 2: Actualizar el roadmap**

En `ROADMAP.md`, en el sub-proyecto C: `**Estado:** hecho` y agregar el link al plan,
mismo formato que A y B:

```
**Estado:** hecho · **Depende de:** A · **Spec:** [design](docs/superpowers/specs/2026-09-04-C-alias-protegido-design.md) · **Plan:** [6 tareas](docs/superpowers/plans/2026-09-04-C-alias-protegido.md)
```

- [ ] **Step 3: Commit**

```bash
git add ROADMAP.md
git commit -m "C · alias protegido: hecho"
```
