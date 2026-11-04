'use strict';
// Verifica que el cliente Redis habla el protocolo REST de Upstash (con un servidor falso).
const http = require('http'), assert = require('assert');
const kv = new Map(), z = new Map();
function ejecutar(c) {
  const [op, ...a] = c;
  if (op === 'SET') { kv.set(a[0], a[1]); return 'OK'; }
  if (op === 'GET') return kv.get(a[0]) || null;
  if (op === 'DEL') return kv.delete(a[0]) ? 1 : 0;
  if (op === 'ZADD') { z.set(a[2], Number(a[1])); return 1; }
  if (op === 'ZREM') return z.delete(a[1]) ? 1 : 0;
  if (op === 'ZREVRANGE') return [...z.entries()].sort((x, y) => y[1] - x[1]).map(e => e[0]).slice(Number(a[1]), Number(a[2]) + 1);
  throw new Error('comando ' + op);
}
const srv = http.createServer((req, res) => {
  let t = ''; req.on('data', d => t += d); req.on('end', () => {
    if (req.headers.authorization !== 'Bearer tok') { res.statusCode = 401; return res.end('{}'); }
    const b = JSON.parse(t); res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(req.url === '/pipeline' ? b.map(c => ({ result: ejecutar(c) })) : { result: ejecutar(b) }));
  });
}).listen(0, async () => {
  process.env.UPSTASH_REDIS_REST_URL = 'http://127.0.0.1:' + srv.address().port; process.env.UPSTASH_REDIS_REST_TOKEN = 'tok'; process.env.VERCEL = '1';
  const { db } = require('../api/_util.js'); const d = db();
  try {
    assert.strictEqual(d.tipo, 'redis');
    await d.guardar('A', { id: 'A', n: 1 }, 1); await d.guardar('B', { id: 'B', n: 2 }, 2);
    assert.deepStrictEqual((await d.listar(10)).map(x => x.id), ['B', 'A']);
    assert.strictEqual((await d.leer('A')).n, 1);
    kv.delete('caso:A'); // simula caducidad por TTL
    assert.deepStrictEqual((await d.listar(10)).map(x => x.id), ['B']);
    assert.ok(!z.has('A')); // el índice se limpia solo
    await d.borrar('B'); assert.strictEqual(await d.leer('B'), null);
    console.log('Redis (protocolo REST): todas las pruebas pasaron');
  } catch (e) { console.error('FALLÓ', e); process.exitCode = 1; } finally { srv.close(); }
});
