# OpenClaw compartido

Esta carpeta contiene referencias para administrar OpenClaw. Su código y Node se instalan con el [instalador oficial](https://docs.openclaw.ai/install/installer); no se copian a Git.

La instalación existente está en `runtime/`, excluida del repositorio. La configuración real está en `/data/openclaw/state/openclaw.json`, con propietario `openclaw` y permisos `600`.

`openclaw-gateway.service` reproduce la unidad de sistema preparada en MiniGUN. Modificar el archivo de este repositorio no cambia el servicio instalado: habría que revisarlo, copiarlo a `/etc/systemd/system/`, ejecutar `systemctl daemon-reload` y reiniciar.

El token del gateway se genera en el servidor. La cuenta de ChatGPT está autorizada mediante OAuth y OpenClaw guarda las credenciales en su almacén privado bajo `/data/openclaw/state`, fuera de Git. Si se usa `/data/openclaw/service.env`, debe pertenecer a `openclaw`, tener permisos `600` y permanecer fuera de Git.

Para volver a autorizar la cuenta, ejecutar `scripts/openclaw-admin.sh models auth login --provider openai --device-code`, completar el flujo en el navegador y consultar `models auth list --provider openai`. Si el perfil necesita activación, usar `models auth activate <profileId> --agent main` y nuestro script de reinicio. No guardar códigos de dispositivo ni credenciales en documentación o commits.

El drop-in `liquidator.conf`, aplicado por `scripts/deploy-liquidator.sh`, añade escritura en `/data/liquidator/invoices` y `/data/liquidator/runtime`. El servicio no puede leer ni modificar los perfiles administrativos en `users`. La carpeta padre permite solo atravesarla al grupo `openclaw` (710); las carpetas de datos del servicio son privadas (700).
