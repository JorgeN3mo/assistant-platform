# Contrato de Liquidator (v0.2)

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
herramientas, historial de conversación, fotos ni fichas del usuario. El modelo
selecciona uno o dos apartados del manual; solo se muestran textos del catálogo.
No genera comandos nuevos ni ejecuta acciones. Si falla, se muestra el menú.
Límites persistentes: 20 consultas/día UTC, 4/minuto, pregunta de 600 caracteres,
25 segundos, dos ayudas simultáneas por proceso. Se solicitan hasta 512 tokens de
salida al proveedor (parámetro best-effort de OpenClaw, no garantía de facturación).
Los comandos válidos y botones no usan el modelo de ayuda.

## Facturas y cobro

Una factura por archivo: JPG/PNG hasta 10 MiB; PDF se guarda para completar a mano.
Se conserva el original antes de extraer. El fondo puede contener otras hojas;
solo se extrae la factura principal. La lectura ambigua requiere revisión humana.
Luna es el único modelo, sin herramientas ni alternativas; 30 lecturas/día UTC y
usuario, dos simultáneas y 60 segundos por lectura. No se reintenta al reiniciar.

Campos obligatorios: empresa, número completo, fecha de factura, código cliente,
cliente e importe total positivo EUR. Establecimiento es opcional. Referencia
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
El diseño definitivo del documento de presentación y registrar su entrega quedan
para el siguiente bloque. No se presupone que el cierre ocurra un viernes.

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
