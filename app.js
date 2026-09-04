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

async function fGet(col, id){
  const snap = await getDoc(doc(db,col,id));
  return snap.exists() ? snap.data() : null;
}
async function fSet(col, id, data){
  await setDoc(doc(db,col,id), data);
  return true;
}
async function fDelete(col, id){
  await deleteDoc(doc(db,col,id));
  return true;
}

const DEFAULT_TEAMS = {
  clubs: ["Real Madrid","Manchester City","FC Barcelona","Liverpool","Bayern Múnich","Paris Saint-Germain","Arsenal","Inter de Milán","Atlético de Madrid","Chelsea","Manchester United","Juventus","Borussia Dortmund","AC Milan","Napoli","Bayer Leverkusen","Tottenham Hotspur","Aston Villa","Newcastle United","Benfica","Porto","RB Leipzig","Sevilla","Villarreal","AS Monaco"],
  countries: ["Francia","Argentina","Brasil","Inglaterra","España","Portugal","Alemania","Países Bajos","Italia","Bélgica","Croacia","Uruguay","Colombia","Marruecos","Estados Unidos","México","Japón","Corea del Sur","Dinamarca","Suiza","Turquía","Ecuador","Canadá","Senegal","Nigeria"]
};

/* ================= STATE ================= */
let INDEX = null;       // { validTeams:{clubs,countries} } — listas de FC26, lo único compartido
let CURRENT = null;     // full active tournament object
let USER = null;   // sesión de Google del organizador, o null
let VIEW = 'home';
let SUBVIEW_ADMIN = 'panel';
let SUBVIEW_TOURN = 'grupos';
// Mientras una animación de sorteo corre, onSnapshot no debe repintar y borrarla.
// Antes no hacía falta: solo animaba el admin, que era justo quien escribía.
let ANIMANDO = false;
async function conAnimacion(fn){
  ANIMANDO = true;
  try { await fn(); } finally { ANIMANDO = false; }
}
// Si el aviso te trajo hasta acá, la reproducción arranca sola y solo desde lo que no
// viste. Entrar a la pestaña a dedo no dispara nada: ahí está el botón de repetir.
let AUTOPLAY_DESDE = null;
let unsubTournament = null;
let prevUid = null;     // para detectar cambios de sesión en onAuthStateChanged
let listenersListos = false;  // guarda que onAuthStateChanged y attachIndexListener se registren una sola vez

const norm = s => (s||'').trim().toLowerCase();
// Todo se pinta con innerHTML: sin esto un alias con < o comillas rompe el render.
// Solo para HTML — nunca dentro de playerName/playerTeam, que también alimentan el CSV.
const esc = s => String(s??'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function isTypingNow(){
  const tag = document.activeElement && document.activeElement.tagName;
  return tag==='INPUT' || tag==='TEXTAREA' || tag==='SELECT';
}

// El organizador se autentica; el jugador nunca. La cuenta existe para que un torneo
// no quede huérfano si se pierde el dispositivo, NO como seguridad: las reglas de
// Firestore siguen abiertas a propósito (ver README).
async function entrarConGoogle(){
  try{
    await signInWithPopup(auth, new GoogleAuthProvider());
  }catch(e){
    // Errores de UI que el usuario causó: mostrar en la pantalla, no tirar error global.
    if(e.code==='auth/popup-closed-by-user' || e.code==='auth/cancelled-popup-request'){
      return { ok:false, error:'Se canceló el inicio de sesión.' };
    }
    if(e.code==='auth/popup-blocked'){
      return { ok:false, error:'El navegador bloqueó la ventana de inicio. Revisa que no tengas un bloqueador de popups activado.' };
    }
    // Otros errores: dejar que lance para ir al manejador global de errores
    throw e;
  }
}
async function salirDeGoogle(){
  await signOut(auth);
}
// ¿Soy el organizador de este torneo?
const soyOwner = t => !!USER && !!t && t.ownerUid === USER.uid;

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

const LS_SORTEO = 'noventeros.sorteoVisto';
function marcarSorteoVisto(t){ /* Tarea 4 */ }

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
async function saveIndex(){ await fSet('meta','config', INDEX); }

async function loadTournament(id){
  if(!id) return null;
  return await fGet('tournaments', id);
}
async function saveTournament(t){ t.updatedAt = Date.now(); await fSet('tournaments', t.id, t); CURRENT = t; }

async function loadHistory(){ const h = await fGet('meta','history'); return (h && h.items) ? h.items : []; }
async function saveHistory(h){ await fSet('meta','history', {items:h}); }
async function pushHistory(t){
  const hist = await loadHistory();
  hist.push({id:t.id, name:t.name, champion:playerName(t,t.champion), date:Date.now(), size:t.size, mode:t.mode||'copa'});
  await saveHistory(hist);
}

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
function attachIndexListener(){
  onSnapshot(doc(db,'meta','config'), (snap)=>{
    if(!snap.exists() || isTypingNow() || ANIMANDO) return;
    // meta/config ya solo trae las listas válidas de FC26: cuál es el torneo activo
    // vive en el dispositivo (localStorage), no en un índice global.
    const data = snap.data();
    INDEX = { validTeams: (data && data.validTeams) || DEFAULT_TEAMS };
    render();
  });
}


function newId(){ return 't'+Math.random().toString(36).slice(2,9); }
function uid(){ return 'p'+Math.random().toString(36).slice(2,9); }

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

/* ================= TOURNAMENT MODEL ================= */
// Una Liga se modela como un torneo de UN SOLO grupo ('L') sin bracket. Así toda la
// maquinaria de grupos (computeStandings, goleoTable, carga de marcadores, CSV) se
// reutiliza sin tocarla, y no aparece ninguna estructura nueva en Firestore.
const esLiga = t => !!t && t.mode==='liga';   // torneos viejos sin 'mode' son Copa
const LIGA_MIN = 3;

function blankTournament(name, size, eventDate, regDeadline, mode='copa', vuelta=false){
  return {
    id:newId(), name, size, eventDate, regDeadline,
    ownerUid: null,        // uid de Google del organizador; lo pone quien lo crea
    ownerName: '',         // displayName, solo para mostrar "Organiza: …"
    joinCode: generarJoinCode(),  // "NOV-4K2P" — se comparte, no cambia nunca
    mode,                  // 'copa' | 'liga'
    vuelta,                // solo liga: true = ida y vuelta
    status:'registration', // registration -> drawn(teams) -> groups -> playoffs -> finished
    players:[],            // {id, alias, club, country, assignedTeam}
    drawnTeams:[],         // selected N teams (strings, tagged with type)
    groups:null,           // { A:[playerId,...], B:[...] }  ·  liga: { L:[todos] }
    groupMatches:null,     // { A:[{id,p1,p2,s1,s2,played}], B:[...] }
    bracket:null,          // { rounds: [ [{p1,p2,s1,s2,played,winner}] ] }  ·  liga: siempre null
    waitlist:[],           // inscritos que quedaron fuera al ajustar el formato
    champion:null,
  };
}
// size en Liga es un cupo máximo opcional: null = sin límite.
function hayCupo(t){ return !t.size || t.players.length < t.size; }
function cuposTexto(t){ return t.size ? `${t.players.length}/${t.size}` : `${t.players.length}`; }

// La llave toma 2 clasificados por grupo, así que el torneo necesita al menos size/2
// jugadores o buildBracketFromGroups revienta. Si no llegaron todos, bajamos el formato
// al que sí calza en vez de dejar el torneo atascado.
// La liga no tiene esa restricción: cualquier N >= LIGA_MIN sirve y el "formato"
// resultante es simplemente la cantidad de inscritos.
const FORMATOS = [8,16,32];
function formatoAjustado(t){
  if(esLiga(t)) return t.players.length>=LIGA_MIN ? t.players.length : null;
  const posibles = FORMATOS.filter(f => f<=t.size && f<=t.players.length);
  return posibles.length ? Math.max(...posibles) : null;
}

function shuffle(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}

/* ---- validation ---- */
function findTeamMatch(value, type){
  const list = type==='club' ? INDEX.validTeams.clubs : INDEX.validTeams.countries;
  return list.find(t => norm(t)===norm(value));
}
function aliasTaken(t, alias){ return t.players.some(p=>norm(p.alias)===norm(alias)); }
function clubTaken(t, club){ return t.players.some(p=>norm(p.club)===norm(club)); }
function countryTaken(t, country){ return t.players.some(p=>norm(p.country)===norm(country)); }

/* ---- group/round-robin ---- */
function roundRobinPairs(ids){
  const pairs=[];
  for(let i=0;i<ids.length;i++) for(let j=i+1;j<ids.length;j++) pairs.push([ids[i],ids[j]]);
  return pairs;
}
function playerName(t,id){ const p=t.players.find(x=>x.id===id); return p? p.alias : '—'; }
function playerTeam(t,id){ const p=t.players.find(x=>x.id===id); return p? p.assignedTeam : '—'; }

function computeStandings(t, groupKey){
  const ids = t.groups[groupKey];
  const table = {}; ids.forEach(id=>table[id]={id,pj:0,pg:0,pe:0,pp:0,gf:0,gc:0,pts:0});
  (t.groupMatches[groupKey]||[]).forEach(m=>{
    if(!m.played) return;
    const a=table[m.p1], b=table[m.p2];
    a.pj++; b.pj++; a.gf+=m.s1; a.gc+=m.s2; b.gf+=m.s2; b.gc+=m.s1;
    if(m.s1>m.s2){a.pg++;a.pts+=3;b.pp++;}
    else if(m.s1<m.s2){b.pg++;b.pts+=3;a.pp++;}
    else {a.pe++;b.pe++;a.pts++;b.pts++;}
  });
  // Último criterio: enfrentamiento directo. Math.sign para que en ida y vuelta un
  // triunfo por lado se anule en vez de sumar goles.
  const h2h = (x,y)=>{
    let d=0;
    (t.groupMatches[groupKey]||[]).forEach(m=>{
      if(!m.played) return;
      if(m.p1===x.id && m.p2===y.id) d += Math.sign(m.s1-m.s2);
      if(m.p1===y.id && m.p2===x.id) d += Math.sign(m.s2-m.s1);
    });
    return d;
  };
  return Object.values(table).sort((x,y)=> y.pts-x.pts || (y.gf-y.gc)-(x.gf-x.gc) || y.gf-x.gf || h2h(y,x));
}
function allGroupMatchesPlayed(t){
  return Object.values(t.groupMatches).every(list=>list.every(m=>m.played));
}
function goleoTable(t){
  const totals = {}; t.players.forEach(p=>totals[p.id]=0);
  Object.values(t.groupMatches||{}).flat().forEach(m=>{ if(m.played){ totals[m.p1]+=m.s1; totals[m.p2]+=m.s2; }});
  if(t.bracket) t.bracket.rounds.flatMap(r=>r.partidos).forEach(m=>{ if(m.played){ totals[m.p1]=(totals[m.p1]||0)+m.s1; totals[m.p2]=(totals[m.p2]||0)+m.s2; }});
  return Object.entries(totals).map(([id,goals])=>({id,goals})).sort((a,b)=>b.goals-a.goals);
}

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

/* ---- bracket ---- */
function buildBracketFromGroups(t){
  const letters = Object.keys(t.groups);
  const standingsByGroup = letters.map(k=>computeStandings(t,k));
  const round0 = [];
  for(let i=0;i<letters.length;i+=2){
    const gA = standingsByGroup[i], gB = standingsByGroup[i+1];
    round0.push({p1:gA[0].id,p2:gB[1].id,s1:null,s2:null,played:false,winner:null});
    round0.push({p1:gB[0].id,p2:gA[1].id,s1:null,s2:null,played:false,winner:null});
  }
  // Firestore no admite arrays anidados: "rounds" no puede ser un array de arrays.
  // Cada ronda va envuelta en {partidos:[...]} para que el array de partidos quede
  // un nivel más adentro, dentro de un objeto.
  t.bracket = { rounds:[{partidos:round0}] };
  t.status='playoffs';
}
function tryAdvanceBracket(t){
  const rounds = t.bracket.rounds;
  const last = rounds[rounds.length-1].partidos;
  if(!last.every(m=>m.played)) return;
  if(last.length===1){ t.champion = last[0].winner; t.status='finished'; return; }
  const next = [];
  for(let i=0;i<last.length;i+=2){
    next.push({p1:last[i].winner,p2:last[i+1].winner,s1:null,s2:null,played:false,winner:null});
  }
  rounds.push({partidos:next});
}
function totalRoundsOf(bracket){ return Math.ceil(Math.log2(bracket.rounds[0].partidos.length*2)); }
function roundLabel(totalRounds, idx){
  const remaining = totalRounds-idx;
  if(remaining===1) return 'Final';
  if(remaining===2) return 'Semifinales';
  if(remaining===3) return 'Cuartos de final';
  if(remaining===4) return 'Octavos de final';
  return 'Ronda '+(idx+1);
}

/* ================= RENDER ================= */
const $main = document.getElementById('main');
function setActiveTab(){
  // Admin ya no tiene pestaña propia: se entra desde Mis torneos, así que mientras
  // estás en Admin la pestaña que queda marcada es esa.
  const marcada = VIEW==='admin' ? 'mis' : VIEW;
  document.querySelectorAll('.tabbar button').forEach(b=>b.classList.toggle('active', b.dataset.view===marcada));
}
function statusLabel(t){
  if(!t) return { text:'Sin torneo', cls:'' };
  const map = {registration:'Inscripciones abiertas', closed_reg:'Inscripciones cerradas', drawn:'Equipos sorteados', groups: esLiga(t)?'Liga en curso':'Fase de grupos', playoffs:'Playoffs', finished:'Finalizado'};
  return { text: map[t.status]||t.status, cls: t.status==='registration'?'live':'' };
}

async function render(){
  setActiveTab();
  const st = statusLabel(CURRENT);
  const pillEl = document.getElementById('status-pill');
  pillEl.textContent = st.text; pillEl.className = 'pill '+st.cls;

  if(VIEW==='home') return renderHome();
  if(VIEW==='register') return renderRegister();
  if(VIEW==='tournament') return renderTournament();
  if(VIEW==='mis') return renderMisTorneos();
  if(VIEW==='admin') return renderAdmin();
}

function renderHome(){
  const t = CURRENT;
  let html = '';
  html += `<div class="hero">
    <img class="hero-logo" src="assets/logo.png" alt="Noventeros FC Gamers">
    <div class="kicker">TORNEOS ONLINE · 100% GRATUITOS</div>
    <h1>NOVENTEROS<span class="g">FC GAMERS</span></h1>
    <p>Compite. Diviértete. Vive cada copa como se debe.</p>
    ${t ? `<div class="torneo-activo">${esc(t.name)}</div>` : ''}
  </div>`;

  if(!t){
    html += `<div class="empty"><span class="ic"><span class="material-symbols-outlined">sports_esports</span></span>No estás en ningún torneo todavía.</div>`;
  } else {
    html += `<div class="card card-accent">
      <div class="list-item"><span class="name"><span class="material-symbols-outlined">calendar_month</span> Fecha del torneo</span><span>${fmtDate(t.eventDate)}</span></div>
      <div class="list-item"><span class="name"><span class="material-symbols-outlined">hourglass_empty</span> Cierre de inscripción</span><span>${fmtDate(t.regDeadline)}</span></div>
      <div class="list-item"><span class="name"><span class="material-symbols-outlined">group</span> ${esLiga(t)&&!t.size?'Inscritos':'Cupos'}</span><span>${cuposTexto(t)}</span></div>
    </div>`;

    if(t.status==='registration'){
      html += `<button class="btn" data-nav="register">Inscribirme al torneo</button>`;
    } else {
      html += `<button class="btn secondary" data-nav="tournament">Ver estado del torneo</button>`;
    }

    if(t.status==='finished' && t.champion){
      html += `<div class="champ-banner card sello"><div class="cup"><span class="material-symbols-outlined">emoji_events</span></div><h2>${esc(playerName(t,t.champion))}</h2><p>Campeón de ${esc(t.name)}</p></div>`;
    }
  }

  const pasos12 = `<b style="color:var(--white)">1. Registro —</b> cada jugador propone un alias, un club y un país.<br><br>
    <b style="color:var(--white)">2. Sorteo de equipos —</b> de lo propuesto por todos, se sortean los equipos irrepetibles que competirán.<br><br>
    <b style="color:var(--white)">3. Asignación —</b> cada equipo sorteado se asigna al azar a un jugador registrado.<br><br>`;
  html += `<div class="section-title"><div class="num"><span class="material-symbols-outlined">info</span></div><h3>Dinámica del torneo</h3></div>
  <div class="card tight small muted">
    ${pasos12}${esLiga(t) ? `<b style="color:var(--white)">4. Calendario —</b> todos contra todos${t.vuelta?', ida y vuelta':''}. El empate es un resultado válido.<br><br>
    <b style="color:var(--white)">5. Campeón —</b> gana quien sume más puntos en la tabla de posiciones.`
    : `<b style="color:var(--white)">4. Sorteo de grupos —</b> los jugadores se dividen en grupos al azar.<br><br>
    <b style="color:var(--white)">5. Clasificación —</b> avanzan quienes sumen más puntos en su grupo.`}
  </div>`;

  html += `<div class="section-title"><div class="num"><span class="material-symbols-outlined">key</span></div><h3>¿Te invitaron?</h3></div>
  <div class="card tight">
    <p class="small muted">Pega el código que te compartió el organizador. No necesitas cuenta.</p>
    <input id="in-codigo" placeholder="NOV-4K2P" maxlength="12" autocomplete="off" style="text-transform:uppercase;letter-spacing:.12em;">
    <div id="err-codigo" class="field-error"></div>
    <button class="btn secondary" id="btn-unirse" style="margin-top:10px;">Unirme al torneo</button>
  </div>`;

  html += `<button class="btn ghost" data-action="show-history">Ver historial de campeones</button>`;
  $main.innerHTML = html;
  bindNav();
  $main.querySelector('[data-action="show-history"]').onclick = showHistory;
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
}

function renderMisTorneos(){
  let html = `<div class="section-title"><div class="num"><span class="material-symbols-outlined">list_alt</span></div><h3>Mis torneos</h3></div>`;
  html += `<div id="mis-lista"><div class="empty small">Cargando…</div></div>`;
  html += `<button class="btn" id="ir-admin" style="margin-top:14px;">Crear u organizar un torneo</button>`;
  $main.innerHTML = html;
  bindNav();

  // Se pinta después porque necesita consultar el estado real de cada torneo (el
  // localStorage solo guarda id/nombre/rol). La referencia se captura ya, antes del
  // await: si llega una actualización remota y se repinta #main, escribir en el nodo
  // desprendido no falla, simplemente no se ve.
  const misLista = document.getElementById('mis-lista');
  document.getElementById('ir-admin').onclick = ()=>{ VIEW='admin'; SUBVIEW_ADMIN='torneos'; render(); };

  const lista = leerMisTorneos();
  Promise.all(lista.map(x => loadTournament(x.id).then(t => ({x, t})))).then(pares=>{
    // El organizador borró estos: sacarlos del dispositivo en vez de dejar ítems fantasma.
    const vivos = pares.filter(({t})=> t!=null);
    if(vivos.length !== pares.length){
      guardarMisTorneos(vivos.map(({x})=>x));
    }
    // Después de purgar: si el torneo activo fue borrado, limpiar la referencia.
    const activo = torneoActivoId();
    if(activo && !vivos.find(({x})=>x.id===activo)){
      setTorneoActivoId(null);
      attachTournamentListener(null);
    }
    // Un torneo finalizado es historial, no basura: se queda en localStorage pero no
    // ocupa espacio en "Mis torneos" (spec del dueño de producto).
    const visibles = vivos.filter(({t})=> t.status !== 'finished');
    if(visibles.length===0){
      misLista.innerHTML = `<div class="empty"><span class="ic"><span class="material-symbols-outlined">key</span></span>No tienes torneos en curso.<br>Pega un código desde <b>Inicio</b> o crea el tuyo.</div>`;
      return;
    }
    const actId = torneoActivoId();
    misLista.innerHTML = `<div class="card tight">${visibles.map(({x,t})=>{
      const st = statusLabel(t);
      const esOwner = soyOwner(t);
      return `<div class="list-item">
      <span class="name">${esc(x.nombre)} <span class="pill ${st.cls}">${esc(st.text)}</span> ${actId===x.id?'<span class="badge on">activo</span>':''}<br><span class="n4">${esOwner?'ORGANIZAS':'JUEGAS'}</span></span>
      <span class="sub">${actId===x.id && esOwner?`<button class="btn small ghost" data-admin="${x.id}">Administrar</button>`:actId===x.id?'':`<button class="btn small ghost" data-ir="${x.id}">Ver</button>`}</span>
    </div>`;
    }).join('')}</div>`;
    misLista.querySelectorAll('[data-ir]').forEach(b => b.onclick = ()=> conCarga(b, 'Abriendo…', async ()=>{
      const id = b.dataset.ir;
      const t = await loadTournament(id);
      if(!t){
        // El organizador lo borró justo ahora: sacarlo del dispositivo en vez de dejar un ítem fantasma.
        guardarMisTorneos(leerMisTorneos().filter(x=>x.id!==id));
        renderMisTorneos();
        return;
      }
      setTorneoActivoId(id);
      CURRENT = t;
      attachTournamentListener(id);
      VIEW='home'; render();
    }));
    misLista.querySelectorAll('[data-admin]').forEach(b => b.onclick = ()=>{
      VIEW='admin'; SUBVIEW_ADMIN='panel'; render();
    });
  });
}

async function showHistory(){
  const hist = await loadHistory();
  let html = `<div class="section-title"><div class="num"><span class="material-symbols-outlined">emoji_events</span></div><h3>Historial de torneos</h3></div>`;
  if(hist.length===0){ html += `<div class="empty"><span class="ic"><span class="material-symbols-outlined">inbox</span></span>Aún no hay torneos finalizados.</div>`; }
  else {
    html += `<div class="card">`;
    hist.slice().reverse().forEach(h=>{
      html += `<div class="hist-item"><b>${esc(h.name)}</b><br><span class="muted small">Campeón: ${esc(h.champion)} · ${fmtDate(h.date)} · ${h.mode==='liga'?'Liga':'Copa'} de ${h.size}</span></div>`;
    });
    html += `</div>`;
  }
  html += `<button class="btn ghost" data-action="back-home">Volver</button>`;
  $main.innerHTML = html;
  $main.querySelector('[data-action="back-home"]').onclick = ()=>{ VIEW='home'; render(); };
}

function fmtDate(d){
  if(!d) return '—';
  const dt = new Date(d);
  if(isNaN(dt)) return d;
  return dt.toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'numeric'});
}

function renderRegister(){
  const t = CURRENT;
  let html = `<div class="section-title"><div class="num"><span class="material-symbols-outlined">edit_note</span></div><h3>Inscripción</h3></div>`;
  if(!t){ html += `<div class="empty"><span class="ic"><span class="material-symbols-outlined">key</span></span>No estás en ningún torneo.<br>Pega el código que te compartieron desde <b>Inicio</b>.</div>`; $main.innerHTML=html; return; }
  if(t.status!=='registration'){
    html += `<div class="empty"><span class="ic"><span class="material-symbols-outlined">lock</span></span>Las inscripciones para <b>${esc(t.name)}</b> están cerradas.</div>`;
    $main.innerHTML = html; return;
  }
  if(!hayCupo(t)){
    html += `<div class="empty"><span class="ic"><span class="material-symbols-outlined">check_circle</span></span>¡Cupos completos! (${t.size}/${t.size})</div>`;
    $main.innerHTML = html; return;
  }
  html += `<div class="card tight small muted">Propón tu alias, un club y un país. No pueden repetirse entre jugadores, y deben existir en FC26.</div>
  <label>Tu alias</label>
  <input id="in-alias" placeholder="Ej: ElCraque22" maxlength="24">
  <div id="err-alias" class="field-error"></div>

  <label>Club que propones</label>
  <input id="in-club" list="dl-clubs" placeholder="Ej: Real Madrid" autocomplete="off">
  <datalist id="dl-clubs">${INDEX.validTeams.clubs.map(c=>`<option value="${esc(c)}">`).join('')}</datalist>
  <div id="err-club" class="field-error"></div>

  <label>País que propones</label>
  <input id="in-country" list="dl-countries" placeholder="Ej: Argentina" autocomplete="off">
  <datalist id="dl-countries">${INDEX.validTeams.countries.map(c=>`<option value="${esc(c)}">`).join('')}</datalist>
  <div id="err-country" class="field-error"></div>

  <button class="btn" id="btn-submit" style="margin-top:18px;">Confirmar inscripción</button>
  <div id="reg-msg" style="margin-top:10px;"></div>

  <div class="section-title"><div class="num">${t.players.length}</div><h3>Inscritos (${cuposTexto(t)})</h3></div>
  <div class="card tight">
    ${t.players.length? t.players.map(p=>`<div class="list-item"><span class="name">${esc(p.alias)}</span><span class="sub">${esc(p.club)} · ${esc(p.country)}</span></div>`).join('') : '<div class="muted small">Sé el primero en inscribirte.</div>'}
  </div>`;
  $main.innerHTML = html;
  bindNav();

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
    let ok = true;
    const fresh = await loadTournament(t.id); // re-check latest to avoid race
    if(!alias){ errAlias.textContent='Escribe un alias.'; ok=false; }
    else if(aliasTaken(fresh, alias)){ errAlias.textContent='Ese alias ya está tomado.'; ok=false; }
    const clubMatch = findTeamMatch(club,'club');
    if(!club){ errClub.textContent='Escribe un club.'; ok=false; }
    else if(!clubMatch){ errClub.textContent='Ese club no existe en la lista válida de FC26.'; ok=false; }
    else if(clubTaken(fresh, club)){ errClub.textContent='Ese club ya fue propuesto por otro jugador.'; ok=false; }
    const countryMatch = findTeamMatch(country,'country');
    if(!country){ errCountry.textContent='Escribe un país.'; ok=false; }
    else if(!countryMatch){ errCountry.textContent='Ese país no existe en la lista válida de FC26.'; ok=false; }
    else if(countryTaken(fresh, country)){ errCountry.textContent='Ese país ya fue propuesto por otro jugador.'; ok=false; }
    if(!ok) return;
    if(!hayCupo(fresh)){ regMsg.innerHTML='<span class="field-error">Los cupos se llenaron justo ahora.</span>'; return; }
    fresh.players.push({id:uid(), alias, club:clubMatch, country:countryMatch, assignedTeam:null});
    await saveTournament(fresh);
    regMsg.innerHTML = '<span class="field-ok"><span class="material-symbols-outlined" style="font-size:1em;">check_circle</span> ¡Inscripción confirmada! Nos vemos en la cancha.</span>';
    setTimeout(()=>render(), 700);
  });
}

function bindNav(){
  $main.querySelectorAll('[data-nav]').forEach(b=> b.onclick = ()=>{ VIEW=b.dataset.nav; render(); });
}

/* ---------- TOURNAMENT VIEW (equipos, grupos, tabla, goleo, llave) ---------- */
function renderTournament(){
  const t = CURRENT;
  let html = `<div class="section-title"><div class="num"><span class="material-symbols-outlined">emoji_events</span></div><h3>Torneo</h3></div>`;
  if(!t){ html += `<div class="empty"><span class="ic"><span class="material-symbols-outlined">warning</span></span>No hay torneo activo.</div>`; $main.innerHTML=html; return; }

  const tabs = esLiga(t)
    ? [['grupos','Calendario'],['tabla','Tabla'],['goleo','Goleo']]
    : [['grupos','Grupos'],['tabla','Tabla'],['goleo','Goleo'],['llave','Llave']];
  // La pestaña del sorteo no existe hasta que hay algo que reproducir.
  const haySorteo = etapasSorteadas(t).length > 0;
  if(haySorteo) tabs.push(['sorteo','Sorteo']);
  // La liga no tiene llave: si venías de un torneo Copa, esa subvista ya no existe.
  if(esLiga(t) && SUBVIEW_TOURN==='llave') SUBVIEW_TOURN='tabla';
  if(!haySorteo && SUBVIEW_TOURN==='sorteo') SUBVIEW_TOURN='grupos';
  html += `<div class="tabs2">${tabs.map(([k,l])=>`<button data-sub="${k}" class="${SUBVIEW_TOURN===k?'active':''}">${l}</button>`).join('')}</div>`;
  html += `<div id="tourn-sub"></div>`;
  $main.innerHTML = html;
  bindNav();
  $main.querySelectorAll('[data-sub]').forEach(b=> b.onclick=()=>{ SUBVIEW_TOURN=b.dataset.sub; renderTournament(); });
  const holder = document.getElementById('tourn-sub');

  if(t.status==='registration'){
    holder.innerHTML = `<div class="empty"><span class="ic"><span class="material-symbols-outlined">hourglass_empty</span></span>Aún en inscripción (${cuposTexto(t)}). Los sorteos aparecerán aquí cuando el admin los active.</div>`;
    return;
  }

  if(SUBVIEW_TOURN==='grupos') return renderGrupos(holder,t);
  if(SUBVIEW_TOURN==='tabla') return renderTabla(holder,t);
  if(SUBVIEW_TOURN==='goleo') return renderGoleo(holder,t);
  if(SUBVIEW_TOURN==='sorteo') return renderSorteo(holder,t);
  if(SUBVIEW_TOURN==='llave') return renderLlave(holder,t);
}

function renderGrupos(holder,t){
  if(!t.groups){ holder.innerHTML = `<div class="empty"><span class="ic"><span class="material-symbols-outlined">casino</span></span>${esLiga(t)?'El calendario aún no se ha generado.':'Los grupos aún no se han sorteado.'}</div>`; return; }
  let html = '';
  for(const key in t.groups){
    html += `<div class="card"><div class="grp-head">${esLiga(t)?`Calendario · ${(t.groupMatches[key]||[]).length} partidos`:`Grupo ${key}`}</div>`;
    t.groups[key].forEach(id=> html += `<div class="list-item"><span class="name">${esc(playerName(t,id))}</span><span class="sub">${esc(playerTeam(t,id))}</span></div>`);
    html += `<div style="height:10px"></div>`;
    (t.groupMatches[key]||[]).forEach(m=>{
      html += `<div class="match">
        <span class="side">${esc(playerName(t,m.p1))}</span>
        <span class="score">
          ${soyOwner(t) ? `<input class="sc" type="number" min="0" data-m="${key}:${m.id}:s1" value="${m.s1??''}">` : `<b>${m.s1??'-'}</b>` }
          <span class="vs">:</span>
          ${soyOwner(t) ? `<input class="sc" type="number" min="0" data-m="${key}:${m.id}:s2" value="${m.s2??''}">` : `<b>${m.s2??'-'}</b>` }
        </span>
        <span class="side right">${esc(playerName(t,m.p2))}</span>
      </div>`;
    });
    html += `</div>`;
  }
  if(soyOwner(t)){
    html += `<button class="btn" id="save-scores">Guardar marcadores</button>`;
  }
  holder.innerHTML = html;
  if(soyOwner(t)){
    document.getElementById('save-scores').onclick = async (ev)=> conCarga(ev.currentTarget, 'Guardando…', async ()=>{
      const fresh = await loadTournament(t.id);
      holder.querySelectorAll('input.sc').forEach(inp=>{
        const [g,mid,field] = inp.dataset.m.split(':');
        const m = fresh.groupMatches[g].find(x=>x.id===mid);
        const val = inp.value===''? null : parseInt(inp.value);
        m[field]=val;
        m.played = (m.s1!=null && m.s2!=null);
      });
      await saveTournament(fresh);
      CURRENT = fresh;
      renderTournament();
    });
  }
}

function renderTabla(holder,t){
  if(!t.groups){ holder.innerHTML=`<div class="empty"><span class="ic"><span class="material-symbols-outlined">bar_chart</span></span>${esLiga(t)?'La liga aún no arranca.':'Aún no hay grupos.'}</div>`; return; }
  let html='';
  for(const key in t.groups){
    const standings = computeStandings(t,key);
    html += `<div class="card"><div class="grp-head">${esLiga(t)?'Tabla de posiciones':`Grupo ${key}`}</div><table><thead><tr><th style="text-align:left">Jugador</th><th>PJ</th><th>PG</th><th>PE</th><th>PP</th><th>DG</th><th>Pts</th></tr></thead><tbody>`;
    standings.forEach((s,i)=>{
      html += `<tr class="${(esLiga(t)? i===0 : i<2)?'qualify':''}"><td class="tname">${esc(playerName(t,s.id))}</td><td>${s.pj}</td><td>${s.pg}</td><td>${s.pe}</td><td>${s.pp}</td><td>${s.gf-s.gc}</td><td><b>${s.pts}</b></td></tr>`;
    });
    html += `</tbody></table></div>`;
  }
  html += `<p class="muted small" style="margin-top:10px;">${esLiga(t)?'Resaltado en verde: líder de la liga. Desempate: puntos, diferencia de gol, goles a favor y enfrentamiento directo.':'Resaltados en verde: clasifican a playoffs.'}</p>`;
  holder.innerHTML = html;
}

function renderGoleo(holder,t){
  const rows = goleoTable(t);
  let html = `<div class="card sello"><table><thead><tr><th style="text-align:left">Jugador</th><th>Goles</th></tr></thead><tbody>`;
  rows.forEach((r,i)=> html += `<tr><td class="tname">${i+1}. ${esc(playerName(t,r.id))}</td><td><b>${r.goals}</b></td></tr>`);
  html += `</tbody></table></div>`;
  holder.innerHTML = html;
}

function renderLlave(holder,t){
  if(!t.bracket){ holder.innerHTML = `<div class="empty"><span class="ic"><span class="material-symbols-outlined">account_tree</span></span>La llave aparece cuando termina la fase de grupos.</div>`; return; }
  let html='';
  const totalRounds = totalRoundsOf(t.bracket);
  t.bracket.rounds.forEach((round,ri)=>{
    html += `<div class="card bracket-round sello"><div class="bracket-title">${roundLabel(totalRounds,ri)}</div>`;
    round.partidos.forEach((m,mi)=>{
      html += `<div class="match">
        <span class="side">${esc(playerName(t,m.p1))}</span>
        <span class="score">
          ${soyOwner(t) && !m.played ? `<input class="sc" type="number" min="0" data-bm="${ri}:${mi}:s1" value="${m.s1??''}">` : `<b>${m.s1??'-'}</b>` }
          <span class="vs">:</span>
          ${soyOwner(t) && !m.played ? `<input class="sc" type="number" min="0" data-bm="${ri}:${mi}:s2" value="${m.s2??''}">` : `<b>${m.s2??'-'}</b>` }
        </span>
        <span class="side right">${esc(playerName(t,m.p2))}</span>
      </div>`;
    });
    html += `</div>`;
  });
  if(t.status==='finished' && t.champion){
    html += `<div class="champ-banner card sello"><div class="cup"><span class="material-symbols-outlined">emoji_events</span></div><h2>${esc(playerName(t,t.champion))}</h2><p>Campeón de ${esc(t.name)}</p></div>`;
  } else if(soyOwner(t)){
    html += `<button class="btn" id="save-bracket">Guardar resultados de llave</button><div id="bracket-msg" style="margin-top:10px;"></div>`;
  }
  holder.innerHTML = html;
  if(soyOwner(t) && t.status!=='finished'){
    document.getElementById('save-bracket').onclick = async (ev)=> conCarga(ev.currentTarget, 'Guardando…', async ()=>{
      const fresh = await loadTournament(t.id);
      // Si el partido ya no existe en esa posición (otra sesión adelantó la llave
      // mientras esta pestaña estaba abierta), se ignora ese dato en vez de romper
      // todo el guardado: antes un solo índice desalineado perdía TODOS los marcadores.
      holder.querySelectorAll('input.sc').forEach(inp=>{
        const [ri,mi,field] = inp.dataset.bm.split(':');
        const m = fresh.bracket.rounds[ri]?.partidos?.[mi];
        if(!m) return;
        m[field] = inp.value===''? null : parseInt(inp.value);
      });
      // Un empate en playoffs no puede resolverse solo: antes se descartaba en silencio
      // y el botón parecía muerto.
      const empatados = fresh.bracket.rounds.flatMap(r=>r.partidos).filter(m=> m.s1!=null && m.s2!=null && m.s1===m.s2);
      if(empatados.length){
        const msg = holder.querySelector('#bracket-msg');
        if(msg) msg.innerHTML = '<span class="field-error">En playoffs no puede haber empate: define un ganador (tiempo extra o penales).</span>';
        return;
      }
      const msg = holder.querySelector('#bracket-msg');
      if(msg) msg.innerHTML = '';
      fresh.bracket.rounds.flatMap(r=>r.partidos).forEach(m=>{
        if(m.s1!=null && m.s2!=null){ m.played=true; m.winner = m.s1>m.s2? m.p1:m.p2; }
      });
      // advance rounds as far as possible
      let guard=0;
      while(guard<10){
        guard++;
        const before = JSON.stringify(fresh.bracket.rounds.length);
        tryAdvanceBracket(fresh);
        if(JSON.stringify(fresh.bracket.rounds.length)===before) break;
      }
      await saveTournament(fresh);
      CURRENT = fresh;
      if(fresh.status==='finished'){
        await pushHistory(fresh);
        renderTournament();
        launchConfetti();
      } else {
        renderTournament();
      }
    });
  }
}

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

/* ================= ADMIN ================= */
function renderAdmin(){
  if(!USER){
    $main.innerHTML = `<div class="lock-screen">
      <div class="ic"><span class="material-symbols-outlined">stadium</span></div>
      <h3>Organiza tu torneo</h3>
      <p class="muted small">Entra con tu cuenta de Google para crear torneos e invitar a tus amigos. Así tu torneo no se queda sin organizador aunque cambies de teléfono.</p>
      <div id="login-error"></div>
      <button class="btn" id="login-google" style="margin-top:16px;">Entrar con Google</button>
      <p class="muted small" style="margin-top:14px;">¿Te invitaron a un torneo? No necesitas cuenta: pega tu código desde <b>Inicio</b>.</p>
    </div>`;
    document.getElementById('login-google').onclick = async (ev)=> {
      const loginErrorEl = document.getElementById('login-error');
      const result = await conCarga(ev.currentTarget, 'Abriendo…', entrarConGoogle);
      if(result && !result.ok){
        loginErrorEl.innerHTML = `<div class="pill" style="background:var(--danger);color:var(--white);padding:10px;border-radius:8px;margin:14px 0;text-align:center;">${esc(result.error)}</div>`;
      }
    };
    return;
  }

  // Panel y Sorteos operan sobre el torneo activo: si no es tuyo, no se ofrecen.
  const tabs = soyOwner(CURRENT)
    ? [['panel','Panel'],['equipos','Sorteos'],['torneos','Torneos'],['lista','Lista válida']]
    : [['torneos','Torneos'],['lista','Lista válida']];
  if(!tabs.some(([k])=>k===SUBVIEW_ADMIN)) SUBVIEW_ADMIN = 'torneos';
  let html = `<div class="section-title"><div class="num"><span class="material-symbols-outlined">stadium</span></div><h3>Administración</h3></div>
  <div class="card tight" style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
    <span class="small muted">Sesión de <b>${esc(USER.displayName || USER.email || 'organizador')}</b></span>
    <button class="btn small ghost" id="logout-google">Salir</button>
  </div>`;
  html += `<div class="tabs2">${tabs.map(([k,l])=>`<button data-asub="${k}" class="${SUBVIEW_ADMIN===k?'active':''}">${l}</button>`).join('')}</div>`;
  html += `<div id="admin-sub"></div>`;
  $main.innerHTML = html;
  document.getElementById('logout-google').onclick = async (ev)=> conCarga(ev.currentTarget, 'Saliendo…', salirDeGoogle);
  $main.querySelectorAll('[data-asub]').forEach(b=> b.onclick=()=>{ SUBVIEW_ADMIN=b.dataset.asub; renderAdmin(); });
  const holder = document.getElementById('admin-sub');

  if(SUBVIEW_ADMIN==='panel') return renderAdminPanel(holder);
  if(SUBVIEW_ADMIN==='equipos') return renderAdminSorteos(holder);
  if(SUBVIEW_ADMIN==='torneos') return renderAdminTorneos(holder);
  if(SUBVIEW_ADMIN==='lista') return renderAdminLista(holder);
}

function renderAdminPanel(holder){
  const t = CURRENT;
  if(!t){ holder.innerHTML = `<div class="empty"><span class="ic"><span class="material-symbols-outlined">inbox</span></span>No hay torneo activo. Ve a "Torneos" para crear uno.</div>`; return; }
  let html = `<div class="card">
    <div class="list-item"><span class="name">Torneo activo</span><span>${esc(t.name)}</span></div>
    <div class="list-item"><span class="name">Estado</span><span class="badge on">${statusLabel(t).text}</span></div>
    <div class="list-item"><span class="name">Modalidad</span><span>${esLiga(t)?`Liga · ${t.vuelta?'ida y vuelta':'ida'}`:'Copa'}</span></div>
    <div class="list-item"><span class="name">Inscritos</span><span>${cuposTexto(t)}</span></div>
  </div>`;
  if(t.status==='registration'){
    const ajuste = formatoAjustado(t);
    html += `<button class="btn" id="close-reg" ${ajuste?'':'disabled'}>Cerrar inscripciones</button>`;
    if(!ajuste) html += `<p class="small muted">Necesitas al menos ${esLiga(t)?LIGA_MIN:8} jugadores inscritos.</p>`;
    else if(esLiga(t)){
      const pares = t.players.length*(t.players.length-1)/2;
      html += `<p class="small muted">Se jugarán <b>${t.vuelta?pares*2:pares} partidos</b> entre los ${t.players.length} inscritos.</p>`;
    }
    else if(ajuste !== t.size){
      const fuera = t.players.length - ajuste;
      html += `<p class="small muted">Con ${t.players.length} inscritos el torneo se ajustará a <b>${ajuste} equipos</b>`
        + (fuera? ` y ${fuera} ${fuera>1?'quedarán':'quedará'} como ${fuera>1?'suplentes':'suplente'}` : '') + `.</p>`;
    }
  } else {
    html += `<p class="muted small">Usa la pestaña "Sorteos" para continuar con equipos, asignación y ${esLiga(t)?'calendario':'grupos'}. Los marcadores se cargan desde la pestaña "Torneo".</p>`;
  }
  html += `<button class="btn ghost" id="export-active"><span class="material-symbols-outlined" style="font-size:1em;">download</span> Exportar este torneo (.csv)</button>`;
  html += `<div class="section-title"><div class="num"><span class="material-symbols-outlined">group</span></div><h3>Inscritos</h3></div><div class="card tight">`;
  html += t.players.length? t.players.map(p=>`<div class="list-item"><span class="name">${esc(p.alias)}</span><span class="sub">${esc(p.club)} · ${esc(p.country)}</span></div>`).join('') : '<div class="muted small">Sin inscritos aún.</div>';
  html += `</div>`;
  if(t.waitlist && t.waitlist.length){
    html += `<div class="section-title"><div class="num">${t.waitlist.length}</div><h3>Suplentes</h3></div>
      <div class="card tight"><p class="small muted">Quedaron fuera al ajustar el formato (por orden de inscripción).</p>`;
    html += t.waitlist.map(p=>`<div class="list-item"><span class="name">${esc(p.alias)}</span><span class="sub">${esc(p.club)} · ${esc(p.country)}</span></div>`).join('');
    html += `</div>`;
  }
  holder.innerHTML = html;
  const btn = document.getElementById('close-reg');
  if(btn) btn.onclick = async (ev)=> conCarga(ev.currentTarget, 'Cerrando…', async ()=>{
    const fresh = await loadTournament(t.id);
    const nuevo = formatoAjustado(fresh);
    if(!nuevo){ await mostrarAviso(`Necesitas al menos ${esLiga(fresh)?LIGA_MIN:8} jugadores inscritos para cerrar.`); return; }
    // En liga no hay ajuste de formato ni suplentes: el "formato" es la cantidad
    // de inscritos, y fijarlo deja funcionando tal cual todo lo que lee t.size.
    if(esLiga(fresh)){ fresh.size = fresh.players.length; }
    else if(nuevo !== fresh.size || fresh.players.length > nuevo){
      const fuera = fresh.players.length - nuevo;
      const cola = fuera ? ` y ${fuera} ${fuera>1?'jugadores quedan':'jugador queda'} como ${fuera>1?'suplentes':'suplente'}` : '';
      const ok = await mostrarConfirmacion(`${fresh.players.length} inscritos: el torneo se ajusta a ${nuevo} equipos${cola}.`, {titulo:'Ajustar formato', icono:'tune'});
      if(!ok) return;
      fresh.waitlist = [...(fresh.waitlist||[]), ...fresh.players.slice(nuevo)];
      fresh.players = fresh.players.slice(0, nuevo);
      fresh.size = nuevo;
    }
    fresh.status='closed_reg';
    await saveTournament(fresh);
    render();
  });
  document.getElementById('export-active').onclick = ()=> exportTournamentCSV(t);
}

function renderAdminSorteos(holder){
  const t = CURRENT;
  if(!t){ holder.innerHTML = `<div class="empty">No hay torneo activo.</div>`; return; }
  if(t.status==='registration'){ holder.innerHTML = `<div class="empty">Cierra las inscripciones primero (pestaña Panel).</div>`; return; }

  let html = '';
  if(!t.drawnTeams || t.drawnTeams.length===0){
    const pool = [];
    t.players.forEach(p=>{ pool.push({label:p.club,type:'club'}); pool.push({label:p.country,type:'country'}); });
    html += `<div class="card tight"><b>Paso 1 · Sorteo de equipos</b><p class="small muted">De ${pool.length} equipos propuestos, se sortearán ${t.size} para competir.</p>
    <button class="btn" id="draw-teams">Iniciar sorteo de equipos</button></div>`;
    holder.innerHTML = html;
    document.getElementById('draw-teams').onclick = ()=> runDrawTeams(t, pool, holder);
    return;
  }

  if(!t.players.every(p=>p.assignedTeam)){
    html += `<div class="card tight"><b>Equipos sorteados</b><p class="small">${esc(t.drawnTeams.join(' · '))}</p></div>
    <div class="card tight"><b>Paso 2 · Asignación jugador ↔ equipo</b><p class="small muted">Cada equipo sorteado se asignará al azar a un jugador.</p>
    <button class="btn" id="draw-assign">Sortear asignación</button></div>`;
    holder.innerHTML = html;
    document.getElementById('draw-assign').onclick = ()=> runDrawAssign(t, holder);
    return;
  }

  if(!t.groups){
    const pares = t.size*(t.size-1)/2;
    html += `<div class="card tight"><b>Equipos asignados</b>${t.players.map(p=>`<div class="list-item"><span class="name">${esc(p.alias)}</span><span class="sub">${esc(p.assignedTeam)}</span></div>`).join('')}</div>`;
    html += esLiga(t)
      ? `<div class="card tight"><b>Paso 3 · Generar calendario</b><p class="small muted">Todos contra todos${t.vuelta?', ida y vuelta':''}: ${t.vuelta?pares*2:pares} partidos entre los ${t.size} jugadores.</p>
    <button class="btn" id="draw-groups">Generar calendario</button></div>`
      : `<div class="card tight"><b>Paso 3 · Sorteo de grupos</b><p class="small muted">Se dividirán los ${t.size} jugadores en grupos de 4.</p>
    <button class="btn" id="draw-groups">Sortear grupos</button></div>`;
    holder.innerHTML = html;
    document.getElementById('draw-groups').onclick = ()=> runDrawGroups(t, holder);
    return;
  }

  if(esLiga(t) && t.status==='groups' && allGroupMatchesPlayed(t)){
    const lider = computeStandings(t,'L')[0];
    html += `<div class="card tight"><b>Liga completa</b><p class="small muted">Todos los partidos tienen marcador. Líder: <b>${esc(playerName(t,lider.id))}</b> con ${lider.pts} pts.</p>
    <button class="btn" id="close-liga">Cerrar liga y coronar campeón</button></div>`;
    holder.innerHTML = html;
    document.getElementById('close-liga').onclick = async (ev)=> conCarga(ev.currentTarget, 'Cerrando…', async ()=>{
      const fresh = await loadTournament(t.id);
      fresh.champion = computeStandings(fresh,'L')[0].id;
      fresh.status = 'finished';
      await saveTournament(fresh);
      await pushHistory(fresh);
      CURRENT = fresh;
      SUBVIEW_TOURN='tabla'; VIEW='tournament'; render();
      launchConfetti();
    });
    return;
  }

  if(t.status==='groups' && allGroupMatchesPlayed(t)){
    html += `<div class="card tight"><b>Fase de grupos completa</b><p class="small muted">Todos los partidos de grupo tienen marcador. Genera la llave de playoffs.</p>
    <button class="btn" id="build-bracket">Generar llave de playoffs</button></div>`;
    holder.innerHTML = html;
    document.getElementById('build-bracket').onclick = async (ev)=> conCarga(ev.currentTarget, 'Generando…', async ()=>{
      console.log('[Copas Noventeros] generar llave: click recibido, cargando torneo…');
      const fresh = await loadTournament(t.id);
      console.log('[Copas Noventeros] generar llave: torneo cargado, construyendo bracket…');
      buildBracketFromGroups(fresh);
      console.log('[Copas Noventeros] generar llave: bracket construido, guardando…');
      await saveTournament(fresh);
      console.log('[Copas Noventeros] generar llave: guardado OK');
      CURRENT = fresh;
      SUBVIEW_TOURN='llave'; VIEW='tournament'; render();
    });
    return;
  }

  holder.innerHTML = `<div class="empty"><span class="material-symbols-outlined">check_circle</span> Sorteos completos. Carga los marcadores desde la pestaña <b>Torneo</b>.</div>`;
}

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

// Los torneos del organizador se consultan a Firestore por ownerUid, no se leen del
// dispositivo: es lo que le permite recuperarlos al entrar con Google en otro teléfono.
async function misTorneosComoOwner(){
  if(!USER) return [];
  const snap = await getDocs(query(collection(db,'tournaments'), where('ownerUid','==',USER.uid)));
  return snap.docs.map(d=>d.data());
}

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
  // Si el usuario autenticado es el dueño, entra como admin; si no, como jugador.
  guardarMisTorneos(agregarTorneo(leerMisTorneos(), {id:t.id, nombre:t.name, rol: soyOwner(t) ? 'admin' : 'jugador'}));
  setTorneoActivoId(t.id);
  CURRENT = t;
  attachTournamentListener(t.id);
  return { ok:true, torneo:t };
}

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
    const ok = await mostrarConfirmacion('¿Eliminar este torneo y todos sus datos? Esta acción no se puede deshacer.', {titulo:'Eliminar torneo', icono:'delete_forever', textoOk:'Eliminar', peligroso:true});
    if(!ok) return;
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

// El texto de type=date lo pinta el propio sistema (no hereda font/peso de la app,
// se ve "delgado" comparado con el resto del formulario), así que en vez de pelear
// contra WebKit se precarga con hoy: el campo llega con valor sólido y el usuario
// solo lo cambia si la fecha real es otra.
function hoyISO(){
  const d = new Date();
  const pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function renderAdminTorneos(holder){
  const hoy = hoyISO();
  let html = `<div class="card tight">
    <b>Crear nuevo torneo</b>
    <label>Nombre</label><input id="nt-name" placeholder="Ej: Copa Verano FC27">
    <label>Modalidad</label>
    <select id="nt-mode"><option value="copa">Copa · grupos + playoffs</option><option value="liga">Liga · todos contra todos</option></select>
    <div id="box-copa">
      <label>Formato</label>
      <select id="nt-size"><option value="8">8 equipos</option><option value="16">16 equipos</option><option value="32">32 equipos</option></select>
    </div>
    <div id="box-liga" hidden>
      <label>Cupo máximo (opcional)</label>
      <input id="nt-cupo" type="number" min="3" placeholder="Sin límite">
      <label>Partidos</label>
      <select id="nt-vuelta"><option value="">Solo ida</option><option value="1">Ida y vuelta</option></select>
    </div>
    <label>Fecha del torneo</label><input id="nt-date" type="date" value="${hoy}">
    <label>Cierre de inscripción</label><input id="nt-deadline" type="date" value="${hoy}">
    <button class="btn" id="create-t" style="margin-top:14px;">Crear torneo</button>
  </div>`;
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

  document.getElementById('create-t').onclick = async (ev)=> conCarga(ev.currentTarget, 'Creando…', async ()=>{
    const name = document.getElementById('nt-name').value.trim() || 'Torneo sin nombre';
    const mode = document.getElementById('nt-mode').value;
    // En liga size es el cupo máximo: vacío o inválido = null = sin límite.
    const size = mode==='liga'
      ? (parseInt(document.getElementById('nt-cupo').value) || null)
      : parseInt(document.getElementById('nt-size').value);
    const vuelta = mode==='liga' && !!document.getElementById('nt-vuelta').value;
    const eventDate = document.getElementById('nt-date').value;
    const regDeadline = document.getElementById('nt-deadline').value;
    const t = blankTournament(name,size,eventDate,regDeadline,mode,vuelta);
    t.ownerUid  = USER.uid;
    t.ownerName = USER.displayName || '';
    // Validar que el código NO existe ya (colisión en 31^4 ≈ 923k): regenerar si es necesario.
    // Bounded a 5 intentos para asegurar que no sea infinito.
    for(let intento=0; intento<5; intento++){
      const existente = await buscarPorCodigo(t.joinCode);
      if(!existente) break;  // código libre, se puede usar
      t.joinCode = generarJoinCode();  // colisión: generar otro
    }
    await saveTournament(t);
    // El organizador también es "miembro" en su dispositivo: así el torneo aparece en
    // Mis torneos sin depender de la consulta por ownerUid, que es la vía de rescate.
    guardarMisTorneos(agregarTorneo(leerMisTorneos(), {id:t.id, nombre:t.name, rol:'admin'}));
    setTorneoActivoId(t.id);
    CURRENT = t;
    attachTournamentListener(t.id);
    renderAdmin();
  });
  const selMode = document.getElementById('nt-mode');
  selMode.onchange = ()=>{
    document.getElementById('box-copa').hidden = selMode.value!=='copa';
    document.getElementById('box-liga').hidden = selMode.value!=='liga';
  };
}

function renderAdminLista(holder){
  let html = `<div class="card tight"><b>Clubes válidos</b><p class="small muted">Edita separando por comas.</p>
    <textarea id="edit-clubs" style="width:100%;min-height:110px;background:var(--panel2);border:1px solid var(--line);border-radius:8px;color:var(--white);padding:10px;font-family:var(--font-ui);">${INDEX.validTeams.clubs.join(', ')}</textarea>
  </div>
  <div class="card tight"><b>Países válidos</b>
    <textarea id="edit-countries" style="width:100%;min-height:110px;background:var(--panel2);border:1px solid var(--line);border-radius:8px;color:var(--white);padding:10px;font-family:var(--font-ui);">${INDEX.validTeams.countries.join(', ')}</textarea>
  </div>
  <button class="btn" id="save-list">Guardar lista</button>`;
  holder.innerHTML = html;
  document.getElementById('save-list').onclick = async (ev)=> conCarga(ev.currentTarget, 'Guardando…', async ()=>{
    INDEX.validTeams.clubs = document.getElementById('edit-clubs').value.split(',').map(s=>s.trim()).filter(Boolean);
    INDEX.validTeams.countries = document.getElementById('edit-countries').value.split(',').map(s=>s.trim()).filter(Boolean);
    await saveIndex();
    await mostrarAviso('Lista actualizada.', {icono:'check_circle'});
  });
}

/* ================= EXPORT CSV ================= */
function csvEsc(v){
  v = (v===null||v===undefined) ? '' : String(v);
  if(/[",\n;]/.test(v)) return '"'+v.replace(/"/g,'""')+'"';
  return v;
}
function csvRow(arr){ return arr.map(csvEsc).join(',') + '\r\n'; }

function buildTournamentCSV(t){
  let out = '';
  out += 'INFORMACIÓN GENERAL\r\n';
  const liga = esLiga(t);
  out += csvRow(['Nombre','Modalidad','Formato','Fecha del torneo','Cierre de inscripción','Estado','Inscritos']);
  out += csvRow([t.name, liga?`Liga · ${t.vuelta?'ida y vuelta':'ida'}`:'Copa', t.size? t.size+(liga?' jugadores':' equipos'):'Sin límite', fmtDate(t.eventDate), fmtDate(t.regDeadline), statusLabel(t).text, cuposTexto(t)]);
  out += '\r\n';

  out += 'INSCRITOS\r\n';
  out += csvRow(['Alias','Club propuesto','País propuesto','Equipo asignado']);
  t.players.forEach(p=> out += csvRow([p.alias, p.club, p.country, p.assignedTeam||'']));
  out += '\r\n';

  if(t.drawnTeams && t.drawnTeams.length){
    out += 'EQUIPOS SORTEADOS\r\n';
    out += csvRow(['#','Equipo']);
    t.drawnTeams.forEach((team,i)=> out += csvRow([i+1, team]));
    out += '\r\n';
  }

  if(t.groups){
    out += (liga?'PARTICIPANTES':'GRUPOS') + '\r\n';
    out += csvRow([liga?'Liga':'Grupo','Jugador','Equipo']);
    for(const key in t.groups){
      t.groups[key].forEach(id=> out += csvRow([key, playerName(t,id), playerTeam(t,id)]));
    }
    out += '\r\n';

    out += (liga?'CALENDARIO':'PARTIDOS DE GRUPO') + '\r\n';
    out += csvRow([liga?'Liga':'Grupo','Jugador 1','Goles 1','Goles 2','Jugador 2','Jugado']);
    for(const key in t.groupMatches){
      t.groupMatches[key].forEach(m=> out += csvRow([key, playerName(t,m.p1), m.s1??'', m.s2??'', playerName(t,m.p2), m.played?'Sí':'No']));
    }
    out += '\r\n';

    out += 'TABLA DE POSICIONES\r\n';
    out += csvRow([liga?'Liga':'Grupo','Jugador','PJ','PG','PE','PP','DG','Pts', liga?'Campeón':'Clasifica']);
    for(const key in t.groups){
      const standings = computeStandings(t,key);
      standings.forEach((s,i)=> out += csvRow([key, playerName(t,s.id), s.pj, s.pg, s.pe, s.pp, s.gf-s.gc, s.pts, (liga? i===0 : i<2)?'Sí':'No']));
    }
    out += '\r\n';
  }

  out += 'TABLA DE GOLEO\r\n';
  out += csvRow(['#','Jugador','Goles']);
  goleoTable(t).forEach((r,i)=> out += csvRow([i+1, playerName(t,r.id), r.goals]));
  out += '\r\n';

  if(t.bracket){
    out += 'LLAVE DE PLAYOFFS\r\n';
    out += csvRow(['Ronda','Jugador 1','Goles 1','Goles 2','Jugador 2','Ganador']);
    const totalRounds = totalRoundsOf(t.bracket);
    t.bracket.rounds.forEach((round,ri)=>{
      round.partidos.forEach(m=> out += csvRow([roundLabel(totalRounds,ri), playerName(t,m.p1), m.s1??'', m.s2??'', playerName(t,m.p2), m.winner?playerName(t,m.winner):'']));
    });
    out += '\r\n';
  }

  if(t.champion){
    out += 'CAMPEÓN\r\n';
    out += csvRow([playerName(t,t.champion)]);
  }

  return out;
}

function exportTournamentCSV(t){
  const csv = '\uFEFF' + buildTournamentCSV(t); // BOM para tildes correctas en Excel
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = t.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').toLowerCase();
  a.href = url; a.download = `torneo-${safeName||t.id}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 2000);
}

/* ================= CONFETTI ================= */
function launchConfetti(){
  const canvas = document.getElementById('confetti-canvas');
  canvas.width = window.innerWidth; canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');
  const colors = ['#31e464','#d85b9b','#4c91c7','#c94d4d','#aeb7af'];
  const pieces = Array.from({length:120}).map(()=>({
    x: Math.random()*canvas.width, y: -20-Math.random()*canvas.height*.5,
    r: 4+Math.random()*5, c: colors[Math.floor(Math.random()*colors.length)],
    vy: 2+Math.random()*3, vx: -1.5+Math.random()*3, rot: Math.random()*360, vr: -6+Math.random()*12
  }));
  let frame=0;
  function tick(){
    frame++;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    pieces.forEach(p=>{
      p.x+=p.vx; p.y+=p.vy; p.rot+=p.vr;
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot*Math.PI/180);
      ctx.fillStyle=p.c; ctx.fillRect(-p.r/2,-p.r/2,p.r,p.r*1.6);
      ctx.restore();
    });
    if(frame<220) requestAnimationFrame(tick); else ctx.clearRect(0,0,canvas.width,canvas.height);
  }
  tick();
}

/* ================= ERROR GLOBAL ================= */
// Red gruesa: cualquier fallo de Firestore que no se maneje en el sitio (un guardado
// que no llegó, una lectura que se cortó) termina aquí. Sin esto, esos fallos pasaban
// en silencio y el admin no se enteraba de que un resultado no se guardó.
// Reemplaza alert()/confirm() nativos: su estilo lo pone el navegador, no la marca,
// y en iOS bloquean el hilo con una apariencia que no combina con nada del resto de
// la app. Estas versiones son asíncronas (por eso cada call site ahora usa await) y
// comparten el lenguaje visual del modal de error de más abajo.
function mostrarAviso(mensaje, {titulo='Aviso', icono='info'}={}){
  return new Promise(resolve=>{
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal-box">
      <span class="material-symbols-outlined">${esc(icono)}</span>
      <h3>${esc(titulo)}</h3>
      <p>${esc(mensaje)}</p>
      <button class="btn" id="modal-ok">Aceptar</button>
    </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#modal-ok').onclick = ()=>{ overlay.remove(); resolve(); };
  });
}
function mostrarConfirmacion(mensaje, {titulo='Confirmar', icono='help', textoOk='Continuar', peligroso=false}={}){
  return new Promise(resolve=>{
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal-box${peligroso?' danger':''}">
      <span class="material-symbols-outlined">${esc(icono)}</span>
      <h3>${esc(titulo)}</h3>
      <p>${esc(mensaje)}</p>
      <div class="row" style="margin-top:6px;">
        <button class="btn ghost" id="modal-cancel">Cancelar</button>
        <button class="btn${peligroso?' danger':''}" id="modal-confirm">${esc(textoOk)}</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    const cerrar = (v)=>{ overlay.remove(); resolve(v); };
    overlay.querySelector('#modal-cancel').onclick = ()=>cerrar(false);
    overlay.querySelector('#modal-confirm').onclick = ()=>cerrar(true);
  });
}

let errorGlobalVisible = false;
function mostrarErrorGlobal(){
  if(errorGlobalVisible) return;
  errorGlobalVisible = true;
  const overlay = document.createElement('div');
  overlay.className = 'error-overlay';
  overlay.innerHTML = `<div class="error-box">
    <span class="material-symbols-outlined">cloud_off</span>
    <h3>Algo salió mal</h3>
    <p>No se pudo completar la acción. Espera un momento y vuelve a intentarlo.</p>
    <button class="btn" id="error-ok">Entendido</button>
  </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#error-ok').onclick = ()=>{ overlay.remove(); errorGlobalVisible=false; };
}
// preventDefault() en unhandledrejection suprime el log automático del navegador
// en consola -- por eso el detalle se registra explícito aquí con console.error,
// para poder diagnosticar por Web Inspector remoto sin exponer nada al usuario.
window.addEventListener('unhandledrejection', e=>{
  console.error('[Copas Noventeros] promesa rechazada sin manejar:', e.reason);
  e.preventDefault();
  mostrarErrorGlobal();
});
window.addEventListener('error', e=>{
  console.error('[Copas Noventeros] error:', e.error || e.message, e.filename+':'+e.lineno);
  mostrarErrorGlobal();
});

/* ================= INDICADOR DE CARGA ================= */
// Envuelve un botón que dispara una escritura: lo deshabilita y muestra un spinner
// mientras dura, y lo restaura al terminar (incluso si la acción falla).
async function conCarga(boton, textoCargando, accion){
  const original = boton.innerHTML;
  boton.disabled = true;
  boton.classList.add('cargando');
  boton.innerHTML = `<span class="spinner"></span>${textoCargando}`;
  try{
    return await accion();
  } finally {
    boton.disabled = false;
    boton.classList.remove('cargando');
    boton.innerHTML = original;
  }
}

/* ================= INIT (tiempo real con Firestore) ================= */
document.querySelectorAll('.tabbar button').forEach(b=>{
  b.onclick = ()=>{ VIEW=b.dataset.view; render(); };
});

// Firestore reintenta la conexión indefinidamente sin rechazar la promesa: sin este
// timeout, una config equivocada o la falta de internet dejan la página en blanco.
function withTimeout(p, ms){
  return Promise.race([p, new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')), ms))]);
}

function showBootError(titulo, detalle){
  const pill = document.getElementById('status-pill');
  pill.textContent = 'Sin conexión'; pill.className = 'pill';
  $main.innerHTML = `<div class="empty">
    <span class="ic"><span class="material-symbols-outlined">cloud_off</span></span>
    <b style="color:var(--white)">${titulo}</b><br><br>${detalle}
  </div>
  <button class="btn" id="retry-boot">Reintentar</button>`;
  document.getElementById('retry-boot').onclick = ()=>{
    $main.innerHTML = `<div class="empty">Conectando…</div>`;
    boot();
  };
}

async function boot(){
  if(!firebaseConfig){
    showBootError('firebase-config.js no exporta la configuración',
      'El archivo debe empezar con <b>export const firebaseConfig = {…}</b>. Firebase muestra el bloque sin la palabra <b>export</b>, así que hay que agregarla al pegarlo.');
    return;
  }
  if(!firebaseConfig.apiKey || firebaseConfig.apiKey === 'TU_API_KEY_AQUI'){
    showBootError('Falta configurar Firebase',
      'Abre el archivo <b>firebase-config.js</b> y reemplaza los valores de ejemplo por los de tu proyecto (ver README, paso 1).');
    return;
  }
  if(!db){
    showBootError('La configuración de Firebase no es válida',
      'Revisa que copiaste el bloque completo desde la consola de Firebase (apiKey, authDomain, projectId…).');
    return;
  }
  try{
    await withTimeout(loadIndex(), 8000);
    // Link de invitación: ?j=NOV-4K2P. Se consume una sola vez y se limpia de la barra
    // de direcciones, para que recargar o compartir la URL no reintente unirse.
    const codigoUrl = new URLSearchParams(location.search).get('j');
    if(codigoUrl){
      // Si la invitación falla (red inestable, timeout), la app igual tiene que arrancar:
      // el jugador entra sin torneo y puede pegar el código a mano desde Inicio.
      try{ await withTimeout(unirseACodigo(codigoUrl), 8000); }
      catch(e){ /* la invitación se pierde, el arranque sigue */ }
      history.replaceState(null, '', location.pathname);
    }
    const activo = torneoActivoId();
    if(activo) CURRENT = await withTimeout(loadTournament(activo), 8000);
  }catch(e){
    showBootError('No se pudo conectar con la base de datos',
      'Revisa tu conexión a internet y que los datos de <b>firebase-config.js</b> sean correctos.');
    return;
  }
  // La sesión de Google se restaura de forma asíncrona al cargar la página. El listener
  // detecta cambios de sesión (login/logout) y repinta si el uid cambió, inclusive en vistas
  // que dependen del dueño (renderGrupos, renderLlave gatean en soyOwner(t), que depende de USER).
  if(!listenersListos){
    onAuthStateChanged(auth, u => {
      const nuevo = u ? u.uid : null;
      USER = u;
      if(nuevo !== prevUid){ prevUid = nuevo; if(!isTypingNow()) render(); }
    });
    attachIndexListener();
    listenersListos = true;
  }
  render();
  attachTournamentListener(torneoActivoId());
}
boot();
