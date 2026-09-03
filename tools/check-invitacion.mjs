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
