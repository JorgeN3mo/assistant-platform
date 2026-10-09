# Liki: conexión inicial

Liki es el bot de Telegram de Liquidator. Se ha preparado el agente `liki`, separado del agente principal, y la cuenta Telegram `liki`.

Bot: https://t.me/liki_liquidator_bot. Conexión y primera conversación verificadas. Respuesta real con `openai/gpt-6-luna` verificada y selección explícita de Astra rechazada por la política de modelos.

El token se guarda únicamente en `/data/openclaw/secrets/liki-telegram-token`, con permisos `600`, propiedad del usuario de servicio. No se introduce en un comando, en Git ni en el chat.

Desde la terminal del Mac:

```bash
miniGUN -t /opt/ai-platform/scripts/configure-liki.sh
```

El comando pide el token con entrada oculta, verifica el bot mediante Telegram, guarda el token y activa la conexión. Conserva las restricciones de acceso existentes. La conexión ya está configurada; solo es necesario repetirlo para cambiar el token.

El acceso privado utiliza ahora `dmPolicy: allowlist`, con solo el identificador del administrador tanto en la configuración general como en la cuenta `liki`. No se admiten nuevas solicitudes de emparejamiento. El identificador real se mantiene fuera de este repositorio público. Los grupos están deshabilitados y el agente no puede ejecutar herramientas. Las conversaciones privadas tienen sesiones separadas por cuenta, canal y usuario.

La política `modelPolicy.allow` admite únicamente `openai/gpt-6-luna`. El modelo principal y el auxiliar son Luna, con razonamiento bajo y sin fallbacks. Los comandos de texto y nativos, los cambios de configuración desde Telegram y las tareas periódicas están deshabilitados. El acceso inicial se aprobó por emparejamiento y después se cerró con la lista explícita de usuarios.

El acceso ahora se mantiene mediante [perfiles JSON privados](USUARIOS.md). Usar `scripts/usuarios.sh aplicar` después de editar perfiles o cambiar estados; no mantener la lista de OpenClaw manualmente. El aislamiento completo de archivos y el procesamiento de facturas siguen pendientes. No enviar facturas reales hasta desarrollar esa parte.

Referencia: https://docs.openclaw.ai/channels/telegram/setup
