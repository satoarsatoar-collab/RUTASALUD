'use strict';
// Prueba del backend con una IA simulada (no gasta créditos ni requiere clave real).
const assert = require('assert');
process.env.ANTHROPIC_API_KEY = 'clave-de-prueba';
process.env.RATE_LIMIT = '3';
let ultimo = null;
global.fetch = async (url, opts) => {
  ultimo = { url, body: JSON.parse(opts.body), headers: opts.headers };
  return { ok: true, status: 200, json: async () => ({ content: [{ type: 'tool_use', name: 'registrar_analisis', input: {
    texto_corregido: 'Mi mamá tiene 70 años. El médico le ordenó una cita con cardiología hace dos meses y la EPS no se la ha asignado.',
    resumen_simple: 'La EPS no ha dado la cita de cardiología.', barrera: 'cita', urgencia_detectada: 'no',
    especial_proteccion: ['adulto_mayor', 'no_valida'], entidad: 'EPS Ejemplo', servicio: 'cita de cardiología',
    fecha_inicio_aprox: '2026-07-10', previa_detectada: 'no',
    datos_archivos: [{ indice: 0, tipo: 'orden_medica', resumen: 'Orden de cardiología.' }],
    datos_faltantes: ['Fecha exacta de la orden'], alertas: [], campo_extra: 'x' } }] }) };
};
const handler = require('../api/analizar.js');
function llamar(metodo, cuerpo, ip) {
  return new Promise(resolve => {
    const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(t) { resolve({ codigo: this.statusCode, json: t ? JSON.parse(t) : null }); } };
    handler({ method: metodo, headers: { 'x-forwarded-for': ip || '1.1.1.1' }, body: cuerpo, socket: {} }, res);
  });
}
(async () => {
  let r = await llamar('GET'); assert.strictEqual(r.codigo, 200); assert.strictEqual(r.json.ia, true);
  r = await llamar('POST', { relato: 'corto' }); assert.strictEqual(r.codigo, 400);
  r = await llamar('POST', { relato: 'Mi mamá tiene cita pendiente hace dos meses y la eps no da nada', archivos: [{ nombre: 'orden.jpg', tipo: 'image/jpeg', base64: 'QUJD' }] });
  assert.strictEqual(r.codigo, 200);
  assert.deepStrictEqual(r.json.especial_proteccion, ['adulto_mayor']);          // filtra valores no válidos
  assert.strictEqual(r.json.campo_extra, undefined);                             // descarta campos extra
  assert.strictEqual(ultimo.headers['x-api-key'], 'clave-de-prueba');
  assert.strictEqual(ultimo.body.tool_choice.name, 'registrar_analisis');
  const tipos = ultimo.body.messages[0].content.map(b => b.type); assert.ok(tipos.includes('image'));
  r = await llamar('POST', { relato: 'x'.repeat(30), archivos: [{ nombre: 'a', tipo: 'text/html', base64: 'QUJD' }] }); assert.strictEqual(r.codigo, 400);
  r = await llamar('POST', { relato: 'x'.repeat(30) }, '2.2.2.2'); assert.strictEqual(r.codigo, 200);
  await llamar('POST', { relato: 'x'.repeat(30) }, '2.2.2.2'); await llamar('POST', { relato: 'x'.repeat(30) }, '2.2.2.2');
  r = await llamar('POST', { relato: 'x'.repeat(30) }, '2.2.2.2'); assert.strictEqual(r.codigo, 429);      // límite por IP
  console.log('Backend: todas las pruebas pasaron');
})().catch(e => { console.error('FALLÓ', e); process.exit(1); });
