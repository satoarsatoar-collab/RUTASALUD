'use strict';
/**
 * Utilidades compartidas por api/caso.js y api/admin.js.
 * El archivo empieza por "_" para que Vercel no lo publique como función.
 *
 * Almacenamiento: Redis por REST (Upstash / Vercel Marketplace). Variables:
 *   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN   (o)
 *   KV_REST_API_URL + KV_REST_API_TOKEN
 * Sin esas variables, en producción NO se guarda nada (activo = false).
 * Solo en desarrollo local (sin VERCEL) se usa una memoria temporal.
 */
const crypto = require('crypto');

const DIAS = Math.max(1, Math.min(3650, parseInt(process.env.CASE_TTL_DAYS || '365', 10) || 365));
const URL_DB = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
const TOKEN_DB = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';

function json(res, codigo, obj) {
  res.statusCode = codigo;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(obj));
}

function ipDe(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || (req.socket && req.socket.remoteAddress) || 'desconocida';
}

function leerCuerpo(req, max) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    if (typeof req.body === 'string') { try { return resolve(JSON.parse(req.body)); } catch (e) { return reject(new Error('json')); } }
    let tam = 0; const partes = [];
    req.on('data', c => { tam += c.length; if (tam > max) { reject(new Error('grande')); req.destroy(); } else partes.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(partes).toString('utf8') || '{}')); } catch (e) { reject(new Error('json')); } });
    req.on('error', () => reject(new Error('lectura')));
  });
}

/* Limitador de mejor esfuerzo (en serverless no se comparte entre instancias). */
function crearLimitador(max, ventanaMs) {
  const golpes = new Map();
  return function limitado(clave) {
    const ahora = Date.now();
    const lista = (golpes.get(clave) || []).filter(t => ahora - t < ventanaMs);
    if (lista.length >= max) { golpes.set(clave, lista); return true; }
    lista.push(ahora); golpes.set(clave, lista);
    if (golpes.size > 5000) golpes.clear();
    return false;
  };
}

const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
function igualesSeguro(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

/* ---------- almacenamiento ---------- */
function crearRedis() {
  async function cmd(...args) {
    const r = await fetch(URL_DB, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + TOKEN_DB, 'Content-Type': 'application/json' },
      body: JSON.stringify(args.map(String)),
      signal: AbortSignal.timeout(8000)
    });
    if (!r.ok) throw new Error('db ' + r.status);
    const j = await r.json();
    if (j.error) throw new Error('db error');
    return j.result;
  }
  async function pipeline(lista) {
    const r = await fetch(URL_DB.replace(/\/$/, '') + '/pipeline', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + TOKEN_DB, 'Content-Type': 'application/json' },
      body: JSON.stringify(lista.map(c => c.map(String))),
      signal: AbortSignal.timeout(10000)
    });
    if (!r.ok) throw new Error('db ' + r.status);
    return (await r.json()).map(x => x.result);
  }
  return {
    tipo: 'redis',
    async guardar(id, obj, ts) {
      await pipeline([['SET', 'caso:' + id, JSON.stringify(obj), 'EX', DIAS * 86400], ['ZADD', 'casos', ts, id]]);
    },
    async leer(id) { const v = await cmd('GET', 'caso:' + id); return v ? JSON.parse(v) : null; },
    async borrar(id) { await pipeline([['DEL', 'caso:' + id], ['ZREM', 'casos', id]]); },
    async listar(n) {
      const ids = await cmd('ZREVRANGE', 'casos', 0, n - 1);
      if (!ids || !ids.length) return [];
      const vals = await pipeline(ids.map(i => ['GET', 'caso:' + i]));
      const caducados = [], out = [];
      vals.forEach((v, k) => { if (v) { try { out.push(JSON.parse(v)); } catch (e) { /* ignora */ } } else caducados.push(ids[k]); });
      if (caducados.length) await pipeline(caducados.map(i => ['ZREM', 'casos', i])).catch(() => {});
      return out;
    }
  };
}

function crearMemoria() {
  const datos = new Map(); // id -> { obj, ts, vence }
  return {
    tipo: 'memoria',
    async guardar(id, obj, ts) { datos.set(id, { obj: JSON.parse(JSON.stringify(obj)), ts, vence: Date.now() + DIAS * 864e5 }); },
    async leer(id) { const d = datos.get(id); return d && d.vence > Date.now() ? JSON.parse(JSON.stringify(d.obj)) : null; },
    async borrar(id) { datos.delete(id); },
    async listar(n) {
      return [...datos.values()].filter(d => d.vence > Date.now()).sort((a, b) => b.ts - a.ts).slice(0, n).map(d => JSON.parse(JSON.stringify(d.obj)));
    }
  };
}

let _db;
function db() {
  if (_db !== undefined) return _db;
  if (URL_DB && TOKEN_DB) _db = crearRedis();
  else if (!process.env.VERCEL && process.env.NODE_ENV !== 'production') _db = crearMemoria();
  else _db = null;
  return _db;
}
function reiniciarDb() { _db = undefined; } // solo para pruebas

module.exports = { json, ipDe, leerCuerpo, crearLimitador, sha, igualesSeguro, db, reiniciarDb, DIAS };
