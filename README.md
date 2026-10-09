# Assistant Platform

Una plataforma sencilla en MiniGUN, con OpenClaw compartido y proyectos independientes. Se desarrolla en el Mac y se mantiene todo el código en este repositorio.

```text
assistant-platform/
├── openclaw/             # Referencias de configuración y servicio
├── projects/
│   ├── liquidator/       # Primer proyecto: facturas por Telegram
│   └── webmaster/        # Reservado para el siguiente proyecto
└── scripts/             # Estado, reinicio y administración
```

## En el servidor

| Uso | Ruta |
|---|---|
| Este repositorio | `/opt/ai-platform` |
| Instalación de OpenClaw y Node, excluida de Git | `/opt/ai-platform/openclaw/runtime` |
| Configuración y estado privados de OpenClaw | `/data/openclaw/state` |
| Espacio de trabajo de OpenClaw | `/data/openclaw/workspace` |
| Credenciales opcionales del servicio, fuera de Git | `/data/openclaw/service.env` |
| Facturas, resultados y futura base SQLite | `/data/liquidator` |
| Futuras copias locales | `/data/liquidator/backups` |

Los datos y las credenciales se mantienen fuera del repositorio. Git no realiza copias de las facturas. Las copias locales todavía no están programadas.

## Estado de la base

Preparada el 8 de octubre de 2026: OpenClaw 2026.9.9, Node 24.21.0 y npm 11.19.0. El servicio `openclaw-gateway.service` está habilitado para arrancar con el servidor y se ejecuta como usuario `openclaw`, sin sudo. Solo escucha en loopback, puerto 18789, con token privado.

La cuenta de ChatGPT está autorizada mediante OAuth. Liki está conectado a Telegram y la conversación inicial ya funciona. La plataforma está limitada a `openai/gpt-6-luna`, sin modelos de respaldo; se ha verificado una respuesta real con Luna y el rechazo de una selección explícita de Astra. El acceso de Telegram se genera desde perfiles JSON privados, con solo el administrador activo inicialmente. La gestión manual de usuarios está implementada; el procesamiento de facturas sigue pendiente. Consultar [usuarios de Liki](projects/liquidator/USUARIOS.md).

Los comandos de administración desde el chat, los grupos y las herramientas del agente Liki están deshabilitados. Las tareas periódicas y los heartbeats están desactivados para evitar consumo en segundo plano. Estos controles se cambian desde el servidor.

## Operación en MiniGUN

```bash
/opt/ai-platform/scripts/status.sh
/opt/ai-platform/scripts/restart-openclaw.sh
/opt/ai-platform/scripts/openclaw-admin.sh config validate
sudo journalctl -u openclaw-gateway.service -n 50 --no-pager
```

Para el servicio usar `systemctl` o nuestros scripts: los comandos nativos de instalación de OpenClaw pueden buscar una unidad de usuario distinta de la unidad de sistema utilizada aquí.

## Trabajo con Git

Cada proyecto tiene su propio código, dependencias e instrucciones. Se pueden desplegar por separado aunque compartan repositorio.

Antes de subir cambios, revisar `git diff --cached` y comprobar que no contiene secretos ni documentos de usuarios. La copia del servidor sigue `main`. No hay despliegue automático: actualizar Git no instala dependencias ni reinicia servicios.

En MiniGUN, con el árbol limpio, se puede actualizar mediante `git -C /opt/ai-platform pull --ff-only`. Los cambios de configuración o de servicio requieren revisión y aplicación separadas.
