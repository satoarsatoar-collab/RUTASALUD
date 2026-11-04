'use strict';
// Servidor local para probar: node server.js  ->  http://localhost:3000
//  - Ruta Salud:  http://localhost:3000
//  - Panel admin: http://localhost:3000/admin   (clave: la de ADMIN_KEY en .env)
// Sin variables de Redis, los casos se guardan en memoria y se pierden al cerrar.
const http = require('http');
const fs = require('fs');
const path = require('path');

try { // cargador mínimo de .env
  for (const linea of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !linea.trim().startsWith('#') && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
} catch (e) { /* sin .env */ }

const rutas = {
  '/api/analizar': require('./api/analizar.js'),
  '/api/caso': require('./api/caso.js'),
  '/api/admin': require('./api/admin.js')
};
const estaticos = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/admin': ['admin.html', 'text/html; charset=utf-8'],
  '/admin.html': ['admin.html', 'text/html; charset=utf-8'],
  '/admin-panel.js': ['admin-panel.js', 'text/javascript; charset=utf-8']
};
const PUERTO = process.env.PORT || 3000;

http.createServer((req, res) => {
  const ruta = req.url.split('?')[0];
  if (rutas[ruta]) return rutas[ruta](req, res);
  if (estaticos[ruta]) {
    res.writeHead(200, { 'Content-Type': estaticos[ruta][1], 'Cache-Control': 'no-store' });
    return fs.createReadStream(path.join(__dirname, estaticos[ruta][0])).pipe(res);
  }
  res.writeHead(404); res.end('No encontrado');
}).listen(PUERTO, () => {
  console.log('Ruta Salud en http://localhost:' + PUERTO + (process.env.ANTHROPIC_API_KEY ? '  (IA activa)' : '  (sin ANTHROPIC_API_KEY: modo manual)'));
  console.log('Panel admin: ' + ((process.env.ADMIN_KEY || '').length >= 16 ? 'activo en /admin' : 'desactivado (defina ADMIN_KEY de 16+ caracteres)'));
});
