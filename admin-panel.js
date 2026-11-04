'use strict';
/* Panel de administración. Todo el contenido de los casos se inserta con textContent
   (nunca innerHTML) para que un relato malicioso no pueda ejecutar código. */
(function () {
  var clave = '';          // solo en memoria: se pierde al cerrar o recargar la pestaña
  var casos = [], sel = null;
  var $ = function (id) { return document.getElementById(id); };
  var BARRERA = { cita: 'Cita médica', medicamento: 'Medicamento', autorizacion: 'Autorización', programacion: 'Servicio sin fecha', calidad: 'Trato o información', otro: 'Otro' };
  var RUTA = { eps: 'Reclamo a la EPS', super: 'Queja a Supersalud', tutela: 'Tutela' };
  var URG = { si: 'Sí', duda: 'Duda', no: 'No' };
  var TIEMPO = { sem: 'Menos de 1 semana', mes: 'Menos de 1 mes', mas: 'Más de 1 mes' };
  var PREVIA = { no: 'Ninguno', sinrespuesta: 'Sin respuesta', negativa: 'Respuesta negativa' };
  var ESP = { menor_edad: 'Menor de edad', adulto_mayor: 'Adulto mayor', discapacidad: 'Discapacidad', embarazo: 'Embarazo', enfermedad_grave: 'Enfermedad grave', ninguna: 'Ninguna' };

  function el(tag, props, kids) {
    var n = document.createElement(tag);
    if (props) Object.keys(props).forEach(function (k) { if (k === 'text') n.textContent = props[k]; else if (k === 'class') n.className = props[k]; else n.setAttribute(k, props[k]); });
    (kids || []).forEach(function (c) { n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function fecha(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }); }
  function etiqueta(v, mapa) { return mapa[v] || v || '—'; }

  async function api(metodo, query) {
    var r = await fetch('/api/admin' + (query || ''), { method: metodo, headers: { Authorization: 'Bearer ' + clave }, cache: 'no-store' });
    if (r.status === 401) { var e = new Error('Clave incorrecta.'); e.codigo = 401; throw e; }
    if (!r.ok) { var j = await r.json().catch(function () { return {}; }); var er = new Error(j.error || 'Error ' + r.status); er.codigo = r.status; throw er; }
    return r;
  }

  async function cargar() {
    var r = await api('GET');
    casos = (await r.json()).casos || [];
    $('login').hidden = true; $('panel').hidden = false; $('acciones').hidden = false;
    pintar();
  }

  function filtrados() {
    var q = $('q').value.trim().toLowerCase(), b = $('f-barrera').value, u = $('f-urg').value, ru = $('f-ruta').value;
    return casos.filter(function (c) {
      if (b && c.respuestas.barrera !== b) return false;
      if (u && c.respuestas.urgencia !== u) return false;
      if (ru && c.ruta.principal !== ru) return false;
      if (q) { var t = [c.relato_original, c.relato_corregido, c.datos.entidad, c.datos.servicio, c.id].join(' ').toLowerCase(); if (t.indexOf(q) < 0) return false; }
      return true;
    });
  }

  function kpis() {
    var k = $('kpis'); k.textContent = '';
    var cuenta = function (f) { return casos.filter(f).length; };
    [['Casos', casos.length], ['Con urgencia', cuenta(function (c) { return c.respuestas.urgencia === 'si'; })],
     ['Recomienda tutela', cuenta(function (c) { return c.ruta.principal === 'tutela'; })],
     ['Recomienda queja', cuenta(function (c) { return c.ruta.principal === 'super'; })],
     ['Recomienda reclamo EPS', cuenta(function (c) { return c.ruta.principal === 'eps'; })],
     ['Usaron IA', cuenta(function (c) { return c.usa_ia; })]].forEach(function (x) {
      k.appendChild(el('div', { class: 'kpi' }, [el('b', { text: String(x[1]) }), el('span', { text: x[0] })]));
    });
    var s = $('f-barrera'), actual = s.value; s.textContent = '';
    s.appendChild(el('option', { value: '', text: 'Todas las barreras' }));
    Object.keys(BARRERA).forEach(function (k2) { var n = cuenta(function (c) { return c.respuestas.barrera === k2; }); s.appendChild(el('option', { value: k2, text: BARRERA[k2] + ' (' + n + ')' })); });
    s.value = actual;
  }

  function pintar() {
    kpis();
    var lista = filtrados(), w = $('tabla-wrap'); w.textContent = '';
    $('conteo').textContent = lista.length + ' de ' + casos.length + ' casos. Se muestran los 1000 más recientes.';
    if (!lista.length) { w.appendChild(el('div', { class: 'vacio', text: casos.length ? 'Ningún caso coincide con los filtros.' : 'Todavía no hay casos guardados.' })); return; }
    var t = el('table'), h = el('tr');
    ['Fecha', 'Barrera', 'Urgencia', 'Ruta', 'Entidad', 'IA'].forEach(function (x) { h.appendChild(el('th', { text: x })); });
    t.appendChild(el('thead', null, [h]));
    var tb = el('tbody');
    lista.forEach(function (c) {
      var u = c.respuestas.urgencia;
      var tr = el('tr', { class: 'fila' + (sel === c.id ? ' sel' : ''), tabindex: '0', 'data-id': c.id }, [
        el('td', { text: fecha(c.creado) }),
        el('td', { text: etiqueta(c.respuestas.barrera, BARRERA) }),
        el('td', null, [el('span', { class: 'tag' + (u === 'si' ? ' urg' : u === 'duda' ? ' duda' : ''), text: etiqueta(u, URG) })]),
        el('td', { text: etiqueta(c.ruta.principal, RUTA) }),
        el('td', { text: c.datos.entidad || '—' }),
        el('td', { text: c.usa_ia ? 'Sí' : 'No' })
      ]);
      var abrir = function () { sel = c.id; pintar(); detalle(c); };
      tr.addEventListener('click', abrir);
      tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } });
      tb.appendChild(tr);
    });
    t.appendChild(tb); w.appendChild(t);
  }

  function fila(dl, k, v) { dl.appendChild(el('dt', { text: k })); dl.appendChild(el('dd', { text: v == null || v === '' ? '—' : v })); }

  function detalle(c) {
    var d = $('detalle'); d.textContent = '';
    d.appendChild(el('h2', { text: c.id }));
    var dl = el('dl');
    fila(dl, 'Creado', fecha(c.creado)); fila(dl, 'Actualizado', fecha(c.actualizado));
    fila(dl, 'Ruta sugerida', etiqueta(c.ruta.principal, RUTA)); fila(dl, 'Titular de la ruta', c.ruta.titular);
    fila(dl, 'Barrera', etiqueta(c.respuestas.barrera, BARRERA)); fila(dl, 'Urgencia', etiqueta(c.respuestas.urgencia, URG));
    fila(dl, 'Tiempo', etiqueta(c.respuestas.tiempo, TIEMPO)); fila(dl, 'Reclamo previo', etiqueta(c.respuestas.previa, PREVIA));
    fila(dl, 'Orden médica', c.respuestas.orden); fila(dl, 'Afectación', c.respuestas.afectacion); fila(dl, 'Quién reclama', c.respuestas.quien);
    fila(dl, 'Especial protección', (c.respuestas.especial || []).map(function (x) { return ESP[x] || x; }).join(', '));
    fila(dl, 'Entidad', c.datos.entidad); fila(dl, 'Servicio', c.datos.servicio); fila(dl, 'Desde', c.datos.desde);
    fila(dl, 'Usó IA', c.usa_ia ? 'Sí' : 'No');
    fila(dl, 'Autorización', c.consentimiento ? c.consentimiento.version + ' · ' + fecha(c.consentimiento.fecha) + (c.consentimiento.ia ? ' · incluye IA' : '') : '—');
    d.appendChild(dl);
    if (c.resumen_ia) { d.appendChild(el('h3', { text: 'Resumen de la IA' })); d.appendChild(el('div', { class: 'txt', text: c.resumen_ia })); }
    d.appendChild(el('h3', { text: 'Relato corregido' })); d.appendChild(el('div', { class: 'txt', text: c.relato_corregido || '—' }));
    d.appendChild(el('h3', { text: 'Relato original' })); d.appendChild(el('div', { class: 'txt', text: c.relato_original || '—' }));
    if (c.archivos && c.archivos.length) {
      d.appendChild(el('h3', { text: 'Documentos que adjuntó (el archivo no se guarda)' }));
      var ul = el('ul'); c.archivos.forEach(function (f) { ul.appendChild(el('li', { text: (f.tipo || 'documento') + (f.resumen ? ': ' + f.resumen : '') })); });
      d.appendChild(ul);
    }
    var b = el('button', { class: 'btn rojo', type: 'button', text: 'Eliminar este caso' });
    b.addEventListener('click', async function () {
      if (!confirm('¿Eliminar el caso ' + c.id + '? No se puede deshacer.')) return;
      try { await api('DELETE', '?id=' + encodeURIComponent(c.id)); casos = casos.filter(function (x) { return x.id !== c.id; }); sel = null; pintar(); $('detalle').textContent = ''; $('detalle').appendChild(el('div', { class: 'vacio', text: 'Caso eliminado.' })); }
      catch (e) { alert(e.message); }
    });
    d.appendChild(el('p', { style: 'margin-top:16px' }, [b]));
  }

  $('f-login').addEventListener('submit', async function (e) {
    e.preventDefault(); $('err').textContent = '';
    clave = $('clave').value; $('b-entrar').disabled = true;
    try { await cargar(); }
    catch (er) { clave = ''; $('err').textContent = er.message || 'No se pudo entrar.'; }
    finally { $('b-entrar').disabled = false; $('clave').value = ''; }
  });
  ['q', 'f-barrera', 'f-urg', 'f-ruta'].forEach(function (id) { $(id).addEventListener('input', pintar); });
  $('b-actualizar').addEventListener('click', function () { cargar().catch(function (e) { alert(e.message); }); });
  $('b-salir').addEventListener('click', function () { clave = ''; casos = []; sel = null; $('panel').hidden = true; $('acciones').hidden = true; $('login').hidden = false; $('detalle').textContent = ''; });
  $('b-csv').addEventListener('click', async function () {
    try {
      var r = await api('GET', '?accion=exportar'), blob = await r.blob(), url = URL.createObjectURL(blob);
      var a = document.createElement('a'); a.href = url; a.download = 'casos-ruta-salud-' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    } catch (e) { alert(e.message); }
  });
})();
