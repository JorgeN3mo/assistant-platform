# Prueba desde el iPhone: facturas y liquidaciones

1. En el chat privado de `@liki_liquidator_bot`, envía `/ayuda` y una foto. Puede
   tener ruido de fondo, pero debe verse una factura principal completa.
2. Revisa empresa, número completo, fecha, código cliente, cliente e importe.
   Efectivo es el valor inicial; el texto «REPOSICION» no decide cómo has cobrado.
3. Prueba Transferencia: se exige fecha. Prueba Pagaré: se pide banco y después
   vencimiento. Acepta fechas AAAA-MM-DD o DD/MM/AAAA. No permite aceptar incompletos.
4. Pulsa Corregir, elige un campo y envía el valor. `/cancelar` sale de la edición.
   Pulsa Aceptar cuando todo sea correcto. Puedes corregirlo después y aceptar otra vez.
5. Usa `/d`, `/r` o `/rd`. Verás código cliente, cuatro últimos dígitos de factura,
   importe y método; debajo, banco/vencimiento o fecha de transferencia si procede.
   Los totales incluyen todas las páginas. Pulsa una fila o usa `/ver 9072 D`.
6. Pulsa Eliminar en una ficha de prueba y confirma: debe desaparecer de la lista
   y del almacenamiento activo. No borra la foto del chat de Telegram.
7. Usa `/cerrar D` (o R/RD), revisa el total y confirma. Las otras listas permanecen
   abiertas. Pulsa Descargar CSV y comprueba el archivo en el móvil.
8. Envía otra foto distinta de esa empresa: entra a una lista nueva. Desde
   `/historial`, reabre la anterior, corrige una factura, vuelve a aceptarla y cierra.
   El nuevo CSV tiene otra versión. Las fotos nuevas no entran en la reabierta.
9. Pregunta «¿cómo edito una factura?» o escribe mal un comando: la ayuda consulta
   el manual con Luna. No puede modificar ni comprobar las facturas por ti.

No hace falta una foto perfecta. «Volver a leer la foto» aparece cuando hay dudas
u omisiones; conserva el método y los datos de cobro introducidos. Una nueva foto
del mismo documento se detecta como duplicado al aceptar por empresa+número.
PDF se guarda sin lectura automática; varias páginas y cobros parciales quedan fuera.

La prueba del backend no certifica la interfaz del iPhone: verificar especialmente
que llegan los botones, se leen las listas y se descarga el CSV. Después de probar,
revisar persistencia y almacenamiento en MiniGUN sin publicar datos privados.
