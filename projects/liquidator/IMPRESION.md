# Parte de cobros PDF — v0.4

La base de comisión es la **base imponible de la factura**, confirmada por Jorge.
Se extrae de la foto (Base I.V.A. / Base imponible) y se muestra para revisión.
No se deduce del importe usando un IVA supuesto. Si no se lee con claridad, queda
pendiente de corrección manual. El nombre completo procede del JSON de cada usuario.

## Funcionamiento

Tras confirmar el cierre aparece Imprimir. También se puede abrir desde el historial
o mediante /imprimir seguido del número de liquidación. El botón pasa por el
dispatcher de documentos de Telegram para entregar el PDF, no por el LLM.

PDF A4 horizontal: empresa y código, rojo R, azul D, verde RD; PARTE DE COBROS;
nombre completo y fecha del cierre en Europe/Madrid. Tabla con código, cliente,
últimos cuatro dígitos del documento, importe, efectivo, pagaré, transferencia,
tarjeta, Dtos., banco, vencimiento/fecha de transferencia, base y comisión.
Dtos. vacío. Una fila por factura; no se admiten negativos ni cobros sin factura.
Encabezados repetidos en varias páginas, totales generales al final, número de
liquidación y versión en el pie. Se mantiene Descargar CSV como opción separada.

La comisión es el 3 % de la base revisada. Se calcula en céntimos, redondeando
por fila al céntimo más próximo (mitades hacia arriba); se suman los resultados
de las filas. La base puede ser cero de forma explícita. Sin base no se acepta
la ficha ni se cierra. Corregir → Base imponible permite introducirla/cambiarla.

## Datos fijos y reapertura

El cierre guarda en SQLite una copia de los datos de cada fila, nombre completo,
marca, fecha, porcentaje, comisiones y totales, en la tabla closure_reports.
La copia y el cierre se escriben en la misma transacción. Un fallo al generar
el PDF no pierde el cierre; se puede volver a imprimir.

Cada versión conserva su copia histórica de cierre. Al reabrir se eliminan los
PDF/CSV descargables del servidor; no pueden retirarse archivos ya descargados.
Cerrar de nuevo crea una nueva versión. El borrado de una factura de la lista
activa no reescribe los datos históricos que ya formaban parte de un cierre.
Los cierres antiguos sin copia deben reabrirse, revisar bases y volver a cerrarse;
no se rellenan retrospectivamente bases o nombres supuestos.

Los PDF tienen permisos 600 y se guardan bajo
/data/openclaw/state/media/liquidator-exports/<usuario>/<empresa>-<id>-v<versión>.pdf.
Máximo dos generaciones simultáneas, 2000 filas, 20 segundos y 10 MiB de salida.
La generación vuelve a comprobar la revisión antes de guardar: una reapertura
durante la generación impide entregar un parte que ya no está vigente.

## Nombre y dependencias

El dato procede de datos_informes.nombre_completo del perfil privado, un archivo
`/data/liquidator/users/<telegram_id>/profile.json` por usuario. Ver [USUARIOS.md](USUARIOS.md).
El comando
administrativo `sudo scripts/usuarios.sh nombre-informe ID --nombre 'Nombre Apellidos'`
lo actualiza y publica una proyección mínima en /data/liquidator/report-users.json.
`sudo scripts/usuarios.sh informes` sincroniza nombres sin cambiar acceso. Aplicar
usuarios y desplegar también sincronizan. Solo se publican nombres completos de
perfiles activos, nunca identificación fiscal ni otros datos del perfil.
El archivo pertenece a root:openclaw con permisos 640; no concede acceso al bot.
Si falta el nombre se explica el problema y no se confirma un cierre incompleto.

El servidor necesita `python3-reportlab`; el script de despliegue lo comprueba
antes de detener el servicio. En MiniGUN se ha instalado ReportLab 4.3.1. El renderer
recibe JSON por stdin y devuelve PDF por stdout, sin intérprete de shell, red ni IA.

## Validación

51 pruebas Node y 12 Python pasan. Incluyen permisos, nombres, datos fijos,
redondeo, cero explícito, falta de datos, aislamiento, reapertura durante una
generación, caché, versiones, fallos del renderer y el callback Imprimir.
Renderizados y revisados visualmente los tres colores y un documento de 80 filas
en cinco páginas. Se comprobó fecha de España para un cierre cerca de medianoche.
Desplegado y validado con el plugin real en MiniGUN: lectura de las dos fotos,
bases 117,02 € y 44,50 €, comisiones 3,51 € y 1,34 €, cierre, PDF privado,
reimpresión idéntica, nombre fijo por versión, reapertura y nueva versión.
Sin envíos a Telegram ni cambios de facturas reales. Queda probar la recepción
y la impresión del PDF desde el iPhone. Antes de cerrar, cada usuario necesita
su nombre completo en el perfil; no se han rellenado nombres supuestos.
