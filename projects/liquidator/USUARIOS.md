# Usuarios de Liki

Los perfiles JSON privados son la fuente de verdad. Se administran en MiniGUN con el usuario de mantenimiento del servidor; Liki no puede cambiarlos por Telegram. El código está en Git y los perfiles no.

## Archivo por usuario

Ruta: `/data/liquidator/users/<telegram_id>/profile.json`.

El archivo [profile.example.json](profile.example.json) muestra el formato con datos
ficticios. No concede acceso a nadie ni se carga automáticamente. Los perfiles reales
solo existen en MiniGUN; para consultar quién tiene acceso, usar `usuarios.sh listar`
y comprobar la sincronización con OpenClaw, como se explica más abajo.

```json
{
  "telegram_id": "123456789",
  "nombre": "Nombre de ejemplo",
  "estado": "pendiente",
  "rol": "usuario",
  "datos_informes": {
    "nombre_completo": "",
    "identificacion_fiscal": "",
    "empresa": ""
  }
}
```

El ID es numérico, positivo y debe coincidir con la carpeta. No usar el nombre `@usuario`, que puede cambiar. Los estados son `pendiente`, `activo` y `bloqueado`; solo `activo` da acceso. `admin` recibe avisos de nuevas solicitudes mientras está activo; `usuario` no. Estos roles no conceden permisos de administración de OpenClaw. El nombre completo es obligatorio para cerrar una liquidación y generar su parte; identificación fiscal y empresa pueden quedar vacías y no se imprimen.

Los directorios creados por la herramienta tienen permisos `700` y los archivos `600`. No subir perfiles al repositorio ni enviarlos al bot.

## Completar la información para imprimir

Hay **un JSON por persona**, en su carpeta de ID de Telegram. Edita únicamente
`datos_informes.nombre_completo` para el nombre que aparecerá en sus partes.
`nombre` es el nombre corto administrativo. La empresa del parte la determina
la liquidación (D, R o RD), no `datos_informes.empresa`.

Por ejemplo, dentro del perfil de la persona:

```json
"datos_informes": {
  "nombre_completo": "Nombre Apellido Apellido",
  "identificacion_fiscal": "",
  "empresa": ""
}
```

Puedes editar el archivo desde el Mac. Sustituye el ID ficticio `123456789` por el
ID de Telegram de la persona:

```bash
ssh -t miniGUN 'sudo nano /data/liquidator/users/123456789/profile.json'
ssh miniGUN 'sudo /opt/ai-platform/scripts/usuarios.sh validar && sudo /opt/ai-platform/scripts/usuarios.sh informes'
```

Usa el ID correspondiente para cada usuario. `informes` sincroniza los nombres
sin cambiar accesos ni reiniciar el bot. Como alternativa a editar JSON:

```bash
ssh miniGUN "sudo /opt/ai-platform/scripts/usuarios.sh nombre-informe 123456789 --nombre 'Nombre Apellido Apellido'"
```

El servicio solo recibe los nombres completos de perfiles activos en
`/data/liquidator/report-users.json` (root:openclaw, 640); no lee ni escribe los
perfiles privados. No edites esta copia generada. `aplicar` y el despliegue también
la sincronizan. Un cambio de nombre se usa en los siguientes cierres; un parte
ya cerrado conserva el nombre guardado en esa versión.

## Comandos desde el Mac

Listar y validar:

```bash
miniGUN /opt/ai-platform/scripts/usuarios.sh listar
miniGUN /opt/ai-platform/scripts/usuarios.sh validar
```

Añadir una persona (siempre empieza como pendiente):

```bash
miniGUN /opt/ai-platform/scripts/usuarios.sh anadir 123456789 --nombre 'Nombre Apellido'
```

Cambiar el estado:

```bash
miniGUN /opt/ai-platform/scripts/usuarios.sh activar 123456789
miniGUN /opt/ai-platform/scripts/usuarios.sh bloquear 123456789
miniGUN /opt/ai-platform/scripts/usuarios.sh pendiente 123456789
```

Revisar y aplicar:

```bash
miniGUN /opt/ai-platform/scripts/usuarios.sh aplicar --simular
miniGUN /opt/ai-platform/scripts/usuarios.sh aplicar
```

**Los cambios de estado y las ediciones manuales no cambian el acceso hasta ejecutar `aplicar`.** Para editar los datos administrativos, conectar con `miniGUN` y abrir el `profile.json` con un editor de texto. Usar `validar` después.

## Qué hace aplicar

1. Lee todos los perfiles y valida formatos, estados, IDs, duplicados y enlaces.
2. Genera una lista exclusivamente con usuarios activos.
3. Valida la actualización con OpenClaw antes de escribirla.
4. Actualiza únicamente los controles de acceso de Telegram, tanto generales como los de la cuenta `liki`.
5. Confirma que el gateway ha cargado esa configuración y guarda un recibo privado en `/data/liquidator/users-access.json`.

La recarga es automática; no hace falta reiniciar. Si no hay usuarios activos, solo se admiten solicitudes de acceso; ninguna persona puede utilizar Liquidator. Los grupos siguen bloqueados. Los modelos, las herramientas y los propietarios de comandos no se modifican.

Un perfil incorrecto detiene la aplicación completa antes de cambiar permisos; conserva el acceso anterior. Si falla la confirmación después de escribir, la herramienta lo indica y no registra éxito: revisar el servicio y volver a aplicar. El bloqueo afecta a nuevos mensajes; no cancela una respuesta que ya se esté generando ni borra conversaciones anteriores.

La herramienta presupone que Liki es la única cuenta Telegram y se detiene si se añade otra, para evitar interferir con otros proyectos.

## Alcance actual

El perfil inicial del administrador está activo. Telegram crea solicitudes; únicamente el administrador puede importarlas como perfiles pendientes. Las facturas, liquidaciones y CSV se separan por usuario y se comprueba la propiedad en cada acción. Las solicitudes y avisos están implementados; la activación sigue siendo manual.

Pruebas locales:

```bash
python3 -m unittest discover -s projects/liquidator -p 'test_*.py' -v
```

## Registro mediante enlace

Comparte https://t.me/liki_liquidator_bot?start=solicitar. La persona pulsa **Iniciar**
(o envía `/start`) y OpenClaw solicita acceso antes de procesar mensajes o fotos.
El enlace es público y no concede permisos. También puede solicitar quien encuentre
el bot sin enlace. El acuse nativo muestra un código técnico; Liki añade una
confirmación en español. No es necesario copiar ni aprobar ese código.

Cada administrador activo recibe ID, nombre y alias públicos de Telegram. El
nombre es declarativo: confirma personalmente a quién pertenece antes de activar.
No hay llamadas al LLM. Repetir una solicitud no repite el aviso. El código nativo
caduca; la solicitud guardada por Liquidator permanece disponible.

Desde el Mac (sustituye el ID ficticio):

```bash
ssh miniGUN 'sudo /opt/ai-platform/scripts/usuarios.sh solicitudes'
ssh miniGUN 'sudo /opt/ai-platform/scripts/usuarios.sh importar 123456789'
ssh -t miniGUN 'sudo nano /data/liquidator/users/123456789/profile.json'
ssh miniGUN 'sudo /opt/ai-platform/scripts/usuarios.sh validar'
ssh miniGUN 'sudo /opt/ai-platform/scripts/usuarios.sh activar 123456789'
ssh miniGUN 'sudo /opt/ai-platform/scripts/usuarios.sh aplicar'
```

Al editar, completa `nombre` y `datos_informes.nombre_completo`; deja `estado` como
`pendiente` hasta activar y `rol` como `usuario`. `importar` nunca sobrescribe un
perfil existente. No necesitas desplegar código ni usar Git para altas y cambios.
Una vez aplicado, la persona puede volver a enviar `/start` y usar Liki. No se envía
un aviso automático de aprobación en esta versión.

Los archivos privados son:

- `/data/liquidator/runtime/access-requests/<ID>.json`: solicitud, fecha y resultado
  del aviso; permisos 600. No contiene mensajes, fotos ni códigos de emparejamiento.
- `/data/liquidator/registration-policy.json`: IDs conocidos y administradores
  activos, generados desde los perfiles; root:openclaw, 640. No concede acceso.
- `/data/liquidator/users/<ID>/profile.json`: perfil administrativo que completas.

`aplicar` y el despliegue publican los destinatarios de avisos. `registro` permite
actualizar únicamente esa proyección. Los perfiles conocidos (incluidos bloqueados)
no generan avisos nuevos. Nunca usar `openclaw pairing approve` para dar acceso:
Liquidator exige que el ID esté en las dos listas explícitas que publica `aplicar`.

Límites: 1000 solicitudes persistentes y 20 intentos de aviso al día (UTC). Si un
aviso falla o alcanza el cupo, la solicitud sigue visible en `solicitudes`; no hay
reintentos automáticos. OpenClaw aplica además su propio límite temporal de solicitudes.
Los acuses técnicos nativos no están sujetos al límite de avisos de Liquidator.
