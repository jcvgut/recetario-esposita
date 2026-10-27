# El recetario de mi esposita ♡

Aplicación web instalable, en español, con diseño inspirado en iPhone. Se publica como archivos estáticos en GitHub Pages; no necesita servidor de datos, cuentas ni dependencias externas.

## Instalar en el iPhone
1. Abrir la dirección publicada en Safari (no el enlace del repositorio).
2. Compartir → Añadir a pantalla de inicio → Añadir.
3. Abrir el nuevo icono con internet una vez. En «Tu recetario», esperar a que indique «Lista para crear y consultar recetas e imágenes sin conexión».
4. Activar modo avión, cerrar y volver a abrir el icono. Crear una receta de prueba, agregar una foto, guardarla y volver a consultarla.

## Funciones
Crear, editar, eliminar con confirmación, buscar sin distinguir tildes ni mayúsculas, marcar favoritas, guardar una foto o captura opcional, recuperar borradores y exportar/importar copias de seguridad con imágenes. La restauración añade las recetas y evita duplicados exactos; se realiza en una sola transacción. Admite copias JSON de la aplicación Android anterior.

## Datos privados y copias
Las recetas e imágenes se guardan en IndexedDB del dispositivo; nunca se envían al repositorio. La dirección de la aplicación y su código son públicos. No hay analítica, anuncios, tipografías externas ni sincronización entre equipos.

Safari y la aplicación añadida a la pantalla de inicio pueden tener espacios de almacenamiento separados: utilizar siempre el icono instalado y recuperar allí la copia de seguridad. No eliminar los datos del sitio ni desinstalar sin respaldar. El almacenamiento web puede eliminarse; no se garantiza su conservación indefinida. Mantener copias externas.

En «Tu recetario → Guardar una copia», elegir «Guardar en Archivos» o compartir con iCloud Drive/Google Drive. Exportar no confirma por sí solo que el usuario guardó el archivo; comprobar que aparece en la ubicación elegida. Las copias incluyen todas las fotos y no están cifradas. La nube solo se utiliza si el usuario decide guardar allí el respaldo.

Título: hasta 300 caracteres; texto: hasta 100.000; imagen de entrada: hasta 30 MB, reducida a 1600 píxeles y JPEG; copia completa: hasta 100 MB. Depende del espacio disponible del dispositivo.

## Publicar
En Settings → Pages, seleccionar «Deploy from a branch», rama `main`, carpeta `/(root)` y guardar. Conservar `.nojekyll` en la raíz. HTTPS debe estar activado.

## Verificación
Comprobados en navegador de escritorio: crear y leer receta, favorita, recarga y búsqueda sin tildes. Pruebas automatizadas de validación, respaldo Android, exportación/importación, persistencia, edición, borrador, eliminación y transacciones atómicas. Falta comprobar instalación, selector de imágenes, exportación a Archivos y modo avión en el iPhone físico.

Los recursos de interfaz se incluyen en la caché de un service worker. El estado «lista sin internet» aparece tras su activación; al actualizar los recursos, incrementar la versión de CACHE en sw.js. Los datos de recetas están separados de la caché y no se borran durante una actualización de interfaz.
