# A · Multi-torneo con código de invitación — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cualquiera cree su propio torneo con cuenta de Google y comparta un código para que sus amigos se inscriban, en lugar del único torneo global con un solo PIN de admin.

**Architecture:** El organizador se autentica con Firebase Auth (Google) y su `uid` queda en el torneo como `ownerUid`; el jugador nunca se autentica: pega un `joinCode` y el torneo queda anotado en `localStorage`. `meta/config` deja de ser un índice global y se queda solo con `validTeams`. Todo el motor de torneo (standings, grupos, llave, CSV) queda intacto: sigue recibiendo un objeto torneo y comportándose igual.

**Tech Stack:** HTML/CSS/JS sin build ni framework. Firebase 10.13.2 (firestore + **auth**, nuevo) desde el CDN de gstatic como módulos ES. Pruebas: `node` a secas con `node:assert/strict`.

**Spec:** [`docs/superpowers/specs/2026-09-03-A-multi-torneo-invitacion-design.md`](../specs/2026-09-03-A-multi-torneo-invitacion-design.md)

## Global Constraints

- **Sin dependencias nuevas.** Firebase Auth se importa del mismo CDN y en la **misma versión que ya usa el proyecto: `10.13.2`**. Un import de otra versión rompe la instancia compartida de la app.
- **Todo va en `app.js`.** No crear módulos nuevos ni introducir framework, vdom o librería de estado. `render()` despacha sobre el global `VIEW` y repinta la vista entera con `innerHTML`; los handlers se asignan después con `el.onclick = …`. Seguir ese patrón.
- **Español para todo lo que ve el usuario.** Identificadores del código en inglés.
- **No envolver `fSet`/`fDelete` en try/catch que devuelva `false`.** Deben propagar el error; el `unhandledrejection` global lo convierte en el modal de "algo salió mal". Un catch silencioso reintroduce el bug de escrituras perdidas.
- **Todo botón que escriba va dentro de `conCarga(boton, texto, accion)`**, y las referencias al DOM se capturan en `const` **antes del primer `await`**, nunca con un `getElementById` posterior.
- **No mover los marcadores `function newId()` ni `/* ---- bracket ---- */`** de `app.js`: `tools/check-liga.mjs` y el nuevo `tools/check-invitacion.mjs` recortan el bloque entre ambos para poder evaluarlo en node.
- **Reglas de Firestore: no se tocan.** Siguen abiertas a propósito.
- **Marca (`MARCA.md` §07, §08):** el neon verde marca *estado o momento*, nunca decora una superficie en reposo. El código de invitación es información en reposo → `--silver`, sin glow.
- Tras cada tarea que cambie `app.js`, correr `node tools/check-liga.mjs` y verificar que sigue imprimiendo `✓ lógica de liga OK`.

---

### Task 1: Lógica pura del código de invitación

Funciones sin DOM ni Firestore, colocadas dentro del bloque que los scripts de prueba saben recortar. Es la única parte de A que se puede probar automáticamente.

**Files:**
- Modify: `app.js:98` (inmediatamente después de `function uid()`, antes del comentario `/* ================= TOURNAMENT MODEL ================= */`)
- Create: `tools/check-invitacion.mjs`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `generarJoinCode() -> string` — devuelve `"NOV-XXXX"`.
  - `normCodigo(v: string) -> string | null` — normaliza lo que el usuario pegó; `null` si no es un código con forma válida.
  - `agregarTorneo(lista: Array<{id,nombre,rol}>, entrada: {id,nombre,rol}) -> Array` — devuelve una lista nueva, sin duplicar por `id`.

- [ ] **Step 1: Escribir el test que falla**

Crear `tools/check-invitacion.mjs`:

```js
// Chequeo de la lógica de códigos de invitación. Corre con: node tools/check-invitacion.mjs
//
// Mismo truco que check-liga.mjs: app.js es un módulo de navegador y no se puede importar
// desde node, así que se recorta el bloque de funciones puras (entre `function newId()` y
// el marcador `/* ---- bracket ---- */`) y se evalúa.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const src = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const desde = src.indexOf('function newId()');
const hasta = src.indexOf('/* ---- bracket ---- */');
assert.ok(desde > 0 && hasta > desde, 'no se encontró el bloque de lógica pura en app.js');

const { generarJoinCode, normCodigo, agregarTorneo } =
  await import('data:text/javascript,' + encodeURIComponent(
    src.slice(desde, hasta) +
    '\nexport { generarJoinCode, normCodigo, agregarTorneo };'
  ));

/* ---- generarJoinCode ---- */
// Los códigos se dictan por WhatsApp: no pueden contener caracteres que se confundan.
const AMBIGUOS = /[O0I1L]/;
for(let i=0;i<500;i++){
  const c = generarJoinCode();
  assert.match(c, /^NOV-[A-Z0-9]{4}$/, `formato inesperado: ${c}`);
  assert.ok(!AMBIGUOS.test(c.slice(4)), `código con carácter ambiguo: ${c}`);
}
assert.ok(new Set(Array.from({length:200}, generarJoinCode)).size > 150, 'los códigos no varían lo suficiente');

/* ---- normCodigo ---- */
assert.equal(normCodigo('NOV-4K2P'), 'NOV-4K2P', 'el código canónico se conserva');
assert.equal(normCodigo('nov-4k2p'), 'NOV-4K2P', 'acepta minúsculas');
assert.equal(normCodigo('  NOV 4K2P '), 'NOV-4K2P', 'acepta espacios y separador raro');
assert.equal(normCodigo('4K2P'), 'NOV-4K2P', 'acepta el código sin prefijo');
// Caso trampa: un código cuyas 4 letras empiezan por NOV. Pegado sin prefijo son 4
// caracteres; pegado con prefijo son 7. Ninguno de los dos debe perder caracteres.
assert.equal(normCodigo('NOVA'), 'NOV-NOVA', 'sin prefijo, NOVA es el código completo');
assert.equal(normCodigo('NOV-NOVA'), 'NOV-NOVA', 'con prefijo, NOVA sigue siendo el código');
assert.equal(normCodigo(''), null, 'vacío no es código');
assert.equal(normCodigo('4K2'), null, 'tres caracteres no es código');
assert.equal(normCodigo('4K2PX'), null, 'cinco caracteres no es código');
assert.equal(normCodigo(null), null, 'null no revienta');

/* ---- agregarTorneo ---- */
const vacia = [];
const uno = agregarTorneo(vacia, {id:'t1', nombre:'Copa', rol:'jugador'});
assert.equal(vacia.length, 0, 'no muta la lista original');
assert.equal(uno.length, 1, 'agrega el torneo');
const dos = agregarTorneo(uno, {id:'t2', nombre:'Liga', rol:'admin'});
assert.equal(dos.length, 2, 'agrega un segundo torneo');
const repetido = agregarTorneo(dos, {id:'t1', nombre:'Copa', rol:'admin'});
assert.equal(repetido.length, 2, 'no duplica por id');
assert.equal(repetido.find(x=>x.id==='t1').rol, 'admin', 'reentrar con otro rol actualiza el rol');

console.log('✓ lógica de invitación OK');
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node tools/check-invitacion.mjs`
Expected: FAIL — `SyntaxError` o `The requested module does not provide an export named 'generarJoinCode'`, porque las funciones todavía no existen.

- [ ] **Step 3: Implementar**

En `app.js`, justo después de `function uid(){ … }` (línea 98):

```js
/* ---- invitación ---- */
// Alfabeto sin caracteres que se confunden al dictar el código por WhatsApp:
// nada de O/0, nada de I/1/L. Por eso normCodigo() no valida contra este alfabeto:
// si alguien teclea una O, el código simplemente no existirá en Firestore y el
// mensaje de "código no encontrado" es más claro que uno de formato.
const ALFABETO_CODIGO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function generarJoinCode(){
  let s = '';
  for(let i=0;i<4;i++) s += ALFABETO_CODIGO[Math.floor(Math.random()*ALFABETO_CODIGO.length)];
  return 'NOV-'+s;
}
// El jugador pega el código como le llegó: con prefijo o sin él, en minúsculas, con
// espacios o guiones raros. El prefijo solo se quita si al quitarlo quedan 4 caracteres;
// de lo contrario un código que empiece por NOV se comería su propio inicio.
function normCodigo(v){
  let s = String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(s.length===7 && s.startsWith('NOV')) s = s.slice(3);
  return s.length===4 ? 'NOV-'+s : null;
}
// Lista de "mis torneos": sin duplicados por id, y volver a entrar con otro rol
// (te inscribiste como jugador y después creaste el torneo) actualiza el rol.
function agregarTorneo(lista, entrada){
  return [...lista.filter(x=>x.id!==entrada.id), entrada];
}
```

- [ ] **Step 4: Correr los tests**

Run: `node tools/check-invitacion.mjs && node tools/check-liga.mjs`
Expected: PASS — `✓ lógica de invitación OK` y `✓ lógica de liga OK`.

- [ ] **Step 5: Documentar el script nuevo**

En `CLAUDE.md`, en el párrafo que menciona `node tools/check-liga.mjs`, agregar que ahora también existe `node tools/check-invitacion.mjs` y que recorta el mismo bloque entre los mismos marcadores.

- [ ] **Step 6: Commit**

```bash
git add app.js tools/check-invitacion.mjs CLAUDE.md
git commit -m "$(cat <<'EOF'
Agrega la lógica de códigos de invitación

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Google Sign-In en lugar del muro de PIN

Al terminar esta tarea, entrar a la pestaña Admin pide cuenta de Google en vez de PIN, y el PIN deja de existir en el código.

**Files:**
- Modify: `app.js:1-10` (imports e inicialización de Firebase)
- Modify: `app.js:33` (`ADMIN_UNLOCKED`)
- Modify: `app.js:569-600` (los dos bloques de PIN dentro de `renderAdmin`)
- Modify: `app.js:1133-1160` (`boot`)
- Modify: `style.css` (estilo del botón de Google)

**Interfaces:**
- Consumes: nada de Task 1.
- Produces:
  - Global `USER` — `null` o el objeto `User` de Firebase (`uid`, `displayName`, `photoURL`).
  - `entrarConGoogle() -> Promise<void>`
  - `salirDeGoogle() -> Promise<void>`

- [ ] **Step 1: Agregar el import y la instancia de auth**

En `app.js`, reemplazar el bloque de imports e inicialización (líneas 1-10) por:

```js
/* ================= FIREBASE / FIRESTORE ================= */
import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import {
  getFirestore, doc, getDoc, setDoc, deleteDoc, onSnapshot,
  collection, query, where, getDocs
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';

let db = null, auth = null;
try{
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
}catch(e){ /* boot() lo detecta y muestra el mensaje */ }
```

`collection/query/where/getDocs` se importan aquí aunque recién se usen en la Task 3, para no volver a tocar el bloque de imports.

- [ ] **Step 2: Reemplazar `ADMIN_UNLOCKED` por `USER`**

En `app.js`, línea 33: borrar `let ADMIN_UNLOCKED = false;` y poner `let USER = null;   // sesión de Google del organizador, o null`.

Agregar, junto a los otros helpers de estado:

```js
// El organizador se autentica; el jugador nunca. La cuenta existe para que un torneo
// no quede huérfano si se pierde el dispositivo, NO como seguridad: las reglas de
// Firestore siguen abiertas a propósito (ver README).
async function entrarConGoogle(){
  await signInWithPopup(auth, new GoogleAuthProvider());
}
async function salirDeGoogle(){
  await signOut(auth);
}
// ¿Soy el organizador de este torneo?
const soyOwner = t => !!USER && !!t && t.ownerUid === USER.uid;
```

- [ ] **Step 3: Cambiar la pantalla de acceso de Admin**

En `app.js`, reemplazar los dos bloques iniciales de `renderAdmin()` (el de "Configura tu PIN" y el de "Acceso de administrador", líneas 570-601) por uno solo:

```js
function renderAdmin(){
  if(!USER){
    $main.innerHTML = `<div class="lock-screen">
      <div class="ic"><span class="material-symbols-outlined">stadium</span></div>
      <h3>Organiza tu torneo</h3>
      <p class="muted small">Entra con tu cuenta de Google para crear torneos e invitar a tus amigos. Así tu torneo no se queda sin organizador aunque cambies de teléfono.</p>
      <button class="btn" id="login-google" style="margin-top:16px;">Entrar con Google</button>
      <p class="muted small" style="margin-top:14px;">¿Te invitaron a un torneo? No necesitas cuenta: pega tu código desde <b>Inicio</b>.</p>
    </div>`;
    document.getElementById('login-google').onclick = async (ev)=> conCarga(ev.currentTarget, 'Abriendo…', entrarConGoogle);
    return;
  }
  // …el resto de renderAdmin queda igual (las pestañas panel/equipos/torneos/lista)
```

- [ ] **Step 4: Agregar el botón de salir en la cabecera de Admin**

Dentro de `renderAdmin()`, en la línea que arma el `section-title` de "Administración", reemplazarla por:

```js
  let html = `<div class="section-title"><div class="num"><span class="material-symbols-outlined">stadium</span></div><h3>Administración</h3></div>
  <div class="card tight" style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
    <span class="small muted">Sesión de <b>${esc(USER.displayName || USER.email || 'organizador')}</b></span>
    <button class="btn small ghost" id="logout-google">Salir</button>
  </div>`;
```

y después de `$main.innerHTML = html;`, antes de la línea que enlaza `[data-asub]`:

```js
  document.getElementById('logout-google').onclick = async (ev)=> conCarga(ev.currentTarget, 'Saliendo…', salirDeGoogle);
```

- [ ] **Step 5: Reaccionar al cambio de sesión en `boot`**

En `app.js`, dentro de `boot()`, justo antes de la línea `render();` del final:

```js
  // La sesión de Google se restaura de forma asíncrona al cargar la página: sin este
  // listener, la primera pintada de Admin siempre mostraría el botón de entrar aunque
  // ya hubiera sesión. Solo repinta si estás mirando Admin, para no interrumpir otra vista.
  onAuthStateChanged(auth, u => {
    USER = u;
    if(VIEW==='admin') render();
  });
```

- [ ] **Step 6: Estilo del botón, según la marca**

En `style.css`, junto a las reglas de `.lock-screen`, agregar:

```css
/* El acceso del organizador es una acción, no un estado: sin glow en reposo.
   MARCA.md §08 — el neon marca estado o momento, no decora una superficie quieta. */
.lock-screen .btn { width:100%; max-width:280px; }
.lock-screen p { max-width:320px; margin-inline:auto; }
```

- [ ] **Step 7: Autorizar el dominio en Firebase (manual, una vez)**

En la consola de Firebase → **Authentication → Sign-in method**, habilitar **Google**. En **Authentication → Settings → Authorized domains**, agregar el dominio de GitHub Pages (`<usuario>.github.io`). `localhost` ya viene autorizado por defecto.

- [ ] **Step 8: Verificar a mano**

Levantar con `python3 -m http.server` y abrir `http://localhost:8000`.
Esperado: la pestaña Admin muestra "Entrar con Google"; el popup abre; al volver se ve "Sesión de <tu nombre>" y las cuatro pestañas de admin; "Salir" devuelve a la pantalla de acceso; recargar la página mantiene la sesión.
Correr además: `node tools/check-liga.mjs && node tools/check-invitacion.mjs` → ambos en verde.

- [ ] **Step 9: Commit**

```bash
git add app.js style.css
git commit -m "$(cat <<'EOF'
Reemplaza el PIN de admin por Google Sign-In

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Torneos con dueño y código, y lista propia del organizador

El torneo nace con `ownerUid` y `joinCode`, se muestra la tarjeta de invitación, y "Torneos existentes" pasa a listar solo los tuyos consultando Firestore por `ownerUid`.

**Files:**
- Modify: `app.js:107-122` (`blankTournament`)
- Modify: `app.js:842-940` (`renderAdminTorneos`)
- Modify: `style.css` (tarjeta de invitación)

**Interfaces:**
- Consumes: `generarJoinCode()` (Task 1); `USER`, `soyOwner(t)` (Task 2).
- Produces:
  - `blankTournament(...)` ahora devuelve además `ownerUid`, `ownerName`, `joinCode`.
  - `misTorneosComoOwner() -> Promise<Array<torneo>>`
  - `leerMisTorneos() -> Array<{id,nombre,rol}>` y `guardarMisTorneos(lista) -> void`
  - `tarjetaInvitacion(t) -> string` (HTML) y `bindTarjetaInvitacion(raiz) -> void`

- [ ] **Step 1: Dar dueño y código al torneo**

En `app.js`, en `blankTournament()`, agregar tres campos al objeto devuelto, después de `id:newId(), name, size, eventDate, regDeadline,`:

```js
    ownerUid: null,        // uid de Google del organizador; lo pone quien lo crea
    ownerName: '',         // displayName, solo para mostrar "Organiza: …"
    joinCode: generarJoinCode(),  // "NOV-4K2P" — se comparte, no cambia nunca
```

- [ ] **Step 2: Correr check-liga**

Run: `node tools/check-liga.mjs`
Expected: PASS — `blankTournament` vive dentro del bloque recortado, así que este paso confirma que agregar campos no rompió el recorte.

- [ ] **Step 3: Helpers de `localStorage`**

En `app.js`, junto a los helpers de estado (después de `soyOwner`):

```js
/* ---- mis torneos (dispositivo) ---- */
// El jugador no tiene cuenta: la pertenencia a un torneo vive en el dispositivo.
// Si borra los datos del navegador, vuelve a pegar el código y no perdió nada.
const LS_TORNEOS = 'noventeros.misTorneos';
const LS_ACTIVO  = 'noventeros.torneoActivo';
function leerMisTorneos(){
  try{ return JSON.parse(localStorage.getItem(LS_TORNEOS)) || []; }
  catch(e){ return []; }   // modo privado o JSON corrupto: se empieza de cero
}
function guardarMisTorneos(lista){
  try{ localStorage.setItem(LS_TORNEOS, JSON.stringify(lista)); }catch(e){}
}
function torneoActivoId(){
  try{ return localStorage.getItem(LS_ACTIVO); }catch(e){ return null; }
}
function setTorneoActivoId(id){
  try{ id ? localStorage.setItem(LS_ACTIVO, id) : localStorage.removeItem(LS_ACTIVO); }catch(e){}
}
```

- [ ] **Step 4: La tarjeta de invitación**

En `app.js`, antes de `renderAdminTorneos`:

```js
// El código es información en reposo, no un estado ni un momento: va en plata, sin
// glow (MARCA.md §07 y §08). El verde aparece solo en el instante de copiar.
function tarjetaInvitacion(t){
  const link = location.origin + location.pathname + '?j=' + encodeURIComponent(t.joinCode);
  return `<div class="card invite">
    <div class="n4">Invita a tus amigos</div>
    <div class="invite-code" id="inv-code">${esc(t.joinCode)}</div>
    <div class="invite-actions">
      <button class="btn small ghost" data-copy="${esc(t.joinCode)}">Copiar código</button>
      <button class="btn small ghost" data-copy="${esc(link)}">Copiar link</button>
    </div>
    <p class="small muted">Quien tenga el código puede inscribirse. No necesita cuenta.</p>
  </div>`;
}
function bindTarjetaInvitacion(raiz){
  raiz.querySelectorAll('[data-copy]').forEach(b => b.onclick = async ()=>{
    const original = b.textContent;
    try{ await navigator.clipboard.writeText(b.dataset.copy); }
    catch(e){ b.textContent = 'No se pudo copiar'; setTimeout(()=>{ b.textContent = original; }, 1400); return; }
    b.textContent = '¡Copiado!';
    b.classList.add('ok');   // el verde marca el momento, y se apaga solo
    setTimeout(()=>{ b.textContent = original; b.classList.remove('ok'); }, 1400);
  });
}
```

- [ ] **Step 5: Estilos de la tarjeta**

En `style.css`, al final:

```css
/* Tarjeta de invitación. El código se dicta y se teclea: monoespaciado y grande.
   MARCA.md §07 — una etiqueta fija va en --silver, no en --accent. */
.invite { text-align:center; }
.invite-code{
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 30px; font-weight: 700; letter-spacing: .14em;
  color: var(--silver); margin: 10px 0 14px;
}
.invite-actions{ display:flex; gap:8px; justify-content:center; flex-wrap:wrap; }
/* El verde solo en el momento de copiar (MARCA.md §08: estado o momento, nunca reposo). */
.btn.small.ghost.ok{ color: var(--accent); border-color: var(--accent); }
```

- [ ] **Step 6: Crear el torneo con dueño, código y registro local**

En `app.js`, dentro de `renderAdminTorneos`, en el handler de `create-t`, reemplazar el bloque desde `const t = blankTournament(...)` hasta `renderAdmin();` por:

```js
    const t = blankTournament(name,size,eventDate,regDeadline,mode,vuelta);
    t.ownerUid  = USER.uid;
    t.ownerName = USER.displayName || '';
    await saveTournament(t);
    // El organizador también es "miembro" en su dispositivo: así el torneo aparece en
    // Mis torneos sin depender de la consulta por ownerUid, que es la vía de rescate.
    guardarMisTorneos(agregarTorneo(leerMisTorneos(), {id:t.id, nombre:t.name, rol:'admin'}));
    setTorneoActivoId(t.id);
    CURRENT = t;
    attachTournamentListener(t.id);
    renderAdmin();
```

- [ ] **Step 7: Listar solo los torneos del organizador**

En `app.js`, antes de `renderAdminTorneos`, agregar:

```js
// Los torneos del organizador se consultan a Firestore por ownerUid, no se leen del
// dispositivo: es lo que le permite recuperarlos al entrar con Google en otro teléfono.
async function misTorneosComoOwner(){
  if(!USER) return [];
  const snap = await getDocs(query(collection(db,'tournaments'), where('ownerUid','==',USER.uid)));
  return snap.docs.map(d=>d.data());
}
```

Y reemplazar, dentro de `renderAdminTorneos`, el bloque que arma "Torneos existentes" a partir de `INDEX.tournaments` (desde `html += \`<div class="section-title">…list_alt…` hasta el `holder.innerHTML = html;`) por:

```js
  html += `<div class="section-title"><div class="num"><span class="material-symbols-outlined">list_alt</span></div><h3>Mis torneos</h3></div>`;
  html += `<div id="owner-list"><div class="empty small">Cargando…</div></div>`;
  holder.innerHTML = html;

  // Se pinta después porque necesita una consulta. La referencia se captura ya, antes
  // del await: si llega una actualización remota y se repinta #main, escribir en el nodo
  // desprendido no falla, simplemente no se ve — que es lo correcto si la vista cambió.
  const ownerList = document.getElementById('owner-list');
  misTorneosComoOwner().then(torneos=>{
    if(torneos.length===0){ ownerList.innerHTML = `<div class="empty small">Todavía no creaste ningún torneo.</div>`; return; }
    // La consulta es también la vía de rescate: sincroniza el dispositivo con lo que
    // realmente existe en Firestore bajo esta cuenta.
    let lista = leerMisTorneos();
    torneos.forEach(tt => { lista = agregarTorneo(lista, {id:tt.id, nombre:tt.name, rol:'admin'}); });
    guardarMisTorneos(lista);

    const activo = torneoActivoId();
    ownerList.innerHTML = `<div class="card tight">` + torneos.map(tt=>`<div class="list-item">
      <span class="name">${esc(tt.name)} <span class="badge">${tt.mode==='liga'?'Liga':'Copa'}</span> ${activo===tt.id?'<span class="badge on">activo</span>':''}<br><span class="n4">${esc(tt.joinCode||'—')}</span></span>
      <span class="sub" style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
        ${activo!==tt.id?`<button class="btn small ghost" data-act="activate" data-id="${tt.id}">Activar</button>`:''}
        <button class="btn small ghost" data-act="export" data-id="${tt.id}"><span class="material-symbols-outlined" style="font-size:1em;">download</span></button>
        <button class="btn small danger" data-act="delete" data-id="${tt.id}">Eliminar</button>
      </span></div>`).join('') + `</div>`;
    bindAccionesTorneo(ownerList);
  });
  if(CURRENT && soyOwner(CURRENT)){
    const invite = document.createElement('div');
    invite.innerHTML = tarjetaInvitacion(CURRENT);
    holder.prepend(invite);
    bindTarjetaInvitacion(invite);
  }
```

- [ ] **Step 8: Mover los handlers de activar/exportar/eliminar a su propia función**

Los tres `holder.querySelectorAll('[data-act=…]')` del final de `renderAdminTorneos` ahora corren sobre una lista que se pinta más tarde, así que hay que sacarlos a una función y llamarla desde el `.then`. Reemplazar los tres bloques por esta función, definida antes de `renderAdminTorneos`:

```js
function bindAccionesTorneo(raiz){
  raiz.querySelectorAll('[data-act="export"]').forEach(b=> b.onclick = async ()=>{
    const tt = await loadTournament(b.dataset.id);
    if(tt) exportTournamentCSV(tt);
  });
  raiz.querySelectorAll('[data-act="activate"]').forEach(b=> b.onclick = ()=> conCarga(b, 'Activando…', async ()=>{
    setTorneoActivoId(b.dataset.id);
    CURRENT = await loadTournament(b.dataset.id);
    attachTournamentListener(b.dataset.id);
    renderAdmin();
  }));
  raiz.querySelectorAll('[data-act="delete"]').forEach(b=> b.onclick = async ()=>{
    if(!confirm('¿Eliminar este torneo y todos sus datos? Esta acción no se puede deshacer.')) return;
    await conCarga(b, 'Eliminando…', async ()=>{
      await fDelete('tournaments', b.dataset.id);
      guardarMisTorneos(leerMisTorneos().filter(x=>x.id!==b.dataset.id));
      if(torneoActivoId()===b.dataset.id){
        const resto = leerMisTorneos()[0];
        setTorneoActivoId(resto ? resto.id : null);
        CURRENT = resto ? await loadTournament(resto.id) : null;
        attachTournamentListener(resto ? resto.id : null);
      }
      renderAdmin();
    });
  });
}
```

- [ ] **Step 9: Verificar a mano**

Run: `node tools/check-liga.mjs && node tools/check-invitacion.mjs` → ambos en verde.
En el navegador: entrar con Google, crear un torneo. Esperado: aparece la tarjeta con un código `NOV-XXXX`, "Copiar código" pone "¡Copiado!" en verde y vuelve solo a los 1.4s, el torneo sale en "Mis torneos" marcado como activo, y "Eliminar" lo saca de la lista. Crear un segundo torneo y comprobar que "Activar" cambia cuál está marcado.

- [ ] **Step 10: Commit**

```bash
git add app.js style.css
git commit -m "$(cat <<'EOF'
Da dueño y código de invitación a cada torneo

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Unirse a un torneo con el código o con el link

**Files:**
- Modify: `app.js:256-303` (`renderHome`)
- Modify: `app.js:1133-1160` (`boot`)
- Modify: `style.css`

**Interfaces:**
- Consumes: `normCodigo`, `agregarTorneo` (Task 1); `leerMisTorneos`, `guardarMisTorneos`, `setTorneoActivoId` (Task 3).
- Produces: `buscarPorCodigo(codigo) -> Promise<torneo|null>`, `unirseACodigo(codigo) -> Promise<{ok, error?, torneo?}>`

- [ ] **Step 1: Resolver un código a un torneo**

En `app.js`, junto a `misTorneosComoOwner()`:

```js
// No hay índice global de torneos, así que el código se resuelve con una consulta.
// Es la única consulta que hace un jugador sin cuenta.
async function buscarPorCodigo(codigo){
  const snap = await getDocs(query(collection(db,'tournaments'), where('joinCode','==',codigo)));
  return snap.empty ? null : snap.docs[0].data();
}
async function unirseACodigo(entrada){
  const codigo = normCodigo(entrada);
  if(!codigo) return { ok:false, error:'Ese código no tiene el formato correcto. Debe ser algo como NOV-4K2P.' };
  const t = await buscarPorCodigo(codigo);
  if(!t) return { ok:false, error:'No encontramos ningún torneo con ese código. Revísalo con quien te invitó.' };
  guardarMisTorneos(agregarTorneo(leerMisTorneos(), {id:t.id, nombre:t.name, rol:'jugador'}));
  setTorneoActivoId(t.id);
  CURRENT = t;
  attachTournamentListener(t.id);
  return { ok:true, torneo:t };
}
```

Nota: si el organizador pega su propio código, `agregarTorneo` le baja el rol local a `jugador`. Es inofensivo — `soyOwner()` compara contra `ownerUid` en el documento, no contra el rol del dispositivo. El rol local solo decide la etiqueta ORGANIZAS/JUEGAS de la lista.

- [ ] **Step 2: Campo de código en Inicio**

En `app.js`, dentro de `renderHome()`, reemplazar el bloque `if(!t){ … }` por:

```js
  if(!t){
    html += `<div class="empty"><span class="ic"><span class="material-symbols-outlined">sports_esports</span></span>No estás en ningún torneo todavía.</div>`;
  }
```

y, justo antes de la línea `html += \`<button class="btn ghost" data-action="show-history">…`, agregar siempre (haya torneo o no):

```js
  html += `<div class="section-title"><div class="num"><span class="material-symbols-outlined">key</span></div><h3>¿Te invitaron?</h3></div>
  <div class="card tight">
    <p class="small muted">Pega el código que te compartió el organizador. No necesitas cuenta.</p>
    <input id="in-codigo" placeholder="NOV-4K2P" maxlength="12" autocomplete="off" style="text-transform:uppercase;letter-spacing:.12em;">
    <div id="err-codigo" class="field-error"></div>
    <button class="btn secondary" id="btn-unirse" style="margin-top:10px;">Unirme al torneo</button>
  </div>`;
```

Después de `$main.innerHTML = html; bindNav();`, agregar el handler:

```js
  document.getElementById('btn-unirse').onclick = async (ev)=> conCarga(ev.currentTarget, 'Buscando…', async ()=>{
    // Capturado antes del await: un onSnapshot puede repintar #main mientras buscamos.
    const elCodigo = document.getElementById('in-codigo');
    const errCodigo = document.getElementById('err-codigo');
    errCodigo.textContent = '';
    const r = await unirseACodigo(elCodigo.value);
    if(!r.ok){ errCodigo.textContent = r.error; return; }
    VIEW = 'home';
    render();
  });
```

- [ ] **Step 3: Ajustar el mensaje de Inscripción sin torneo**

En `app.js`, en `renderRegister()`, reemplazar la línea del caso `if(!t)` por:

```js
  if(!t){ html += `<div class="empty"><span class="ic"><span class="material-symbols-outlined">key</span></span>No estás en ningún torneo.<br>Pega el código que te compartieron desde <b>Inicio</b>.</div>`; $main.innerHTML=html; return; }
```

Antes decía "No hay torneo activo para inscribirse", que era cierto cuando el torneo era global y ahora desorienta: el torneo existe, lo que falta es el código.

- [ ] **Step 4: Aceptar el código por la URL**

En `app.js`, dentro de `boot()`, reemplazar el bloque `try{ await withTimeout(loadIndex(), 8000); … }` por:

```js
  try{
    await withTimeout(loadIndex(), 8000);
    // Link de invitación: ?j=NOV-4K2P. Se consume una sola vez y se limpia de la barra
    // de direcciones, para que recargar o compartir la URL no reintente unirse.
    const codigoUrl = new URLSearchParams(location.search).get('j');
    if(codigoUrl){
      await withTimeout(unirseACodigo(codigoUrl), 8000);
      history.replaceState(null, '', location.pathname);
    }
    const activo = torneoActivoId();
    if(activo) CURRENT = await withTimeout(loadTournament(activo), 8000);
  }catch(e){
    showBootError('No se pudo conectar con la base de datos',
      'Revisa tu conexión a internet y que los datos de <b>firebase-config.js</b> sean correctos.');
    return;
  }
  render();
  attachTournamentListener(torneoActivoId());
  attachIndexListener();
```

- [ ] **Step 5: Verificar a mano**

Run: `node tools/check-liga.mjs && node tools/check-invitacion.mjs` → verde.
En el navegador, con el torneo creado en la Task 3:
1. Abrir una ventana de incógnito en `http://localhost:8000` → "No estás en ningún torneo todavía" y el campo de código.
2. Pegar el código en minúsculas y sin prefijo (`4k2p`) → entra igual.
3. Pegar un código inventado → mensaje "No encontramos ningún torneo…", sin modal de error global.
4. Abrir `http://localhost:8000/?j=NOV-4K2P` en otra ventana de incógnito → entra solo y la URL queda limpia.
5. Recargar → sigue dentro del torneo.

- [ ] **Step 6: Commit**

```bash
git add app.js
git commit -m "$(cat <<'EOF'
Permite unirse a un torneo con código o con link

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Vista "Mis torneos" y cambio de torneo activo

**Files:**
- Modify: `index.html:49-54` (tabbar)
- Modify: `app.js:34` (`VIEW`), `app.js:244-254` (`render`), `app.js:235-237` (`setActiveTab`)
- Create (en `app.js`): `renderMisTorneos()`

**Interfaces:**
- Consumes: `leerMisTorneos`, `guardarMisTorneos`, `torneoActivoId`, `setTorneoActivoId` (Task 3); `USER`, `soyOwner` (Task 2).
- Produces: `VIEW === 'mis'` como vista válida.

- [ ] **Step 1: Cambiar la pestaña del tabbar**

En `index.html`, reemplazar las líneas 49-54 por:

```html
  <nav class="tabbar">
    <button data-view="home"><span class="ic"><span class="material-symbols-outlined">stadium</span></span><span>Inicio</span></button>
    <button data-view="register"><span class="ic"><span class="material-symbols-outlined">how_to_reg</span></span><span>Inscribirme</span></button>
    <button data-view="tournament"><span class="ic"><span class="material-symbols-outlined">trophy</span></span><span>Torneo</span></button>
    <button data-view="mis"><span class="ic"><span class="material-symbols-outlined">list_alt</span></span><span>Mis torneos</span></button>
  </nav>
```

La pestaña **Admin** desaparece del tabbar: se llega a ella desde "Mis torneos". Un jugador invitado no tiene por qué ver un candado permanente.

- [ ] **Step 2: Registrar la vista nueva**

En `app.js`, en `render()`, agregar antes de la línea de `admin`:

```js
  if(VIEW==='mis') return renderMisTorneos();
```

En `setActiveTab()`, reemplazar el cuerpo por:

```js
function setActiveTab(){
  // Admin ya no tiene pestaña propia: se entra desde Mis torneos, así que mientras
  // estás en Admin la pestaña que queda marcada es esa.
  const marcada = VIEW==='admin' ? 'mis' : VIEW;
  document.querySelectorAll('.tabbar button').forEach(b=>b.classList.toggle('active', b.dataset.view===marcada));
}
```

- [ ] **Step 3: Escribir `renderMisTorneos`**

En `app.js`, después de `renderHome`:

```js
function renderMisTorneos(){
  const activo = torneoActivoId();
  const lista = leerMisTorneos();
  let html = `<div class="section-title"><div class="num"><span class="material-symbols-outlined">list_alt</span></div><h3>Mis torneos</h3></div>`;
  if(lista.length===0){
    html += `<div class="empty"><span class="ic"><span class="material-symbols-outlined">key</span></span>No estás en ningún torneo.<br>Pega un código desde <b>Inicio</b> o crea el tuyo.</div>`;
  } else {
    html += `<div class="card tight" id="mis-lista">${lista.map(x=>`<div class="list-item">
      <span class="name">${esc(x.nombre)} ${activo===x.id?'<span class="badge on">activo</span>':''}<br><span class="n4">${x.rol==='admin'?'ORGANIZAS':'JUEGAS'}</span></span>
      <span class="sub">${activo===x.id?'':`<button class="btn small ghost" data-ir="${x.id}">Ver</button>`}</span>
    </div>`).join('')}</div>`;
  }
  html += `<button class="btn" id="ir-admin" style="margin-top:14px;">Crear un torneo nuevo</button>`;
  $main.innerHTML = html;
  bindNav();
  document.getElementById('ir-admin').onclick = ()=>{ VIEW='admin'; SUBVIEW_ADMIN='torneos'; render(); };
  $main.querySelectorAll('[data-ir]').forEach(b => b.onclick = ()=> conCarga(b, 'Abriendo…', async ()=>{
    const id = b.dataset.ir;
    const t = await loadTournament(id);
    if(!t){
      // El organizador lo borró: sacarlo del dispositivo en vez de dejar un ítem fantasma.
      guardarMisTorneos(leerMisTorneos().filter(x=>x.id!==id));
      renderMisTorneos();
      return;
    }
    setTorneoActivoId(id);
    CURRENT = t;
    attachTournamentListener(id);
    VIEW='home'; render();
  }));
}
```

- [ ] **Step 4: Que Admin solo se ofrezca a quien organiza**

Dentro de `renderAdmin()`, en el bloque de pestañas, la pestaña **Panel** y **Sorteos** solo tienen sentido sobre un torneo propio. Reemplazar la línea que arma `tabs` por:

```js
  // Panel y Sorteos operan sobre el torneo activo: si no es tuyo, no se ofrecen.
  const tabs = soyOwner(CURRENT)
    ? [['panel','Panel'],['equipos','Sorteos'],['torneos','Torneos'],['lista','Lista válida']]
    : [['torneos','Torneos'],['lista','Lista válida']];
  if(!tabs.some(([k])=>k===SUBVIEW_ADMIN)) SUBVIEW_ADMIN = 'torneos';
```

- [ ] **Step 5: Verificar a mano**

Run: `node tools/check-liga.mjs && node tools/check-invitacion.mjs` → verde.
En el navegador:
1. Con dos torneos (uno creado por ti, otro al que te uniste con código desde incógnito), "Mis torneos" lista ambos con `ORGANIZAS` / `JUEGAS`.
2. "Ver" en el que no está activo lo vuelve activo y lleva a Inicio con ese torneo.
3. La pestaña Admin ya no está en la barra; se llega con "Crear un torneo nuevo".
4. En la ventana de incógnito (jugador sin cuenta), Admin pide entrar con Google y no muestra Panel ni Sorteos de un torneo ajeno.

- [ ] **Step 6: Commit**

```bash
git add app.js index.html
git commit -m "$(cat <<'EOF'
Agrega la vista Mis torneos y el cambio de torneo activo

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Saneo de `meta/config` y limpieza del índice global

Con las tareas anteriores nadie lee ya `INDEX.tournaments`, `INDEX.activeId` ni `INDEX.adminPin`. Esta tarea los borra del código y del documento.

**Files:**
- Modify: `app.js:31` (comentario del global `INDEX`), `app.js:48-58` (`loadIndex`), `app.js:84-96` (`attachIndexListener`)
- Modify: `sw.js:9` (`VERSION`)
- Modify: `CLAUDE.md` (sección Architecture), `README.md`
- Modify: `ROADMAP.md`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: `INDEX` con forma `{ validTeams }` y nada más.

- [ ] **Step 1: Reducir `loadIndex`**

En `app.js`, reemplazar `loadIndex()` por:

```js
async function loadIndex(){
  let idx = await fGet('meta','config');
  if(!idx){
    idx = { validTeams: DEFAULT_TEAMS };
    await fSet('meta','config', idx);
  }
  // meta/config fue un índice global (tournaments[], activeId, adminPin). Ya no: cada
  // torneo se descubre por su joinCode y su dueño por ownerUid. Si el documento todavía
  // trae los campos viejos, se descartan en la primera escritura.
  if(!idx.validTeams) idx.validTeams = DEFAULT_TEAMS;
  INDEX = { validTeams: idx.validTeams };
  if(idx.tournaments || idx.activeId || idx.adminPin) await saveIndex();
  return INDEX;
}
```

Y actualizar el comentario del global en la línea 31:

```js
let INDEX = null;       // { validTeams:{clubs,countries} } — listas de FC26, lo único compartido
```

- [ ] **Step 2: Ajustar el listener del índice**

En `app.js`, dentro de `attachIndexListener()`, donde reasigna `INDEX` con el snapshot, asegurarse de que conserve solo `validTeams`:

```js
    INDEX = { validTeams: (d && d.validTeams) || DEFAULT_TEAMS };
```

- [ ] **Step 3: Buscar restos**

Run: `grep -n 'adminPin\|INDEX.tournaments\|INDEX.activeId\|ADMIN_UNLOCKED' app.js`
Expected: sin resultados. Si aparece alguno, borrarlo — es código muerto de las tareas anteriores.

- [ ] **Step 4: Subir la versión del service worker**

En `sw.js`, línea 9: `const VERSION = 'noventeros-v10';`
Sin esto, quien ya tenía la app instalada podría quedarse con el cascarón anterior.

- [ ] **Step 5: Actualizar la documentación**

En `CLAUDE.md`, sección **Architecture**, reemplazar el bloque de los dos documentos por:

```markdown
- `meta/config` → `INDEX`: `{ validTeams:{clubs,countries} }` — lo único global
- `tournaments/{id}` → el torneo completo, con `ownerUid` (cuenta de Google del
  organizador) y `joinCode` (el código que se comparte)

El organizador se autentica con Firebase Auth (Google); el jugador nunca se autentica:
pega el `joinCode` y el torneo queda en `localStorage` (`noventeros.misTorneos` y
`noventeros.torneoActivo`). La cuenta existe para que un torneo no quede sin organizador
si se pierde un dispositivo, **no** como seguridad: las reglas de Firestore siguen
abiertas, porque el jugador se inscribe escribiendo el documento entero del torneo.
```

En `CLAUDE.md`, sección **Conventions**, reemplazar la línea del PIN por:

```markdown
- El organizador entra con Google; el jugador no tiene cuenta. Eso no es seguridad — las
  reglas de Firestore siguen abiertas. No lo reconstruyas como auth real salvo que se pida.
```

En `README.md`, actualizar la sección que explique el PIN de admin con el mismo criterio, y agregar el paso de configuración: habilitar el proveedor Google en Authentication y agregar el dominio de GitHub Pages a los dominios autorizados.

- [ ] **Step 6: Cerrar A en el roadmap**

En `ROADMAP.md`, cambiar el estado de A a `hecho` y su verificación por una que siga distinguiendo:

```markdown
**Verificación:** `grep -c 'joinCode' app.js` — debe ser > 0; y
`grep -c 'adminPin' app.js` debe ser 0.
```

- [ ] **Step 7: Verificación final**

Run:
```bash
node tools/check-liga.mjs && node tools/check-invitacion.mjs
grep -c 'adminPin' app.js          # esperado: 0
grep -c 'joinCode' app.js          # esperado: > 0
```

En el navegador, la prueba completa del spec con dos navegadores:
1. A entra con Google, crea torneo, copia el código.
2. B abre el link en incógnito, se une, se inscribe.
3. A ve a B en la lista de inscritos **sin recargar** (`onSnapshot`).
4. B crea su propio torneo con otra cuenta; ninguno ve el torneo del otro en su lista.
5. Recargar el navegador de B: sigue en el torneo de A.

- [ ] **Step 8: Commit**

```bash
git add app.js sw.js CLAUDE.md README.md ROADMAP.md
git commit -m "$(cat <<'EOF'
Elimina el índice global de meta/config

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```
