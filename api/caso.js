'use strict';
/**
 * Guarda un caso SOLO si la persona dio su autorización expresa (consentimiento
 * versionado). La persona recibe un código y una clave privada para poder
 * eliminar su caso cuando quiera (derecho de supresión, Ley 1581 de 2012, art. 8).
 *
 *   GET    -> { ok, activo, dias }                 (¿hay almacenamiento? ¿cuántos días se conserva?)
 *   POST   -> crea o actualiza (con id + clave)    -> { id, clave }
 *   DELETE -> elimina (con id + clave)
 *
 * No se guardan: archivos adjuntos, IP, ni datos del navegador.
 */
const crypto = require('crypto');
const { json, ipDe, leerCuerpo, crearLimitador, sha, igualesSeguro, db, DIAS } = require('./_util');

const MAX_CUERPO = 120 * 1024;
const limitadoCrear = crearLimitador(parseInt(process.env.SAVE_RATE_LIMIT || '30', 10), 60 * 60 * 1000);
const limitadoBorrar = crearLimitador(20, 60 * 60 * 1000);
const VERSION_CONSENTIMIENTO = process.env.CONSENT_VERSION || 'v1';

const T = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, n) : '');
const E = (v, lista, def) => (lista.includes(v) ? v : def);
const ISO = v => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');

function limpiarCaso(b) {
  const a = b && typeof b.respuestas === 'object' && b.respuestas ? b.respuestas : {};
  const d = b && typeof b.datos === 'object' && b.datos ? b.datos : {};
  const esp = Array.isArray(a.especial) ? a.especial.filter(x => ['menor_edad', 'adulto_mayor', 'discapacidad', 'embarazo', 'enfermedad_grave', 'ninguna'].includes(x)).slice(0, 6) : [];
  return {
    relato_original: T(b.relato_original, 6000),
    relato_corregido: T(b.relato_corregido, 8000),
    usa_ia: b.usa_ia === true,
    respuestas: {
      urgencia: E(a.urgencia, ['si', 'duda', 'no'], ''),
      barrera: E(a.barrera, ['cita', 'medicamento', 'autorizacion', 'programacion', 'calidad', 'otro'], ''),
      tiempo: T(a.tiempo, 20), previa: T(a.previa, 20), orden: T(a.orden, 20), afectacion: T(a.afectacion, 20),
      quien: T(a.quien, 20), especial: esp
    },
    datos: { entidad: T(d.entidad, 120), servicio: T(d.servicio, 200), desde: ISO(d.desde) },
    ruta: { principal: E(b.ruta && b.ruta.principal, ['eps', 'super', 'tutela'], ''), titular: T(b.ruta && b.ruta.titular, 400) },
    archivos: (Array.isArray(b.archivos) ? b.archivos : []).slice(0, 4).map(f => ({ tipo: T(f && f.tipo, 30), resumen: T(f && f.resumen, 400) })),
    resumen_ia: T(b.resumen_ia, 800)
  };
}

module.exports = async function handler(req, res) {
  const permitido = process.env.ALLOWED_ORIGIN;
  if (permitido) {
    res.setHeader('Access-Control-Allow-Origin', permitido);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    const origen = req.headers.origin;
    if (origen && origen !== permitido) return json(res, 403, { error: 'Origen no permitido.' });
  }
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  const base = db();
  if (req.method === 'GET') return json(res, 200, { ok: true, activo: !!base, dias: DIAS, version: VERSION_CONSENTIMIENTO });
  if (!base) return json(res, 503, { error: 'El guardado de casos no está activo.' });
  if (req.method !== 'POST' && req.method !== 'DELETE') return json(res, 405, { error: 'Método no permitido.' });

  let body;
  try { body = await leerCuerpo(req, MAX_CUERPO); }
  catch (e) { return json(res, e.message === 'grande' ? 413 : 400, { error: 'Solicitud no válida.' }); }
  const ip = ipDe(req);

  try {
    if (req.method === 'DELETE') {
      if (limitadoBorrar(ip)) return json(res, 429, { error: 'Demasiados intentos. Espera un rato.' });
      const id = T(body.id, 40), clave = T(body.clave, 80);
      const actual = id && (await base.leer(id));
      if (!actual || !clave || !igualesSeguro(sha(clave), actual.clave_hash)) return json(res, 404, { error: 'No encontré ese caso o la clave no coincide.' });
      await base.borrar(id);
      return json(res, 200, { ok: true });
    }

    if (limitadoCrear(ip)) return json(res, 429, { error: 'Demasiados intentos. Espera un rato.' });
    const c = body.consentimiento;
    if (!c || c.acepta !== true || c.lectura_completa !== true || c.version !== VERSION_CONSENTIMIENTO) return json(res, 403, { error: 'Falta la autorización para tratar los datos.' });

    const ahora = Date.now();
    const caso = limpiarCaso(body);
    const consentimiento = { version: VERSION_CONSENTIMIENTO, fecha: new Date(ahora).toISOString(), ia: c.ia === true, lectura_completa: true };

    const idPrevio = T(body.id, 40), clavePrevia = T(body.clave, 80);
    if (idPrevio) { // actualización: solo con la clave del caso
      const actual = await base.leer(idPrevio);
      if (!actual || !clavePrevia || !igualesSeguro(sha(clavePrevia), actual.clave_hash)) return json(res, 404, { error: 'No encontré ese caso o la clave no coincide.' });
      const reg = { ...actual, ...caso, consentimiento: { ...consentimiento, fecha: actual.consentimiento.fecha }, actualizado: new Date(ahora).toISOString() };
      await base.guardar(idPrevio, reg, Date.parse(actual.creado) || ahora);
      return json(res, 200, { id: idPrevio, clave: clavePrevia });
    }

    const id = 'RS-' + crypto.randomBytes(5).toString('hex').toUpperCase();
    const clave = crypto.randomBytes(12).toString('hex');
    const reg = { id, creado: new Date(ahora).toISOString(), actualizado: new Date(ahora).toISOString(), clave_hash: sha(clave), consentimiento, ...caso };
    await base.guardar(id, reg, ahora);
    return json(res, 200, { id, clave });
  } catch (e) {
    console.error('Error en api/caso:', e && e.message);
    return json(res, 500, { error: 'No pude guardar el caso. Puedes seguir usando la herramienta.' });
  }
};
module.exports.limpiarCaso = limpiarCaso;
