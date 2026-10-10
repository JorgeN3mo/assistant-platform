# Contrato de recepción y revisión (v0.1)

Solo chat privado Telegram, cuenta `liki`, remitente identificado por el transporte
incluido en las dos listas efectivas de OpenClaw. No se confía en el texto, el nombre
impreso del comercial, archivos de perfiles enviados ni en IDs incluidos en botones.
Los perfiles privados siguen siendo la fuente de verdad y `usuarios.sh aplicar`
publica el acceso efectivo. El plugin comprueba ese acceso en cada operación.

Entradas: foto JPG/PNG o PDF, máximo 10 MiB, una factura por archivo. PDF se conserva
para revisión manual en esta versión; la lectura automática inicial es de imágenes.
El fondo puede tener ruido: se extrae solo la factura principal, y se señalan dudas.
Una imagen ambigua no se confirma automáticamente. Los originales son inmutables.

Salida: referencia opaca y ficha con empresa (DIBOS, REDISSA, REDISSA & DIBOS),
referencia de factura completa, fecha, código y nombre fiscal del cliente,
establecimiento, total EUR y forma de cobro. Efectivo por defecto, cambiable a tarjeta
u transferencia. El usuario declara que está cobrada al confirmar. Sin fecha de cobro
ni cobros parciales. El texto impreso de pago no determina la forma de cobro.

Estados: `guardada` → `extrayendo` → `revision` → `pendiente_liquidar`.
Una extracción fallida vuelve a `revision` y conserva el original. Se puede descartar
(`descartada`). Confirmar exige campos esenciales válidos y versión de ficha vigente;
no se admiten cambios de una ficha ya confirmada. La identidad documental duplicada
(empresa + referencia normalizada, dentro del mismo usuario) bloquea la confirmación.
La misma entrega o los mismos bytes del mismo usuario reutilizan el registro.

Las acciones de revisión están en `openclaw-plugin/funciones.json`. Nunca ejecutan texto libre o
instrucciones de documentos. Una corrección usa campos explícitos y valores validados.
La extracción utiliza solo `openai/gpt-6-luna`, sin herramientas ni modelos de reserva,
con plazo de 60 segundos y máximo 30 intentos diarios por usuario. Reintentar requiere
acción explícita; no se repite una llamada de resultado desconocido tras reiniciar.

Datos: SQLite en `/data/liquidator/runtime/liquidator.sqlite3`; originales y recibo
inmutable en `/data/liquidator/invoices/<usuario>/<referencia>/`. La ficha y su historial
de cambios viven en SQLite. Fechas UTC; no se utilizan carpetas semanales como fuente
de verdad. `liquidacion_id` es nulo en este hito. Generación y presentación del resumen
son fases distintas, todavía pendientes.
