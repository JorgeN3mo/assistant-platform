# Facturas: prueba desde el iPhone

Implementado: guardar el original, extraer sus datos con Luna, revisar, corregir,
elegir forma de cobro y confirmar. Falta validar el recorrido real desde Telegram.

## Prueba del administrador

1. Abrir el chat privado de `@liki_liquidator_bot` y enviar `/ayuda`.
2. Enviar una foto de una factura cobrada. Se admiten JPG/PNG hasta 10 MiB y ruido
   de fondo; la factura principal debe poder distinguirse. Una factura por imagen.
3. Recibir una ficha con referencia, empresa, número completo, fecha, cliente,
   establecimiento, importe y cobro. El original ya está guardado antes de leerlo.
4. Comparar la ficha con la foto. Efectivo es el valor inicial. Pulsar Tarjeta o
   Transferencia si corresponde. «REPOSICION» impreso no es la forma de cobro real.
5. Si hay errores, pulsar Corregir datos. En esta versión se proporciona un comando
   `/corregir REFERENCIA VERSION CAMPO VALOR`; tras cada cambio abrir el nuevo botón
   Corregir para obtener la versión vigente. Es una interfaz inicial, mejorable.
6. Pulsar Confirmar solo con datos correctos y cobro completo. La ficha queda
   `pendiente_liquidar`. Todavía no se genera ningún resumen o liquidación.
7. Consultar `/pendientes` o `/ver REFERENCIA`. Reenviar los mismos bytes no crea
   otra ficha ni otra lectura automática. Una foto distinta del mismo documento
   se detecta al confirmar por empresa y número completo dentro del usuario.

Para cerrar la prueba comprobaremos en MiniGUN la ruta del original, su hash,
el registro SQLite, los botones y la persistencia tras reiniciar. No se requiere
una fotografía perfecta; si faltan datos legibles, se corrigen o se repite la foto.
Si hay varias facturas sin una principal clara, no se confirma automáticamente.
Enviar un documento PDF lo guarda para completar los datos manualmente; la lectura
automática de PDF y las facturas con varias páginas quedan fuera de esta versión.

## Flujo

```text
Usuario autorizado → validar adjunto → guardar original y recibo
  → lectura Luna → ficha de revisión → confirmar → pendiente de liquidar
```

Cada registro tiene fecha de factura, `registered_at` y `confirmed_at` independientes.
`liquidacion_id` seguirá vacío hasta generar una liquidación. Más adelante se añadirá
la fecha de presentación de esa liquidación. No se registra fecha de cobro ni se
admiten cobros parciales. La agrupación dependerá de la liquidación elegida, no de
que el calendario diga viernes o de la fecha impresa de la factura.

## Controles y límites

- Acceso privado comprobado en mensajes y botones; identidad obtenida del transporte.
- Originales y SQLite privados, separados por propietario lógico y ruta de usuario.
- Texto libre, consultas, correcciones y botones no llaman al modelo.
- Lectura automática solo con Luna y sin herramientas; máximo 30 intentos por usuario
  y día UTC, 60 segundos por lectura y dos lecturas simultáneas por proceso.
- Fallo de lectura conserva original y datos anteriores. No hay reintento automático
  tras reiniciar: el usuario puede pulsar Reintentar lectura.
- Una ficha confirmada no se edita en esta versión. Anulación y reapertura pendientes.
- `/pendientes` muestra las últimas diez fichas no descartadas, incluidas confirmadas.
- No hay copias de seguridad de facturas programadas todavía.

## Validación de desarrollo

Las 29 pruebas automatizadas usan únicamente datos ficticios. Las dos fotos reales
aportadas se han leído en MiniGUN con el modelo autorizado, sin herramientas y sin
entrega a Telegram. Importes verificados: 141,59 € y 53,85 €. Se corrigió una omisión
de la parte correlativa del número; se añadió una validación que rechaza solo serie/año.
Esta prueba demuestra lectura de esas muestras, no precisión garantizada para todas
las fotos. La revisión humana es obligatoria y no depende de la confianza del modelo.

La integración con el cargador real del plugin también pasó: recepción de ambas
fotos, extracción, cambio a tarjeta, confirmación, duplicados sin nueva lectura y
remitente no autorizado sin respuesta. Se verificaron hashes, permisos privados,
integridad SQLite y persistencia en un proceso nuevo. Los registros de este ensayo
están separados de producción; no se enviaron mensajes a Telegram. El gateway activo
rechazó una petición de chat libre antes del modelo. Ver [VALIDACION.md](VALIDACION.md).
