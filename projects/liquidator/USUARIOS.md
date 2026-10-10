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

El ID es numérico, positivo y debe coincidir con la carpeta. No usar el nombre `@usuario`, que puede cambiar. Los estados son `pendiente`, `activo` y `bloqueado`; solo `activo` da acceso. `admin` y `usuario` son roles de la futura aplicación: no conceden permisos de administración de OpenClaw. Los datos de informes pueden quedar vacíos.

Los directorios creados por la herramienta tienen permisos `700` y los archivos `600`. No subir perfiles al repositorio ni enviarlos al bot.

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

La recarga es automática; no hace falta reiniciar. Si no hay usuarios activos, se deshabilitan los mensajes privados. Los grupos siguen bloqueados. Los modelos, las herramientas y los propietarios de comandos no se modifican.

Un perfil incorrecto detiene la aplicación completa antes de cambiar permisos; conserva el acceso anterior. Si falla la confirmación después de escribir, la herramienta lo indica y no registra éxito: revisar el servicio y volver a aplicar. El bloqueo afecta a nuevos mensajes; no cancela una respuesta que ya se esté generando ni borra conversaciones anteriores.

La herramienta presupone que Liki es la única cuenta Telegram y se detiene si se añade otra, para evitar interferir con otros proyectos.

## Alcance actual

El perfil inicial del administrador está activo. No se crean usuarios desde Telegram. Las facturas, liquidaciones y CSV se separan por usuario y se comprueba la propiedad en cada acción. El alta desde Telegram y los avisos de solicitudes siguen aplazados.

Pruebas locales:

```bash
python3 -m unittest discover -s projects/liquidator -p 'test_*.py' -v
```
