# Validación — 11 de octubre de 2026

## Menú de factura v0.3.2

Código desplegado: `6b5d76b`. Pasan 45 pruebas Node y 11 de usuarios Python.
Ficha editable con solo Aceptar, Corregir y Eliminar. Selección de método dentro
de Corregir → Método de pago; Cancelar en ambos menús y en la entrada de valores.
Volver a leer la foto pasa a Corregir cuando hay dudas; Ver lista se elimina.

Prueba con el plugin desplegado y cargador real de OpenClaw en MiniGUN, en datos
temporales privados, sin modificar facturas de producción ni enviar a Telegram:

- Una foto real se extrajo con Luna: DIBOS, 141,59 €, efectivo inicial y tres botones.
- Navegación con los callbacks reales de Corregir, Método de pago y Cancelar.
- Transferencia pidió fecha; cancelar salió a la ficha y Aceptar rechazó el dato
  pendiente. Tras introducir la fecha se pudo aceptar.
- Pagaré pidió banco y después vencimiento; cancelar conservó el banco y no
  permitió aceptar sin vencimiento. Retomar pidió solo el dato que faltaba.
- /d conservó el total y la lista. Integridad SQLite correcta.
- La ayuda de Luna indicó Corregir → Método de pago y la fecha obligatoria.
- Servicio activo tras el despliegue; almacenamiento de prueba eliminado.

Pendiente únicamente comprobar la presentación y pulsaciones desde el iPhone;
la integración valida los payloads y callbacks, no la entrega visual de Telegram.

## Registro pasivo de conversaciones v0.3.1

Código desplegado: `5cfb171`. Pasan 43 pruebas Node y 11 de usuarios Python.
Las pruebas nuevas cubren texto UTF-8, permisos privados, retención de 90 fechas
UTC incluyendo hoy, exclusión de archivos ajenos, enlaces simbólicos, límites de
cola/tamaño, truncamiento explícito y errores que no bloquean la respuesta.

Integración con el cargador real de OpenClaw y Luna en MiniGUN, con almacenamiento
temporal privado y sin enviar mensajes a Telegram:

- Consulta de ayuda guardada con su respuesta real, proveedor y modelo Luna.
  Repetir la misma entrega no generó otra llamada ni otra entrada de ayuda.
- Saludo y menú guardados; remitente no autorizado, comandos operativos,
  documento PDF, su texto adjunto y valor introducido al corregir cliente excluidos.
- Archivo diario de texto JSONL con permisos 600, directorio 700.
- Eliminación comprobada de un archivo de hace 90 días; conservados el de hace
  89 días y un archivo ajeno al registro. No se leyó el archivo de producción.
- Integridad SQLite correcta; pruebas temporales eliminadas al terminar.

OpenClaw quedó activo tras desplegar. La entrega de respuestas se marca como
`no_verificada`: se registra lo generado, sin afirmar recepción o satisfacción.
No hay encuestas, análisis automático ni incorporación de este archivo al contexto
del modelo. La revisión posterior sigue pendiente de decisión del administrador.

## Validación de ayuda v0.3

Ayuda personalizada v0.3 desplegada: `cb8a3dd`. MiniGUN, servicio activo.

## Ayuda con redacción libre y límites

- 36 pruebas Node y 11 de usuarios Python pasan. Incluyen generación libre con
  formato validado; rechazo de comandos inexistentes, enlaces y resultados fuera
  de contrato; proveedor/modelo distintos o metadatos ausentes; contexto aislado,
  persistencia, caducidad y reinicio; reservas globales entre conexiones SQLite;
  concurrencia, errores, revocación y registro de consumo sin credenciales.
- Ensayo con cargador real de OpenClaw y Luna, en base temporal privada, usando
  preguntas ficticias y sin enviar mensajes a Telegram. Las seis llamadas terminaron
  correctamente con proveedor `openai` y modelo `gpt-6-luna`.
- Ante efectivo marcado por error, indicó pulsar directamente Transferencia,
  completar su fecha y aceptar de nuevo. Ante «¿y si ya la había cerrado?» indicó
  reabrir, corregir y volver a cerrar, conservando el contexto de la transferencia.
- Un comando mal escrito produjo la sintaxis correcta `/ver 9072 D`. Una pregunta
  sobre una factura concreta reconoció que no podía verla ni validarla.
- Las peticiones de un poema y asesoramiento fiscal general recibieron la respuesta
  fuera de alcance. `/ayuda` vació el contexto; reenviar la misma entrega no hizo
  otra llamada. La base de ensayo no creó ni modificó ninguna factura.
- Consumo reportado por llamada: 1901–2077 tokens de entrada y 21–98 de salida;
  duración 2,1–4,7 s. OpenClaw no informó tokens de razonamiento separados: quedan
  NULL, no se interpretan como cero. Se solicitó `low`, sin modo rápido ni alternativas.
- El código instalado transmite `streamParams.maxTokens` a los parámetros de
  generación. Se solicitan 512; esta comprobación y el consumo observado no prueban
  un techo de facturación del proveedor. El límite global duro de la aplicación es
  de 200 llamadas de ayuda/día UTC, además de los límites individuales.
- El gateway activo continuó rechazando conversación libre con `hook_block` antes
  del modelo. Un remitente no autorizado no obtuvo respuesta ni creó almacenamiento.

Se corrigieron dos problemas observados antes de cerrar la validación: el manual
no distinguía con suficiente claridad los botones de cobro del menú Corregir; y el
modelo repetía un comando mal escrito al explicarlo, activando el rechazo de salida.
Las instrucciones ahora describen el botón directo y muestran solo el comando válido.
Estas pruebas no garantizan ausencia de errores semánticos futuros: la ayuda no tiene
herramientas y las acciones siguen ejecutándose exclusivamente mediante código.

El despliegue conservó copias privadas de configuración y SQLite. Tablas nuevas
`help_context` y `help_calls`, compatibles con el esquema 2 existente. Confirmación
móvil pendiente: comprobar la conversación y sus seguimientos desde Telegram.

---

# Validación anterior — 10 de octubre de 2026

Implementación v0.2 desplegada: `24626af`. MiniGUN: Node 24.21.0, OpenClaw 2026.9.9.
Plugin cargado con ambos hooks y servicio; configuración válida y gateway activo.

## Pruebas automatizadas

28 pruebas Node y 11 pruebas de usuarios Python: todas pasan. Cubren:

- Acceso, grupos, revocación durante lectura/ayuda y aislamiento entre propietarios.
- Recepción duradera, firmas, tamaño, rutas, duplicados, errores e interrupciones.
- Empresa y número completos, céntimos, fechas, código cliente obligatorio.
- Tres empresas independientes; paginación con totales de toda la lista y
  coincidencias de los últimos cuatro dígitos, conservando ceros.
- Correcciones de facturas aceptadas, control de revisión y cierre bloqueado
  mientras falten aceptación o datos obligatorios.
- Transferencia con fecha y pagaré con banco/vencimiento; edición tras reiniciar.
- Cierre, reapertura, nuevas fotos en un lote independiente y versiones del CSV.
- CSV estable, total, escape de fórmulas e invalidación al reabrir.
- Confirmación de borrado, eliminación de archivos y filas activas, recuperación
  de un borrado interrumpido y conservación de contadores de consumo.
- Ayuda solo desde textos del catálogo, sin herramientas; deduplicación y límites
  persistentes por minuto/día; fallo del proveedor con menú como alternativa.
- Migración de esquema 1 a 2 conservando fichas, originales, fechas y consumo.

## Integración real en MiniGUN

Se usó el cargador de OpenClaw y el plugin desplegado, con almacenamiento temporal
privado distinto del de producción. No se enviaron mensajes a Telegram.

- Remitente desconocido: ninguna respuesta ni creación de almacenamiento.
- Las dos fotos reales se guardaron y leyeron con Luna: DIBOS y REDISSA & DIBOS,
  referencias completas, códigos cliente e importes 141,59 € y 53,85 € correctos.
  Reenviar la misma foto no hizo otra extracción.
- Se eligió pagaré y se introdujeron banco/vencimiento en pasos guiados; para
  transferencia se exigió su fecha. Ambas fichas se aceptaron correctamente.
- Se cerró D sin cerrar RD. Descargar CSV generó un archivo con el total y una
  respuesta de documento para el dispatcher. Se reabrió, corrigió el importe,
  aceptó y cerró de nuevo: versión 2. El CSV anterior se eliminó del servidor.
- Se borró una factura tras confirmación: original y ficha desaparecieron;
  los intentos consumidos permanecieron contabilizados.
- Luna real respondió desde el manual a una duda de edición y un comando mal
  escrito; una petición de un poema fuera de alcance recibió la respuesta limitada.
- SQLite: esquema 2, integridad `ok` y estado conservado al reabrir la conexión.
- El gateway activo bloqueó una petición directa de conversación libre con
  `hook_block`, antes de inferencia y sin entrega a Telegram.

## Producción y despliegue

Se creó copia privada de configuración y SQLite antes de migrar. La base real
conservó su única ficha antigua descartada, sin introducir facturas de las pruebas.
La migración terminó con integridad correcta. Continúa un único usuario autorizado,
allowlist en cuenta y canal, grupos deshabilitados y Luna como único modelo.

El código publicado procede de Git y se ejecuta desde una copia versionada de root.
El servicio mantiene sus permisos limitados; los perfiles administrativos quedan
fuera de su lectura. No hay credenciales ni facturas reales en el repositorio.

## Pendiente de aceptación móvil

Probar el [recorrido completo](FACTURAS.md) desde el iPhone: foto, ficha y botones,
correcciones, listas, cierre, recepción efectiva del CSV y reapertura. Se ha probado
el contenido del documento y el payload de descarga, no una entrega real del CSV a
Telegram. Esta distinción es necesaria antes de dar por cerrados los bloques 3 y 4.

Siguen fuera: avisos de solicitudes de acceso, presentación del documento, formato
final de entrega, copias periódicas, cobros parciales, PDF automático y varias páginas.
