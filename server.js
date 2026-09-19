'use strict';
// Servidor local para probar: node server.js  ->  http://localhost:3000
const http = require('http');
const fs = require('fs');
const path = require('path');

try { // cargador mínimo de .env
  for (const linea of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !linea.trim().startsWith('#') && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
} catch (e) { /* sin .env */ }

const handler = require('./api/analizar.js');
const PUERTO = process.env.PORT || 3000;

http.createServer((req, res) => {
  const ruta = req.url.split('?')[0];
  if (ruta === '/api/analizar') return handler(req, res);
  if (ruta === '/' || ruta === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return fs.createReadStream(path.join(__dirname, 'index.html')).pipe(res);
  }
  res.writeHead(404); res.end('No encontrado');
}).listen(PUERTO, () => {
  console.log('Ruta Salud en http://localhost:' + PUERTO + (process.env.ANTHROPIC_API_KEY ? '  (IA activa)' : '  (sin ANTHROPIC_API_KEY: modo manual)'));
});
