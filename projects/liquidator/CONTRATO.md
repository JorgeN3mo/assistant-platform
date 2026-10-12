# Contrato de Liquidator (v0.4)

## Acceso y ejecución

Solo chat privado de Telegram, cuenta `liki`, con remitente autorizado en ambas
allowlists. Los perfiles privados y `usuarios.sh aplicar` siguen siendo la fuente
administrativa. Los desconocidos y grupos no entran al modelo ni al almacenamiento.
Solicitudes de acceso y avisos al administrador permanecen aplazados.

`openclaw-plugin/funciones.json` define empresas, campos, métodos, funciones,
comandos, ayudas y límites. El código valida cada acción; el modelo no autoriza
operaciones. Cambiar este fichero requiere desplegarlo de nuevo.

Fotos y comandos reconocidos entran a flujos cerrados. Las preguntas o comandos
desconocidos de usuarios autorizados consultan Luna con razonamiento bajo, sin
herramientas ni fotos/fichas reales. Luna redacta una explicación propia a partir
del manual; puede combinar pasos, adaptar ejemplos o pedir aclaración. El alcance
es el uso de Liquidator, excluyendo asesoramiento fiscal/bancario general y otros
temas. Una respuesta temática incorrecta sigue siendo posible: el prompt no es
una garantía semántica. La ayuda nunca interpreta su salida como una acción.

La salida exige JSON con `dentro_alcance`, IDs del manual habilitado y `respuesta`.
El código rechaza estructuras inválidas, comandos inexistentes/deshabilitados,
enlaces, HTML y textos de más de 1600 caracteres. No se reintenta ante errores.
El rechazo de alcance es fijo; las respuestas válidas son redactadas por el modelo.

Contexto: últimos tres intercambios de ayuda del mismo usuario, de menos de 15
minutos. Se conserva entre reinicios en SQLite y se purga al arrancar, cada minuto
y al consultar; nunca se reutiliza un intercambio caducado. `/ayuda` y `/start`
olvidan ese contexto. No se incluyen consultas rechazadas ni respuestas fallidas.
El historial y la pregunta se tratan como datos no confiables; solo el catálogo
vigente es fuente de reglas. El contexto montado tiene un máximo de 16000 caracteres
(excluye el envoltorio interno que añade OpenClaw). Se descartan intercambios antiguos
si no caben. Se admite una ayuda simultánea por usuario y dos por proceso.

Límites persistentes: 20 consultas/día UTC por usuario, 4/minuto, máximo global de
200 llamadas de ayuda/día UTC, pregunta de 600 caracteres y 25 segundos por llamada.
El cupo se reserva en una transacción antes de la inferencia, incluyendo llamadas
en curso y fallidas. No se devuelve cupo ante errores o resultados desconocidos.
Al agotarse la ayuda, los comandos y botones continúan disponibles. El cupo global
limita llamadas, no equivale a un techo de facturación en euros.

Se solicitan hasta 512 tokens de salida (`streamParams.maxTokens`), razonamiento
`low`, `fastMode: false`, modelo exacto `openai/gpt-6-luna` y ninguna alternativa.
Se exige que los metadatos del resultado confirmen ese proveedor/modelo. Si falta
esa confirmación o falla el modelo, se muestra ayuda básica sin cambiar de modelo.
Los metadatos detectan desviaciones después de una llamada; la restricción previa
en código y OpenClaw sigue siendo necesaria para impedir rutas alternativas.

`help_calls` registra reserva, resultado, proveedor, modelo y contadores de tokens
(incluyendo razonamiento si está disponible), duración y valores desconocidos como
NULL. No contiene preguntas, respuestas ni credenciales. `help_context` conserva
el historial breve. El caché de respuestas de entregas `help_replies`, ya existente,
es independiente de ese contexto; no se usa como memoria del modelo.
La adición de estas tablas mantiene compatible el esquema 2 para poder volver al
plugin anterior sin deshacer las facturas. La copia privada previa al despliegue
sigue siendo obligatoria.

Antes de sustituir un modelo: revisar retirada/disponibilidad y probar el nuevo
candidato con preguntas de uso, seguimientos e intentos de desviar el tema. Nunca
sustituir automáticamente por otro más caro. Los controles de tokens del proveedor
se deben validar para la vía de autenticación realmente utilizada; un parámetro
best-effort o una respuesta breve no demuestran un límite de consumo garantizado.

## Facturas y cobro

Una factura por archivo: JPG/PNG hasta 10 MiB; PDF se guarda para completar a mano.
Se conserva el original antes de extraer. El fondo puede contener otras hojas;
solo se extrae la factura principal. La lectura ambigua requiere revisión humana.
Luna es el único modelo, sin herramientas ni alternativas; 30 lecturas/día UTC y
usuario, dos simultáneas y 60 segundos por lectura. No se reintenta al reiniciar.

Campos obligatorios: empresa, número completo, fecha de factura, código cliente,
cliente, importe total positivo EUR y base imponible (cero permitido de forma explícita).
La base se extrae de la foto; si falta, se introduce mediante Corregir → Base imponible.
Comisión del 3 % de esa base, redondeada por factura a céntimos. Establecimiento es opcional. Referencia
completa almacenada; últimos cuatro dígitos mostrados, conservando ceros iniciales.
Las tres empresas son distintas: DIBOS (D), REDISSA (R), REDISSA & DIBOS (RD).

| Método | Información adicional obligatoria |
|---|---|
| Efectivo (inicial) | Ninguna |
| Tarjeta | Ninguna |
| Transferencia | Fecha de transferencia |
| Pagaré recibido | Banco y vencimiento |

El impreso de la factura no determina el cobro. El usuario lo declara al aceptar;
recibir un pagaré no significa que se haya hecho efectivo. No se gestionan cobros
parciales ni una fecha general de cobro. Fechas admitidas: AAAA-MM-DD y DD/MM/AAAA.

La ficha editable muestra solo Aceptar, Corregir y Eliminar. El método inicial es
Efectivo; para cambiarlo se pulsa Corregir → Método de pago → método elegido.
Transferencia solicita fecha; Pagaré solicita banco y después vencimiento cuando
falten. Corregir, el selector de método y la entrada de valores tienen Cancelar,
que sale a la ficha sin introducir un nuevo valor ni deshacer cambios ya guardados.
Volver a leer la foto se ofrece dentro de Corregir cuando hay dudas u omisiones.
No hay botón Ver lista en la ficha: las listas se consultan con /d, /r y /rd.

Estados: `guardada` → `extrayendo` → `revision` → `pendiente_liquidar`.
Aceptar exige datos completos y versión vigente; la identidad empresa+número
normalizado impide confirmar duplicados dentro del usuario. Reenviar los mismos
bytes reutiliza la ficha. Las correcciones o cambios de método vuelven a revisión.
La edición se guía por botones y el siguiente mensaje con el valor, con caducidad
de 15 minutos y salida mediante `/cancelar`.

## Liquidaciones

Cada usuario tiene una lista actual por empresa. Las facturas se asignan al
identificar la empresa, aunque todavía estén pendientes de aceptar. `/d`, `/r`,
`/rd` muestran filas paginadas y totales de toda la lista y por método.
`/ver 9072 D` busca primero en la lista actual; varias coincidencias se eligen con
botones. El número completo y el ID interno nunca se sustituyen por el abreviado.

Cerrar requiere todas las facturas aceptadas, previsualización y confirmación,
con control de revisión para no cerrar una lista que haya cambiado. Cada empresa
se cierra por separado. Las fotos siguientes inician una lista nueva.

`/historial` permite abrir y reabrir lotes cerrados. Una lista reabierta conserva
su identidad; las nuevas fotos siguen en la lista nueva. Se puede corregir o borrar,
aceptar de nuevo y volver a cerrar. Cada cierre aumenta la versión del documento.
Cambiar la empresa de una factura la mueve a la lista actual de la empresa elegida.

El CSV se descarga tras cerrar; incluye código cliente, factura abreviada, importe,
método, banco y vencimiento/fecha de transferencia, referencia completa y cliente,
además del total. Se genera en el servidor desde la versión cerrada. Reabrir elimina
el CSV anterior del servidor; las copias descargadas o enviadas siguen existiendo.

Imprimir y `/imprimir ID` generan el parte PDF A4 horizontal con las 13 columnas
de la plantilla, marca y color de cada empresa, nombre completo del usuario,
fecha del cierre en Europe/Madrid, sumas por método y comisión del 3 % sobre la
base imponible. Dtos. vacío. Se repiten encabezados cuando hay varias páginas.
El cierre exige nombre completo configurado y guarda una copia fija de sus filas,
datos de encabezado y totales en `closure_reports`, en la misma transacción.
Cambiar el perfil después no altera ese cierre. Cada versión conserva su copia
histórica; reabrir elimina los PDF/CSV descargables y cerrar de nuevo crea otra
versión. Ver [IMPRESION.md](IMPRESION.md) y [USUARIOS.md](USUARIOS.md).
Registrar la presentación/entrega sigue pendiente. No se presupone un viernes fijo.

## Datos y borrado

SQLite: `/data/liquidator/runtime/liquidator.sqlite3` (esquema 2). Guarda fichas,
liquidaciones, revisiones, ediciones y contadores persistentes. Fechas UTC:
`registered_at`, `confirmed_at`, `created_at` y `closed_at`; agrupación mediante
`liquidacion_id`, sin carpetas semanales como fuente de verdad.

Originales: `/data/liquidator/invoices/<usuario>/<id>/original.*` y recibo privado
`metadata.json`. CSV: `/data/openclaw/state/media/liquidator-exports/<usuario>/`.
Los perfiles siguen en `/data/liquidator/users/<ID>/profile.json`, fuera de Git.

Eliminar requiere confirmación y una liquidación no cerrada. Se eliminan original,
recibo, fichas, registros auxiliares y copias de entrada conocidas que no estén
compartidas con otra factura. Se conserva el contador de consumo sin ID de factura
para no poder eludir límites borrando. Si hay interrupción, el arranque completa
el borrado. No se promete borrado físico forense de SQLite ni retirada de Telegram,
descargas, copias antiguas de entrada o copias de seguridad previas.

El despliegue guarda una copia privada de SQLite y configuración antes de migrar.
La migración conserva las fichas existentes; las antiguas descartadas siguen
archivadas. Las copias periódicas y la política de retención siguen pendientes.

## Registro de conversaciones para revisión posterior

Registro pasivo habilitado en `funciones.json` → `registro_conversaciones`.
Archivos UTF-8 JSONL diarios en
`/data/liquidator/runtime/conversations/AAAA-MM-DD.jsonl`, fuera de Git.
Cada línea conserva fecha UTC, usuario (ID de Telegram privado, no anónimo), ID
estable de interacción, pregunta, respuesta preparada, resultado y proveedor/modelo
cuando están disponibles. `entrega: no_verificada` evita confundir una respuesta
preparada con una entrega confirmada por Telegram. El ID permite deduplicar entradas
al analizarlas; no se repite el registro al reutilizar una entrega de ayuda ya resuelta.

Se registran únicamente preguntas de ayuda y sus respuestas (también errores,
rechazos de alcance o límites), saludos/agradecimientos y menú de ayuda. No se
copian adjuntos, extracción, fichas, listas, CSV, botones operativos ni valores
introducidos durante la edición de facturas. Si el usuario escribe datos personales
o de una factura dentro de su pregunta, ese texto sí forma parte de la conversación;
no se afirma una anonimización automática. No hay encuestas ni valoración inferida.

Retención: últimas 90 fechas naturales UTC, incluyendo hoy. Se eliminan archivos
anteriores al arrancar y cada hora mientras el servicio está activo; si estuvo
parado, se limpian al siguiente arranque. Solo se borran archivos regulares con
nombre de fecha válido y extensión `.jsonl` dentro de esta carpeta.

Carpeta 700 y archivos 600. Máximo 5 MiB por archivo diario y 100 escrituras en cola;
preguntas de hasta 600 caracteres y respuestas de hasta 2200, con `recortado` cuando
se supera ese tamaño. Si se alcanza el límite o falla el disco, se omite el registro
y se deja un aviso técnico limitado en frecuencia. La respuesta del bot no espera
al archivo, no llama a un modelo adicional y no depende de que el registro funcione.
Un cierre brusco puede perder las últimas escrituras pendientes; no es un registro
transaccional de facturas. No se retrocargan conversaciones antiguas.

Este archivo es solo para estudio futuro. No se lee como memoria ni contexto de
Luna y no cambia la ventana de conversación de 15 minutos. Su retención es
independiente de los registros operativos y del caché de entregas de SQLite. No se
crean copias adicionales del archivo ni se programa análisis automático.
# Solicitudes de acceso

El enlace `https://t.me/liki_liquidator_bot?start=solicitar` lleva al botón Iniciar.
OpenClaw usa `pairing` como barrera previa: un desconocido puede solicitar acceso,
pero no alcanza el flujo de facturas ni un modelo. Su acuse técnico nativo se
complementa con un mensaje fijo en español. No se modifican archivos del proveedor.
El evento `channel_pairing_requested` de Telegram/cuenta `liki` registra únicamente
ID, nombre público, alias y fecha en JSON privados de runtime. No guarda el mensaje,
fotos ni el código de emparejamiento. Las solicitudes no caducan junto al código nativo.

El administrador activo recibe un aviso por solicitud, con límite global de 20
intentos de aviso al día y un máximo de 1000 solicitudes almacenadas. Los fallos de
envío no pierden solicitudes: se consultan con `usuarios.sh solicitudes`. Un perfil
ya existente no vuelve a notificarse ni se sobrescribe. El administrador importa
la solicitud como perfil pendiente, completa sus datos, activa y ejecuta `aplicar`.
Únicamente la presencia en ambas listas explícitas concede acceso a Liquidator;
aprobar un código nativo nunca sustituye este requisito. Los grupos siguen cerrados.
