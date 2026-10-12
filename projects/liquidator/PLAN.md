# Plan de trabajo

| Bloque | Alcance | Estado |
|---|---|---|
| 1. Base y despliegue | Repositorio único, Mac → Git → MiniGUN, servicio y Telegram | Operativo |
| 2. Acceso y funciones | Perfiles privados, allowlist, catálogo y ayuda Luna personalizada sin acciones | Implementado; solicitudes por enlace y avisos añadidos, pendiente prueba con otra cuenta |
| 3. Factura y revisión | Original privado, lectura, edición guiada, cuatro cobros y aceptación | Implementado; validar experiencia actual desde iPhone |
| 4. Liquidaciones | Tres listas, totales, cierre independiente, CSV, historial y reapertura | Implementado; validar listas, botones y descarga desde iPhone |
| 5. Presentación y operación | Parte PDF, registrar entrega, copias periódicas y recuperación | PDF implementado y validado; probar impresión móvil. Entrega y copias pendientes |

La ayuda personalizada, el contexto breve y sus límites se desplegaron y validaron
con Luna real el 11 de octubre de 2026. Falta la comprobación de experiencia móvil.
El registro pasivo de conversaciones también está desplegado y validado: texto
privado durante 90 días, sin copias de facturas ni encuestas; revisión futura manual.
La ficha simplificada (Aceptar, Corregir, Eliminar), el cambio de pago dentro de
Corregir y Cancelar están desplegados y validados con OpenClaw y Luna reales.
Estamos en la validación integrada de los bloques 3 y 4. Ver [prueba móvil](FACTURAS.md)
y [evidencias técnicas](VALIDACION.md). No considerar la prueba del backend como
certificación de que Telegram entrega correctamente todas las pantallas y archivos.
También está implementado el primer paso del bloque 5: Imprimir genera el parte
PDF desde el cierre guardado, con base imponible, comisión del 3 % y nombre completo
del JSON de cada usuario. Hay que completar ese nombre para poder cerrar.

## Siguientes pasos

1. Ejecutar el recorrido real desde el iPhone con las fotos aportadas: comparar,
   corregir, cambiar método, aceptar, listar, cerrar, descargar y reabrir.
2. Ajustar únicamente los problemas observados de lectura o interfaz.
3. Completar los nombres en los perfiles JSON, sincronizar informes y probar el
   PDF desde el iPhone: colores, datos, totales, comisión y envío a la impresora.
4. Separar cierre de liquidación y presentación: registrar esta última cuando se
   entregue, con fecha propia y sin imponer viernes fijo.
5. Establecer copia periódica privada, retención y prueba de recuperación antes
   de usarlo como único registro habitual. La copia previa al despliegue no sustituye
   un sistema de copias.

Aplazados: cobros parciales, facturas de varias
páginas, lectura automática de PDF, contabilidad completa y Webmaster.
