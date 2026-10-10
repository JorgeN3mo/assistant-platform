# Validación — 10 de octubre de 2026

Código desplegado: `8e9c739`. MiniGUN: Node 24.21.0, OpenClaw 2026.9.9.
El plugin está `loaded`, con los hooks `reply_dispatch` y `before_agent_run`,
servicio `liquidator` y configuración válida. El gateway está activo.

## Evidencia

- 18 pruebas del flujo de facturas y 11 de usuarios: todas pasan. Cubren acceso,
  aislamiento, entradas inválidas, duplicados, versiones de botones, cobro, errores
  de almacenamiento, interrupciones, límites y persistencia.
- Lectura real de las dos muestras del usuario con Luna: empresas, referencias
  completas, fechas, clientes, establecimientos e importes correctos (141,59 € y
  53,85 €). No se mezcló la factura principal con los documentos del fondo.
- Ensayo con el cargador real de OpenClaw, hooks y almacenamiento temporal privado:
  ambas fotos guardadas y leídas; botón tarjeta; confirmación; duplicado sin nueva
  llamada; remitente no autorizado sin respuesta ni lectura.
- Nuevo proceso: las fichas conservan estados y forma de cobro. Hashes de ambos
  originales correctos, archivos 600 y `PRAGMA integrity_check` devuelve `ok`.
- Gateway activo: una petición explícita de conversación libre a Liki se bloquea
  con `hook_block` antes del modelo, sin uso registrado. No se entrega a Telegram.
- Permisos reales: raíz de Liquidator 710; perfiles administrativos 700 sin lectura
  del usuario de servicio; facturas y SQLite bajo carpetas privadas del servicio.
  systemd solo añade escritura en `invoices` y `runtime`.

Los ensayos no enviaron mensajes de Telegram ni crearon liquidaciones. Los datos de
prueba están separados de las fichas de producción y no se incluyen en Git.

## Problemas detectados y corregidos

- Luna devolvía la serie/año sin el correlativo: instrucciones más precisas y
  validación que rechaza referencias formadas únicamente por serie/año.
- OpenClaw exige propiedad segura del código: copia versionada de Git propiedad de
  root. Entrada JavaScript nativa y catálogo JSON incluido dentro del paquete.
- OpenClaw crea distintas instancias capturadas para mensajes e inferencia: la
  autorización comparte únicamente IDs aleatorios de lecturas en curso dentro del
  proceso. Se retiran siempre al terminar; el texto del usuario no concede acceso.
- El despliegue valida la carga y ambos hooks, además de la salud del gateway.

## Pendiente para cerrar el bloque 3

Enviar desde el iPhone al bot: verificar formato recibido desde Telegram, legibilidad,
ficha y botones visibles. Cambiar forma de cobro, confirmar y consultar la ficha.
El ensayo del backend no sustituye esta comprobación del transporte y la interfaz.
No hay aún liquidaciones, lectura automática de PDF, múltiples páginas, reapertura de
fichas confirmadas ni avisos de solicitudes de acceso. La corrección es por comando
explícito y puede simplificarse después de esta primera prueba.
