# Liquidator

Primer proyecto de la plataforma. El bot está conectado y la gestión de usuarios JSON está implementada; el procesamiento de facturas está pendiente.

Consultar [gestión de usuarios](USUARIOS.md) y [conexión de Telegram](TELEGRAM.md). `users.py` implementa el registro privado y su sincronización con OpenClaw; `test_users.py` verifica los casos de acceso y validación.

Alcance de la v1:

- Bot propio de Telegram.
- Solicitudes de acceso y aprobación manual desde el servidor.
- Datos administrativos de usuarios y aislamiento de sus documentos.
- Guardar originales JPG, PNG y PDF antes de procesarlos.
- Extracción inicial con LLM y resultado JSON; OCR adicional después.
- SQLite y archivos en `/data/liquidator`, separados del código.

No subir facturas reales, resultados ni bases de datos a este repositorio.
