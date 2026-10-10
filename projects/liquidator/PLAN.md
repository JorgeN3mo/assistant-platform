# Plan de trabajo

| Bloque | Alcance | Estado |
|---|---|---|
| 1. Base y despliegue | Repositorio, MiniGUN, servicio y Telegram | Operativo |
| 2. Acceso y funciones | Perfiles privados, allowlist y acciones cerradas | Desplegado; avisos de solicitudes aplazados |
| 3. Factura completa hasta revisión | Original privado, SQLite, lectura, cobro y confirmación | Desplegado y validado en MiniGUN; pendiente recorrido real desde iPhone |
| 4. Liquidaciones | Seleccionar facturas, cerrar lote y generar fichero | Pendiente |
| 5. Presentación y operación | Marcar presentación, correcciones posteriores, copias y recuperación | Pendiente |

Validación del servidor completada el 10 de octubre de 2026: [resultados](VALIDACION.md).

## Cierre del bloque 3

Enviar foto desde el usuario ya autorizado, comprobar ficha y botones, guardar el
cobro correcto y confirmar. Verificar original y base de datos, reenvío sin duplicados
y consulta tras reiniciar. Probar otra foto con fondo y una lectura incompleta.
Todavía no dar por validado el transporte móvil solo con tests locales o lectura API.

## Siguiente bloque: liquidaciones

1. Definir las columnas y formato del fichero que se presenta (con un ejemplo real
   anonimizado cuando esté disponible). Incluir emisor, cliente, factura, importe
   y forma de cobro; separar totales por empresa y efectivo/tarjeta/transferencia.
2. Elegir facturas confirmadas de ese usuario y mostrar un resumen previo.
3. Crear un ID de liquidación y una fecha de generación; asociar sus facturas en una
   transacción. Evitar que una misma factura pertenezca a dos liquidaciones.
4. Generar y conservar el fichero a partir del lote congelado; poder descargarlo de
   nuevo sin crear otro lote ni recalcular datos cambiantes.
5. Registrar la presentación como acción posterior con fecha propia. No asumir viernes
   fijo ni usar la fecha de factura para decidir la semana de liquidación.

Fuera de este hito: cobros parciales, múltiples páginas, OCR alternativo, alta pública,
Webmaster y contabilidad completa. Antes de uso habitual: resolver copias y recuperación.
