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
