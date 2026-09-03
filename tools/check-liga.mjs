// Chequeo mínimo de la lógica pura del torneo. Corre con: node tools/check-liga.mjs
//
// app.js es un módulo de navegador (importa Firebase del CDN y toca el DOM al cargar),
// así que no se puede importar desde node. En vez de duplicar la lógica aquí — un test
// que no probaría nada — se recorta del archivo real el bloque de funciones puras
// (entre `function newId()` y el marcador `/* ---- bracket ---- */`) y se evalúa.
// Si alguien mueve o renombra esos límites, el script falla ruidosamente.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const src = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const desde = src.indexOf('function newId()');
const hasta = src.indexOf('/* ---- bracket ---- */');
assert.ok(desde > 0 && hasta > desde, 'no se encontró el bloque de lógica pura en app.js');

const { esLiga, formatoAjustado, roundRobinPairs, computeStandings, allGroupMatchesPlayed } =
  await import('data:text/javascript,' + encodeURIComponent(
    src.slice(desde, hasta) +
    '\nexport { esLiga, formatoAjustado, roundRobinPairs, computeStandings, allGroupMatchesPlayed };'
  ));

const jugadores = n => Array.from({length:n}, (_,i)=>({id:'p'+i, alias:'J'+i}));

/* ---- formatoAjustado ---- */
assert.equal(formatoAjustado({mode:'liga', players:jugadores(2)}), null, 'liga con 2 no debe cerrar');
assert.equal(formatoAjustado({mode:'liga', players:jugadores(3)}), 3, 'liga con 3 cierra en 3');
assert.equal(formatoAjustado({mode:'liga', players:jugadores(11)}), 11, 'liga no redondea a potencia de 2');
assert.equal(formatoAjustado({players:jugadores(11), size:16}), 8, 'copa con 11 baja a 8');
assert.equal(formatoAjustado({players:jugadores(7), size:8}), null, 'copa con 7 no cierra');
assert.equal(esLiga({}), false, 'torneo sin mode es copa');

/* ---- calendario ---- */
const ids = jugadores(4).map(p=>p.id);
const ida = roundRobinPairs(ids);
assert.equal(ida.length, 6, '4 jugadores, solo ida = 6 partidos');
const vuelta = [...ida, ...ida.map(([a,b])=>[b,a])];
assert.equal(vuelta.length, 12, '4 jugadores, ida y vuelta = 12 partidos');
assert.ok(vuelta.some(([a,b])=>a===ids[1]&&b===ids[0]), 'la vuelta invierte local y visita');

/* ---- tabla: desempate Pts -> DG -> GF -> enfrentamiento directo ---- */
// A y B quedan idénticos en Pts, DG y GF; B le ganó a A, así que B debe ir primero.
const t = {
  groups:      { L:['A','B','C','D'] },
  groupMatches:{ L:[
    {id:'L-0', p1:'A', p2:'B', s1:0, s2:1, played:true},   // B gana el mano a mano
    {id:'L-1', p1:'A', p2:'C', s1:3, s2:0, played:true},
    {id:'L-2', p1:'A', p2:'D', s1:1, s2:0, played:true},
    {id:'L-3', p1:'B', p2:'C', s1:3, s2:0, played:true},
    {id:'L-4', p1:'B', p2:'D', s1:0, s2:1, played:true},
    {id:'L-5', p1:'C', p2:'D', s1:0, s2:0, played:true},
  ]},
};
const tabla = computeStandings(t, 'L');
const [a] = tabla.filter(r=>r.id==='A'), [b] = tabla.filter(r=>r.id==='B');
assert.equal(a.pts, b.pts, 'el caso de prueba requiere empate en puntos');
assert.equal(a.gf-a.gc, b.gf-b.gc, 'el caso de prueba requiere empate en DG');
assert.equal(a.gf, b.gf, 'el caso de prueba requiere empate en GF');
assert.equal(tabla[0].id, 'B', 'con todo empatado gana el enfrentamiento directo');
assert.equal(a.pj, 3, 'PJ cuenta todos los partidos jugados');
assert.ok(allGroupMatchesPlayed(t), 'todos los partidos están jugados');

// Un empate a un triunfo por lado (ida y vuelta) no debe desempatar nada.
const par = { groups:{L:['A','B']}, groupMatches:{L:[
  {id:'L-0', p1:'A', p2:'B', s1:1, s2:0, played:true},
  {id:'L-1', p1:'B', p2:'A', s1:1, s2:0, played:true},
]}};
assert.equal(computeStandings(par,'L').length, 2, 'ida y vuelta parejo no rompe el orden');

console.log('✓ lógica de liga OK');
