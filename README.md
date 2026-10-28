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

También puedes iniciar el servidor en segundo plano con `start-gemini-background.cmd`, consultar sus registros con `show-gemini-log.cmd` y detenerlo con `stop-gemini-background.cmd`.

La extensión envía al servidor local el texto de la pregunta, las opciones disponibles y, cuando corresponda, los espacios y sus opciones. El servidor remite esa información a la API de Gemini usando tu clave. Si Gemini no está disponible, las preguntas sencillas pueden usar una pequeña base local incluida; los ejercicios con varios espacios necesitan Gemini.

## Usar la extensión

1. Abre una página con una pregunta compatible.
2. Pon el cursor sobre la pregunta o una de sus opciones, o enfoca el campo que quieres analizar.
3. Usa el atajo adecuado:

   | Atajo | Acción |
   | --- | --- |
   | `Alt + L` | Analiza y completa la pregunta bajo el cursor o enfocada. |
   | `Alt + S` | Selecciona un área: arrastra un rectángulo alrededor de una pregunta para analizarla. |
   | `Alt + N` | En preguntas con varios espacios, analiza y completa el siguiente espacio. |

También puedes hacer clic en el icono de la extensión y elegir **Analizar pestaña**. Para preguntas con varios espacios, `Alt + L` completa la pregunta entera; `Alt + N` avanza un espacio por pulsación. Espera a que termine cada paso antes de continuar.

En el menú de la extensión puedes activar **Mostrar resultado** y **Mostrar justificación**. Si la extensión no puede completar una respuesta automáticamente, puede mostrar una guía para que la coloques manualmente. En Moodle, espera a que termine el llenado antes de hacer clic o escribir; una acción tuya detiene el proceso. Revisa siempre la respuesta y envía o comprueba la actividad por tu cuenta.

## Solución de problemas

- **No aparece respuesta de Gemini:** confirma que el servidor siga abierto y revisa `http://localhost:8787/health`.
- **La pregunta no se detecta bien:** coloca el cursor sobre el enunciado o una opción y vuelve a pulsar `Alt + L`. Si hay preguntas juntas, usa `Alt + S` para seleccionar solo una.
- **Aparece “Extension context invalidated”:** abre `edge://extensions`, recarga la extensión y después recarga la página de la pregunta con `F5`.
- **La respuesta no se coloca en un menú o arrastre:** ese control puede ser personalizado o no compatible. Usa la respuesta o guía mostrada para completarlo manualmente.
- **Se modificó una respuesta mientras Gemini respondía:** la extensión conserva el cambio manual; vuelve a analizar para continuar.

Después de actualizar los archivos, pulsa **Recargar** en `edge://extensions` y recarga también la página de la pregunta. Reinicia el servidor local solo si modificaste sus archivos o configuración.

## Privacidad y alcance

La extensión procesa el texto de la pregunta y las opciones que detecta en la página. Cuando Gemini está configurado, ese contenido se envía desde el servidor local a la API de Gemini. No se envían imágenes en esta versión. Protege tu clave de API y evita usar la extensión con información que no quieras compartir con ese servicio.
