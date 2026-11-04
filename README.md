# Ruta Salud con IA

Orientador para personas que enfrentan una barrera de acceso a la salud en Colombia. La persona cuenta su caso (escribiendo o hablando), adjunta fotos o PDF de sus documentos y la herramienta:

1. corrige y ordena el relato sin inventar hechos,
2. lee los documentos y extrae datos,
3. hace preguntas para afinar el caso (urgencia, tiempo, reclamos previos, orden médica, afectación, especial protección, quién reclama),
4. recomienda el mecanismo (reclamo a la EPS, queja a la Supersalud o tutela) y
5. genera un borrador de cada escrito con datos personales entre corchetes. La tutela sigue la estructura de un formato estándar (referencia, hechos, procedencia, concepto de violación, pretensión, pruebas, juramento y notificaciones) y se muestra como documento; se puede descargar para Word o guardar como PDF.

**Quién decide qué:** la IA solo extrae y ordena (`api/analizar.js`). El mecanismo lo deciden reglas fijas que tú controlas (`calcularRuta` en `index.html`), y los escritos salen de plantillas fijas. La IA no redacta derecho.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | Toda la interfaz. Sin dependencias. Las tipografías (Public Sans y Newsreader, licencia SIL OFL) van incrustadas, así que no se contacta a ningún tercero al cargar la página. Configuración al inicio (`CONFIG`), normas (`NORMAS`), preguntas y reglas. |
| `api/analizar.js` | Función de servidor que llama a Claude. Aquí vive la clave de la API. No guarda nada. |
| `api/caso.js` | Guarda el caso (solo con autorización) y deja que la persona lo borre con su código y clave. |
| `api/admin.js`, `admin.html`, `admin-panel.js` | Panel del equipo en `/admin`: lista, filtros, detalle, borrado y exportación CSV. Protegido por usuario y contraseña (`ADMIN_USER`, `ADMIN_PASS`). |
| `api/_util.js` | Utilidades y acceso a la base de datos (Redis REST). |
| `server.js` | Servidor local para probar. |
| `test/mock.test.js` | Prueba del backend con una IA simulada (`npm test`). |
| `vercel.json`, `package.json`, `.env.example` | Configuración. |

## Probar en tu computador

1. Instala Node.js 18 o superior.
2. Copia `.env.example` como `.env` y pon tu `ANTHROPIC_API_KEY` (se crea en console.anthropic.com).
3. Ejecuta `node server.js` y abre http://localhost:3000.

Sin clave, la página funciona en modo manual (sin IA).

## Publicar con tu dominio (Vercel, gratis para empezar)

1. Sube esta carpeta a un repositorio de GitHub, o instala la CLI con `npm i -g vercel` y ejecuta `vercel` dentro de la carpeta.
2. En el panel de Vercel, en Settings > Environment Variables, agrega `ANTHROPIC_API_KEY` (y, si quieres, `CLAUDE_MODEL`, `RATE_LIMIT`).
3. En Settings > Domains agrega tu dominio y crea en tu proveedor el registro DNS que Vercel te indique.
4. Vuelve a desplegar para que tome las variables.

Vercel limita el cuerpo de las solicitudes a 4,5 MB. Por eso la página reduce las fotos y limita los PDF a 2,5 MB.

## Autorización, casos guardados y panel de administración

- Antes de usar la herramienta, la persona ve una pantalla de autorización con la base normativa (Constitución art. 15; Ley 1581 de 2012; Decreto 1074 de 2015, que compila el Decreto 1377 de 2013). **Si no acepta, no puede usarla.** El envío a la IA tiene una casilla aparte y opcional.
- Al terminar la ruta se guarda el caso (relato, respuestas, ruta sugerida y resumen de los documentos). **No se guardan los archivos ni la IP.** El caso se borra solo a los `CASE_TTL_DAYS` días (365 por defecto) y la persona recibe un código y una clave para borrarlo cuando quiera.
- Para activar el guardado y el panel en Vercel:
  1. Storage > Marketplace > **Upstash for Redis** (plan gratis) y conéctalo al proyecto. Eso crea `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` (o `KV_REST_API_URL` y `KV_REST_API_TOKEN`; ambos funcionan).
  2. Settings > Environment Variables: agrega `ADMIN_USER` y `ADMIN_PASS` (mínimo 10 caracteres). Usa una contraseña larga y única: protege datos de salud.
  3. Vuelve a desplegar (Deployments > Redeploy).
  4. Entra a `tu-dominio/admin`.
- Sin base de datos configurada no se guarda nada y la pantalla de autorización lo dice. Sin `ADMIN_USER` y `ADMIN_PASS` el panel queda desactivado.
- Si cambias el texto legal, sube la versión en `CONFIG.versionConsentimiento` (index.html) y en `CONSENT_VERSION` (servidor): así cada caso queda ligado al texto que la persona aceptó.
- `CONFIG.responsable` (index.html) tiene el nombre, correo y domicilio del responsable; agrega `telefono` si quieres mostrarlo.
- La política completa está en `cuerpoPolitica()` (index.html). La persona debe desplazarse hasta el final del recuadro para poder marcar las casillas de autorización.

## Antes de mostrarlo a usuarios reales

- **Datos personales.** Los relatos son datos de salud (sensibles). Que un abogado o profesor revise la autorización, la política y las citas legales (están marcadas "Confirmar en fuente oficial" las que faltan por verificar). Evalúa con él si debes inscribir la base de datos en el Registro Nacional de Bases de Datos de la SIC y qué política de retención aplica a tu investigación. Revisa los términos de retención de datos del proveedor de IA.
- **Normas.** Verifica cada una contra la fuente oficial. Las marcadas con `verificar:true` muestran un aviso a los usuarios; quítalo solo cuando las hayas confirmado. Anota la fecha en `CONFIG.revisionNormas`.
- **Tutela.** El borrador es un punto de partida. Haz que un consultorio jurídico o un profesor lo revise antes de ofrecerlo, y ponlo como aliado en `CONFIG.aliado`.
- **Reglas de la ruta.** Las reglas para sujetos de especial protección y afectación grave son heurísticas. Valídalas con un abogado.
- **Costos y abuso.** Cada análisis consume créditos de la API. El límite por IP es de mejor esfuerzo. Define un tope de gasto en el panel del proveedor.
