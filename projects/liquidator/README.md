# Liquidator

Bot de Telegram para registrar facturas ya cobradas y preparar su posterior liquidación.
Recepción, lectura de fotos y revisión implementadas. Liquidaciones pendientes.
El cierre de la prueba requiere enviar una foto desde el iPhone al bot y verificarla.

## Dónde está cada cosa

```text
projects/liquidator/
├── funciones.json         # Funciones habilitadas; el plugin lo lee al arrancar
├── profile.example.json   # Ejemplo ficticio del perfil de usuario
├── users.py               # Administración de perfiles y acceso efectivo
├── openclaw-plugin/
│   ├── index.js           # Entrada JavaScript nativa de OpenClaw
│   ├── plugin.mjs         # Intercepta mensajes, botones y bloquea chat libre
│   ├── controller.mjs     # Acciones cerradas, acceso y fichas de revisión
│   ├── extract.mjs        # Instrucciones de lectura con Luna, sin herramientas
│   ├── store.mjs          # Originales, SQLite, validación y duplicados
│   └── flow.test.mjs      # Pruebas con datos ficticios
├── CONTRATO.md            # Reglas del negocio y límites de esta versión
├── FACTURAS.md            # Flujo y prueba desde el iPhone
├── PLAN.md                # Bloques, estado y próximos pasos
├── USUARIOS.md            # Cómo administrar el acceso
└── TELEGRAM.md            # Conexión y restricciones
```

```text
/data/liquidator/                              # MiniGUN, privado, fuera de Git
├── users/<telegram_id>/profile.json           # Fuente administrativa del acceso
├── users-access.json                         # Recibo de permisos aplicados
├── runtime/liquidator.sqlite3                # Fichas, estado, intentos e historial
└── invoices/<telegram_id>/<referencia>/
    ├── original.<jpg|png|pdf>                 # Bytes recibidos, sin modificar
    └── metadata.json                         # Recibo inmutable del guardado

/data/openclaw/state/openclaw.json             # Lista efectiva de Telegram
```

Después de cambiar perfiles: `scripts/usuarios.sh aplicar`. No editar varias listas
manualmente. Los comandos, botones y remitentes se validan antes de invocar Luna.
Texto ajeno al menú produce una respuesta fija; desconocidos y grupos no se procesan.
Solicitudes de acceso y avisos al administrador siguen aplazados.

## Desarrollo y despliegue

```bash
node --test projects/liquidator/openclaw-plugin/*.test.mjs
python3 -m unittest discover -s projects/liquidator -p 'test_*.py'
```

Node >=22.16; MiniGUN utiliza Node 24. Sin dependencias npm adicionales: SQLite
forma parte de Node y el plugin utiliza el SDK de la instalación de OpenClaw.

Tras revisar y subir el commit, ejecutar en MiniGUN:

```bash
cd /opt/ai-platform
git pull --ff-only
sudo scripts/deploy-liquidator.sh
scripts/openclaw-admin.sh plugins inspect liquidator --runtime --json
```

El despliegue publica una copia del código de Git bajo `openclaw/runtime/local-plugins/liquidator/<commit>`,
propiedad de root y sin escritura para el servicio. Enlaza ese plugin, habilita sus hooks, añade botones de Telegram y
permiso de escritura únicamente en `invoices` y `runtime`. Conserva usuarios y
credenciales. Hace copia privada de la configuración; ante fallo restaura la previa.
Cambios de código o de `funciones.json` requieren commit, pull y nuevo despliegue.
Desactivar el plugin por sí solo restaura el comportamiento conversacional
anterior: para detener Liki sin consumo, detener el servicio o desactivar su cuenta.

No subir facturas, resultados, bases de datos ni credenciales al repositorio.
