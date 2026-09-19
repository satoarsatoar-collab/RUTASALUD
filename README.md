# Ruta Salud con IA

Orientador para personas que enfrentan una barrera de acceso a la salud en Colombia. La persona cuenta su caso (escribiendo o hablando), adjunta fotos o PDF de sus documentos y la herramienta:

1. corrige y ordena el relato sin inventar hechos,
2. lee los documentos y extrae datos,
3. hace preguntas para afinar el caso (urgencia, tiempo, reclamos previos, orden médica, afectación, especial protección, quién reclama),
4. recomienda el mecanismo (reclamo a la EPS, queja a la Supersalud o tutela) y
5. genera un borrador de cada escrito con datos personales entre corchetes.

**Quién decide qué:** la IA solo extrae y ordena (`api/analizar.js`). El mecanismo lo deciden reglas fijas que tú controlas (`calcularRuta` en `index.html`), y los escritos salen de plantillas fijas. La IA no redacta derecho.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | Toda la interfaz. Sin dependencias. Configuración al inicio (`CONFIG`), normas (`NORMAS`), preguntas y reglas. |
| `api/analizar.js` | Función de servidor que llama a Claude. Aquí vive la clave de la API. |
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

## Antes de mostrarlo a usuarios reales

- **Datos personales.** En modo IA, el relato y los archivos salen del navegador hacia tu servidor y de ahí al proveedor de IA. Son datos de salud (sensibles). Necesitas una política de tratamiento de datos y autorización expresa (Ley 1581 de 2012 y normas que la reglamentan; verifica lo aplicable). Pon el enlace en `CONFIG.politicaUrl`. Revisa los términos de retención de datos del proveedor de IA.
- **Normas.** Verifica cada una contra la fuente oficial. Las marcadas con `verificar:true` muestran un aviso a los usuarios; quítalo solo cuando las hayas confirmado. Anota la fecha en `CONFIG.revisionNormas`.
- **Tutela.** El borrador es un punto de partida. Haz que un consultorio jurídico o un profesor lo revise antes de ofrecerlo, y ponlo como aliado en `CONFIG.aliado`.
- **Reglas de la ruta.** Las reglas para sujetos de especial protección y afectación grave son heurísticas. Valídalas con un abogado.
- **Costos y abuso.** Cada análisis consume créditos de la API. El límite por IP es de mejor esfuerzo. Define un tope de gasto en el panel del proveedor.
