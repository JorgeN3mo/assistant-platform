# Validación — 10 de octubre de 2026

Implementación v0.2 desplegada: `24626af`. MiniGUN: Node 24.21.0, OpenClaw 2026.9.9.
Plugin cargado con ambos hooks y servicio; configuración válida y gateway activo.

## Pruebas automatizadas

28 pruebas Node y 11 pruebas de usuarios Python: todas pasan. Cubren:

- Acceso, grupos, revocación durante lectura/ayuda y aislamiento entre propietarios.
- Recepción duradera, firmas, tamaño, rutas, duplicados, errores e interrupciones.
- Empresa y número completos, céntimos, fechas, código cliente obligatorio.
- Tres empresas independientes; paginación con totales de toda la lista y
  coincidencias de los últimos cuatro dígitos, conservando ceros.
- Correcciones de facturas aceptadas, control de revisión y cierre bloqueado
  mientras falten aceptación o datos obligatorios.
- Transferencia con fecha y pagaré con banco/vencimiento; edición tras reiniciar.
- Cierre, reapertura, nuevas fotos en un lote independiente y versiones del CSV.
- CSV estable, total, escape de fórmulas e invalidación al reabrir.
- Confirmación de borrado, eliminación de archivos y filas activas, recuperación
  de un borrado interrumpido y conservación de contadores de consumo.
- Ayuda solo desde textos del catálogo, sin herramientas; deduplicación y límites
  persistentes por minuto/día; fallo del proveedor con menú como alternativa.
- Migración de esquema 1 a 2 conservando fichas, originales, fechas y consumo.

## Integración real en MiniGUN

Se usó el cargador de OpenClaw y el plugin desplegado, con almacenamiento temporal
privado distinto del de producción. No se enviaron mensajes a Telegram.

- Remitente desconocido: ninguna respuesta ni creación de almacenamiento.
- Las dos fotos reales se guardaron y leyeron con Luna: DIBOS y REDISSA & DIBOS,
  referencias completas, códigos cliente e importes 141,59 € y 53,85 € correctos.
  Reenviar la misma foto no hizo otra extracción.
- Se eligió pagaré y se introdujeron banco/vencimiento en pasos guiados; para
  transferencia se exigió su fecha. Ambas fichas se aceptaron correctamente.
- Se cerró D sin cerrar RD. Descargar CSV generó un archivo con el total y una
  respuesta de documento para el dispatcher. Se reabrió, corrigió el importe,
  aceptó y cerró de nuevo: versión 2. El CSV anterior se eliminó del servidor.
- Se borró una factura tras confirmación: original y ficha desaparecieron;
  los intentos consumidos permanecieron contabilizados.
- Luna real respondió desde el manual a una duda de edición y un comando mal
  escrito; una petición de un poema fuera de alcance recibió la respuesta limitada.
- SQLite: esquema 2, integridad `ok` y estado conservado al reabrir la conexión.
- El gateway activo bloqueó una petición directa de conversación libre con
  `hook_block`, antes de inferencia y sin entrega a Telegram.

## Producción y despliegue

Se creó copia privada de configuración y SQLite antes de migrar. La base real
conservó su única ficha antigua descartada, sin introducir facturas de las pruebas.
La migración terminó con integridad correcta. Continúa un único usuario autorizado,
allowlist en cuenta y canal, grupos deshabilitados y Luna como único modelo.

El código publicado procede de Git y se ejecuta desde una copia versionada de root.
El servicio mantiene sus permisos limitados; los perfiles administrativos quedan
fuera de su lectura. No hay credenciales ni facturas reales en el repositorio.

## Pendiente de aceptación móvil

Probar el [recorrido completo](FACTURAS.md) desde el iPhone: foto, ficha y botones,
correcciones, listas, cierre, recepción efectiva del CSV y reapertura. Se ha probado
el contenido del documento y el payload de descarga, no una entrega real del CSV a
Telegram. Esta distinción es necesaria antes de dar por cerrados los bloques 3 y 4.

Siguen fuera: avisos de solicitudes de acceso, presentación del documento, formato
final de entrega, copias periódicas, cobros parciales, PDF automático y varias páginas.
