'use strict';
/**
 * API del administrador. Se protege con la variable ADMIN_KEY (mínimo 16 caracteres).
 * Sin ADMIN_KEY o con una clave corta, el panel queda DESACTIVADO (falla cerrado).
 * La clave viaja en el encabezado Authorization: Bearer <clave>; nunca en la URL.
 *
 *   GET    ?accion=listar            -> { casos: [...] }   (sin clave_hash)
 *   GET    ?accion=exportar          -> CSV
 *   DELETE ?id=RS-XXXX               -> elimina un caso
 */
const { json, ipDe, crearLimitador, igualesSeguro, db } = require('./_util');

const fallos = crearLimitador(8, 15 * 60 * 1000); // 8 intentos fallidos por IP cada 15 min
const espera = ms => new Promise(r => setTimeout(r, ms));

function publico(c) { const { clave_hash, ...resto } = c; return resto; }

function celdaCSV(v) {
  let s = Array.isArray(v) ? v.join('; ') : String(v == null ? '' : v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // evita inyección de fórmulas en Excel
  return '"' + s.replace(/"/g, '""') + '"';
}
function aCSV(casos) {
  const cols = ['id', 'creado', 'consentimiento_version', 'usa_ia', 'urgencia', 'barrera', 'tiempo', 'previa', 'orden', 'afectacion', 'quien', 'especial', 'entidad', 'servicio', 'desde', 'ruta_principal', 'resumen_ia', 'relato_corregido', 'relato_original'];
  const filas = casos.map(c => [c.id, c.creado, c.consentimiento && c.consentimiento.version, c.usa_ia ? 'sí' : 'no',
    c.respuestas.urgencia, c.respuestas.barrera, c.respuestas.tiempo, c.respuestas.previa, c.respuestas.orden, c.respuestas.afectacion, c.respuestas.quien, c.respuestas.especial,
    c.datos.entidad, c.datos.servicio, c.datos.desde, c.ruta.principal, c.resumen_ia, c.relato_corregido, c.relato_original].map(celdaCSV).join(','));
  return '﻿' + cols.join(',') + '\r\n' + filas.join('\r\n') + '\r\n';
}

module.exports = async function handler(req, res) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const clave = process.env.ADMIN_KEY || '';
  if (clave.length < 16) return json(res, 503, { error: 'El panel está desactivado: defina ADMIN_KEY (mínimo 16 caracteres).' });
  if (req.method !== 'GET' && req.method !== 'DELETE') return json(res, 405, { error: 'Método no permitido.' });

  const ip = ipDe(req);
  const m = /^Bearer (.+)$/.exec(String(req.headers.authorization || ''));
  if (!m || !igualesSeguro(m[1], clave)) {
    if (fallos(ip)) return json(res, 429, { error: 'Demasiados intentos. Espera 15 minutos.' });
    await espera(600);
    return json(res, 401, { error: 'Clave incorrecta.' });
  }
  const base = db();
  if (!base) return json(res, 503, { error: 'No hay base de datos configurada (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN).' });

  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'DELETE') {
      const id = (url.searchParams.get('id') || '').slice(0, 40);
      if (!/^RS-[0-9A-F]{10}$/.test(id)) return json(res, 400, { error: 'Código no válido.' });
      await base.borrar(id);
      return json(res, 200, { ok: true });
    }
    const casos = (await base.listar(1000)).map(publico);
    if (url.searchParams.get('accion') === 'exportar') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="casos-ruta-salud.csv"');
      res.setHeader('Cache-Control', 'no-store');
      return res.end(aCSV(casos));
    }
    return json(res, 200, { casos });
  } catch (e) {
    console.error('Error en api/admin:', e && e.message);
    return json(res, 500, { error: 'Error al consultar la base de datos.' });
  }
};
module.exports.aCSV = aCSV;
