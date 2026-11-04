'use strict';
// Prueba de guardado de casos y panel admin con la memoria local (sin Redis real).
const assert = require('assert');
process.env.ADMIN_KEY = 'clave-de-prueba-muy-larga-123';
delete process.env.VERCEL;
const caso = require('../api/caso.js');
const admin = require('../api/admin.js');

function llamar(h, metodo, { cuerpo, url, auth, ip } = {}) {
  return new Promise(resolve => {
    const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(t) { let j = null; try { j = JSON.parse(t); } catch (e) { /* csv */ } resolve({ codigo: this.statusCode, json: j, texto: t, h: this.headers }); } };
    h({ method: metodo, url: url || '/', headers: { 'x-forwarded-for': ip || '9.9.9.9', ...(auth ? { authorization: 'Bearer ' + auth } : {}) }, body: cuerpo, socket: {} }, res);
  });
}
const OK = { acepta: true, version: 'v1', ia: false };
const base = { consentimiento: OK, relato_original: 'mi mama no tiene cita', relato_corregido: 'Mi mamá no tiene cita.', usa_ia: false,
  respuestas: { urgencia: 'no', barrera: 'cita', especial: ['adulto_mayor', 'x'], tiempo: 'mas' }, datos: { entidad: 'EPS X', servicio: '=HYPERLINK("http://malo")', desde: '2026-09-01' },
  ruta: { principal: 'eps', titular: 'Empieza por el reclamo' }, archivos: [{ tipo: 'orden_medica', resumen: 'Orden' }], campo_raro: 'zzz' };

(async () => {
  let r = await llamar(caso, 'GET'); assert.strictEqual(r.json.activo, true);
  // sin autorización no se guarda nada
  r = await llamar(caso, 'POST', { cuerpo: { ...base, consentimiento: { acepta: false, version: 'v1' } } }); assert.strictEqual(r.codigo, 403);
  r = await llamar(caso, 'POST', { cuerpo: { ...base, consentimiento: { acepta: true, version: 'vieja' } } }); assert.strictEqual(r.codigo, 403);
  r = await llamar(caso, 'POST', { cuerpo: { ...base, consentimiento: undefined } }); assert.strictEqual(r.codigo, 403);
  // crear
  r = await llamar(caso, 'POST', { cuerpo: base }); assert.strictEqual(r.codigo, 200);
  const { id, clave } = r.json; assert.ok(/^RS-[0-9A-F]{10}$/.test(id)); assert.ok(clave.length >= 20);
  // actualizar solo con la clave
  r = await llamar(caso, 'POST', { cuerpo: { ...base, id, clave: 'otra' } }); assert.strictEqual(r.codigo, 404);
  r = await llamar(caso, 'POST', { cuerpo: { ...base, id, clave, ruta: { principal: 'tutela', titular: 't' } } }); assert.strictEqual(r.codigo, 200);
  // admin: protegido
  r = await llamar(admin, 'GET'); assert.strictEqual(r.codigo, 401);
  r = await llamar(admin, 'GET', { auth: 'mala' }); assert.strictEqual(r.codigo, 401);
  r = await llamar(admin, 'GET', { auth: process.env.ADMIN_KEY, url: '/api/admin' }); assert.strictEqual(r.codigo, 200);
  assert.strictEqual(r.json.casos.length, 1);
  const c = r.json.casos[0];
  assert.strictEqual(c.clave_hash, undefined);                      // nunca se expone el hash
  assert.strictEqual(c.campo_raro, undefined);                      // descarta campos extra
  assert.deepStrictEqual(c.respuestas.especial, ['adulto_mayor']);  // filtra valores no válidos
  assert.strictEqual(c.ruta.principal, 'tutela');
  assert.strictEqual(c.consentimiento.version, 'v1');
  // CSV: neutraliza fórmulas
  r = await llamar(admin, 'GET', { auth: process.env.ADMIN_KEY, url: '/api/admin?accion=exportar' });
  assert.ok(r.texto.includes(`"'=HYPERLINK(`)); assert.ok(/text\/csv/.test(r.h['Content-Type']));
  // admin: sin clave configurada o corta = desactivado
  const guardada = process.env.ADMIN_KEY; process.env.ADMIN_KEY = 'corta';
  r = await llamar(admin, 'GET', { auth: 'corta' }); assert.strictEqual(r.codigo, 503);
  process.env.ADMIN_KEY = guardada;
  // el titular borra su caso con su clave
  r = await llamar(caso, 'DELETE', { cuerpo: { id, clave: 'mala' } }); assert.strictEqual(r.codigo, 404);
  r = await llamar(caso, 'DELETE', { cuerpo: { id, clave } }); assert.strictEqual(r.codigo, 200);
  r = await llamar(admin, 'GET', { auth: guardada }); assert.strictEqual(r.json.casos.length, 0);
  // el admin borra por código
  r = await llamar(caso, 'POST', { cuerpo: base }); const id2 = r.json.id;
  r = await llamar(admin, 'DELETE', { auth: guardada, url: '/api/admin?id=' + id2 }); assert.strictEqual(r.codigo, 200);
  r = await llamar(admin, 'DELETE', { auth: guardada, url: '/api/admin?id=../../x' }); assert.strictEqual(r.codigo, 400);
  // límite de intentos fallidos
  let ultimo; for (let i = 0; i < 10; i++) ultimo = await llamar(admin, 'GET', { auth: 'x', ip: '7.7.7.7' });
  assert.strictEqual(ultimo.codigo, 429);
  console.log('Casos y panel admin: todas las pruebas pasaron');
})().catch(e => { console.error('FALLÓ', e); process.exit(1); });
