# LoL Quiz Assistant

Extensión experimental para Microsoft Edge que identifica una pregunta en la página, consulta Gemini y puede colocar la respuesta en controles compatibles. Está pensada para ayudar a analizar preguntas: **no pulsa los botones de comprobar ni enviar**.

## Qué puede hacer

- Analizar preguntas de opción única y campos de respuesta corta.
- Completar campos de texto y `textarea` de Moodle.
- Resolver preguntas con menús desplegables, incluidos ejercicios de ordenamiento o emparejamiento.
- Completar espacios de arrastrar y soltar de Moodle (`ddwtos`) y algunos espacios HTML con `data-drop-slot`.
- Resolver preguntas con varios espacios, todas de una vez o paso a paso.
- Mostrar la respuesta y, opcionalmente, una justificación.

La extensión reconoce el texto visible de la página. **En esta versión no recibe ni envía imágenes a Gemini**; preguntas cuyo contenido relevante aparezca solo en una imagen, diagrama o captura no se pueden interpretar correctamente. Los menús personalizados y otros tipos de arrastre podrían no ser compatibles.

## Instalación en Edge

1. Descarga o copia la carpeta `lol-edge-assistant` en tu equipo.
2. En Edge, abre `edge://extensions`.
3. Activa **Modo de desarrollador**.
4. Selecciona **Cargar desempaquetado** y elige la carpeta `lol-edge-assistant`.
5. Deja habilitada la extensión. Si pruebas una página HTML local, activa **Permitir acceso a direcciones URL de archivo** en los detalles de la extensión.

Es una extensión cargada localmente para desarrollo; no se instala desde la tienda de Edge.

## Configurar Gemini

Gemini requiere Node.js y una clave de API de Gemini. La clave se introduce en el servidor local y no se guarda dentro de la extensión.

1. Abre PowerShell en la carpeta `lol-edge-assistant`.
2. Ejecuta:

   ```powershell
   .\start-gemini-server.ps1
   ```

3. Cuando se solicite, pega tu `GEMINI_API_KEY`. Deja abierta esa ventana mientras uses Gemini.
4. Comprueba que el servidor esté disponible en [http://localhost:8787/health](http://localhost:8787/health). La respuesta debe incluir `"ok": true`.

También puedes iniciar el servidor en segundo plano abriendo `start-gemini-background.cmd`. El lanzador busca Node.js en el `PATH` y te pide la clave si no está configurada. Si no encuentra Node, puedes colocar `node.exe` dentro de una carpeta `runtime` junto al lanzador. Para consultar los registros, abre `show-gemini-log.cmd`; para detenerlo, abre `stop-gemini-background.cmd`.

La extensión envía al servidor local el texto de la pregunta, las opciones disponibles y, cuando corresponda, los espacios y sus opciones. El servidor remite esa información a la API de Gemini usando tu clave. Si Gemini no está disponible, las preguntas sencillas pueden usar una pequeña base local incluida; los ejercicios con varios espacios necesitan Gemini.

## Usar la extensión

1. Abre una página con una pregunta compatible y pon el cursor sobre el enunciado o una de sus opciones. Para una pregunta de escritura, también puedes enfocar su campo.
2. Usa el atajo que corresponda:

   | Atajo | Dónde usarlo | Qué hace |
   | --- | --- | --- |
   | `Alt + L` | Sobre una pregunta o una de sus opciones; también con el campo de respuesta enfocado. | Analiza esa pregunta y aplica la respuesta. En preguntas con varios espacios, intenta completarlos todos. |
   | `Alt + S` | Cuando hay varias preguntas juntas o `Alt + L` no identifica bien una. | Inicia la selección de área. Arrastra un rectángulo que incluya el enunciado y las opciones de una sola pregunta; al soltar, la analiza. |
   | `Alt + N` | Sobre una pregunta con varios espacios, o con un campo de respuesta enfocado. | Analiza y completa un espacio por pulsación, en orden. Espera a que termine cada paso antes de pulsarlo otra vez. |
   | `Ctrl + Shift + L` | En cualquier lugar de la pestaña de la pregunta, con el cursor sobre ella o con su campo enfocado. | Atajo de Edge para analizar la pregunta actual; funciona como alternativa a `Alt + L`. Si no está disponible, configúralo en `edge://extensions/shortcuts`. |

También puedes abrir el menú de la extensión y elegir **Analizar pestaña** para analizar la pregunta bajo el cursor o enfocada.

En el menú de la extensión, **Mostrar resultados y avisos** controla todas las tarjetas de la página, incluidos pasos, estados, errores y guías manuales. **Mostrar justificación** controla la explicación de la respuesta. Ambas opciones están desactivadas por defecto; con las dos desactivadas, la página no muestra avisos ni tarjetas. La extensión todavía puede aplicar las respuestas compatibles. En Moodle, espera a que termine el llenado antes de hacer clic o escribir; una acción tuya detiene el proceso. Revisa siempre la respuesta y envía o comprueba la actividad por tu cuenta.

## Solución de problemas

- **No aparece respuesta de Gemini:** confirma que el servidor siga abierto y revisa `http://localhost:8787/health`.
- **La pregunta no se detecta bien:** coloca el cursor sobre el enunciado o una opción y vuelve a pulsar `Alt + L`. Si hay preguntas juntas, usa `Alt + S` para seleccionar solo una.
- **Aparece “Extension context invalidated”:** abre `edge://extensions`, recarga la extensión y después recarga la página de la pregunta con `F5`.
- **La respuesta no se coloca en un menú o arrastre:** ese control puede ser personalizado o no compatible. Usa la respuesta o guía mostrada para completarlo manualmente.
- **Se modificó una respuesta mientras Gemini respondía:** la extensión conserva el cambio manual; vuelve a analizar para continuar.

Después de actualizar los archivos, pulsa **Recargar** en `edge://extensions` y recarga también la página de la pregunta. Reinicia el servidor local solo si modificaste sus archivos o configuración.

## Privacidad y alcance

La extensión procesa el texto de la pregunta y las opciones que detecta en la página. Cuando Gemini está configurado, ese contenido se envía desde el servidor local a la API de Gemini. No se envían imágenes en esta versión. Protege tu clave de API y evita usar la extensión con información que no quieras compartir con ese servicio.
