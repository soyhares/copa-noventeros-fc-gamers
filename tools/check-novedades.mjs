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
