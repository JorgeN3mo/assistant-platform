# Liki: conexión inicial

Liki es el bot de Telegram de Liquidator. Se ha preparado el agente `liki`, separado del agente principal, y la cuenta Telegram `liki`.

Bot: https://t.me/liki_liquidator_bot. Conexión verificada con Telegram, acceso inicial del administrador aprobado y respuesta local del agente verificada. La primera conversación completa desde Telegram queda por comprobar.

El token se guarda únicamente en `/data/openclaw/secrets/liki-telegram-token`, con permisos `600`, propiedad del usuario de servicio. No se introduce en un comando, en Git ni en el chat.

Desde la terminal del Mac:

```bash
miniGUN -t /opt/ai-platform/scripts/configure-liki.sh
```

El comando pide el token con entrada oculta, verifica el bot mediante Telegram, guarda el token y activa la conexión. Después, abrir el bot y enviar `/start`.

El acceso privado utiliza aprobación manual de OpenClaw. Los grupos están deshabilitados y el agente no puede ejecutar herramientas. Las conversaciones privadas tienen sesiones separadas por cuenta, canal y usuario.

Consultar solicitudes mediante `scripts/openclaw-admin.sh pairing list telegram`; aprobar solo la identidad prevista con `pairing approve telegram <CODE>`. Esta conexión inicial no implementa todavía el registro administrativo ni el aislamiento completo de archivos de Liquidator. No enviar facturas reales hasta desarrollar esa parte.

Referencia: https://docs.openclaw.ai/channels/telegram/setup
