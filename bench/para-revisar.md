# Casos a revisar

Estos son los 96 casos del banco que quedaron con `seguro: false` en
`bench/etiquetas.json`: la descripción y el resumen no alcanzaron para decidir el tipo con
confianza. Están ordenados por la etiqueta propuesta.

## Cómo corregir

1. Buscá el id en `bench/etiquetas.json`.
2. Si la etiqueta propuesta está mal, cambiá `tipo` por uno de los 9:
   `review-final`, `review`, `re-review`, `build-large`, `build-small`, `fix`,
   `explore`, `research`, `write`.
3. Si la etiqueta (corregida o no) ya te convence, poné `"seguro": true`. La `nota` se puede
   dejar o borrar.

Este archivo es solo una vista: la fuente de verdad es `bench/etiquetas.json`. No hace falta
actualizar esta tabla al corregir.

La columna *regla* es lo que dice hoy la regla por descripción (`build` es build sin tamaño;
`—` es que ninguna regla aplica). El resumen es el largo del prompt, los archivos que nombra,
los pasos y si menciona un spec o plan.

| id | descripción | subagentType | resumen | regla | propuesta | nota |
|---|---|---|---|---|---|---|
| c0439 | Revision del arreglo de T8 | general-purpose | 7.0k · 7 arch · 10 pasos · spec | review | **review** | revisa un arreglo de T8: podría ser re-review |
| c0651 | Review merge resolution (opus xhigh) | revisor-final-opus-xhigh | 2.8k · 7 arch · 0 pasos | review-final | **review** | la regla (subagentType revisor-final) dice review-final, pero revisa solo la resolución de un merge |
| c0032 | Implement Task 5: saldos query | general-purpose | 4.7k · 8 arch · 0 pasos · spec | build | **build-large** | 4.7k y 8 archivos: en el borde |
| c0037 | Implement Task 7: markers and reformulation | general-purpose | 3.6k · 10 arch · 0 pasos · spec | build | **build-large** | 3.6k pero 10 archivos |
| c0084 | Implement Task 4: soporte y validador | general-purpose | 3.2k · 11 arch · 4 pasos · spec | build | **build-large** | 3.2k pero 11 archivos |
| c0137 | Implement Task 3: generator per migration | general-purpose | 3.8k · 13 arch · 0 pasos | build | **build-large** | 3.8k pero 13 archivos |
| c0141 | Implement Task 5: count against the ERP | general-purpose | 4.4k · 9 arch · 0 pasos | build | **build-large** | 4.4k y 9 archivos: en el borde |
| c0164 | Implement Task 6: ranking en el compilador | general-purpose | 3.3k · 13 arch · 0 pasos · spec | build | **build-large** | 3.3k pero 13 archivos y toca el compilador |
| c0168 | Implement Task 7: ranking en respuesta y prompt | general-purpose | 3.4k · 10 arch · 0 pasos · spec | build | **build-large** | 3.4k pero 10 archivos |
| c0172 | Implement Task 8: umbral pedido y lectura | general-purpose | 3.5k · 13 arch · 0 pasos · spec | build | **build-large** | 3.5k pero 13 archivos |
| c0190 | Implement Task 4: eje y presencia | general-purpose | 3.4k · 13 arch · 3 pasos · spec | build | **build-large** | 3.4k pero 13 archivos |
| c0205 | Implement Task 9b: facturas por chat | general-purpose | 3.1k · 11 arch · 3 pasos · spec | build | **build-large** | 3.1k pero 11 archivos |
| c0227 | Implement Task 4: lectura de la comparación | general-purpose | 3.9k · 10 arch · 5 pasos · spec | build | **build-large** | 3.9k y 10 archivos: en el borde |
| c0267 | Task 4: corredor punta a punta | general-purpose | 3.0k · 11 arch · 7 pasos · spec | build | **build-large** | 3.0k pero 11 archivos y es un corredor punta a punta |
| c0286 | Task 4: medición de entidades | general-purpose | 3.3k · 10 arch · 7 pasos · spec | build | **build-large** | 3.3k pero 10 archivos |
| c0307 | Implement Task 5: fixtures y AGENTS.md | general-purpose | 6.0k · 6 arch · 6 pasos | build | **build-large** | 6.0k, pero fixtures y AGENTS.md suenan a algo acotado |
| c0309 | Implement Task 6: ADR 0052 y puertas de CI | general-purpose | 8.1k · 8 arch · 6 pasos · spec | build | **build-large** | 8.1k; mezcla un ADR (write) con puertas de CI |
| c0318 | T2: las mediciones de clasificación | general-purpose | 5.3k · 6 arch · 3 pasos · spec | build | **build-large** | 5.3k pero solo 6 archivos |
| c0334 | Implement Task 2: snapshot comparator | general-purpose | 5.8k · 5 arch · 7 pasos | build | **build-large** | 5.8k pero solo 5 archivos |
| c0383 | Implement Tarea 4: session per account | general-purpose | 3.2k · 23 arch · 0 pasos · spec | build | **build-large** | 3.2k pero 23 archivos |
| c0391 | Implement Tarea 5: login screens and routes | general-purpose | 3.2k · 15 arch · 2 pasos · spec | build | **build-large** | 3.2k pero 15 archivos; pantallas y rutas |
| c0394 | Implement Tarea 6: Configuración and Mi cuenta | general-purpose | 3.3k · 12 arch · 0 pasos · spec | build | **build-large** | 3.3k pero 12 archivos |
| c0417 | Implement Task 5: el sondeo | general-purpose | 4.3k · 9 arch · 7 pasos · spec | build | **build-large** | 4.3k y 9 archivos: en el borde |
| c0481 | Implement Task 3: spans a la base | general-purpose | 3.8k · 12 arch · 1 pasos · spec | build | **build-large** | 3.8k y 12 archivos: en el borde |
| c0484 | Implement Task 4: latido y sesión de la vuelta | general-purpose | 3.7k · 12 arch · 1 pasos · spec | build | **build-large** | 3.7k y 12 archivos: en el borde |
| c0502 | Implement Task 10: cierre de la tanda 1 | general-purpose | 5.6k · 14 arch · 3 pasos · spec | build | **build-large** | 5.6k y 14 archivos, pero "cierre de la tanda" puede ser acotado |
| c0518 | Implementar T6: comando --responde | general-purpose | 3.5k · 16 arch · 4 pasos · spec | build | **build-large** | 3.5k pero 16 archivos |
| c0520 | Implementar T10a: lector de aclaración | general-purpose | 3.6k · 14 arch · 4 pasos · spec | build | **build-large** | 3.6k pero 14 archivos |
| c0539 | Implementar T9: reformulación y span | general-purpose | 3.6k · 13 arch · 6 pasos · spec | build | **build-large** | 3.6k pero 13 archivos |
| c0564 | Implement Task 5: línea final declara cliente | general-purpose | 3.7k · 12 arch · 0 pasos · spec | build | **build-large** | 3.7k pero 12 archivos |
| c0584 | Implement Task 3: esquema del YAML | general-purpose | 5.6k · 6 arch · 0 pasos | build | **build-large** | 5.6k pero solo 6 archivos; un esquema YAML |
| c0586 | Implement Task 4: los cuatro campos del pedido | general-purpose | 5.9k · 5 arch · 3 pasos | build | **build-large** | 5.9k pero solo 5 archivos |
| c0589 | Implement Task 5: soporte por familia | general-purpose | 5.6k · 6 arch · 2 pasos | build | **build-large** | 5.6k pero solo 6 archivos |
| c0592 | Implement Task 6: ventas.yaml | general-purpose | 7.8k · 6 arch · 0 pasos · spec | build | **build-large** | 7.8k pero es un archivo YAML de datos |
| c0621 | Implement Tarea 1: producto | general-purpose | 4.2k · 7 arch · 3 pasos · spec | build | **build-large** | 4.2k y 7 archivos: en el borde |
| c0697 | Implement Task 9: línea y panel | general-purpose | 3.3k · 11 arch · 3 pasos | build | **build-large** | 3.3k pero 11 archivos |
| c0714 | Implement F2 Task 5: conectar clasificadores | general-purpose | 3.6k · 10 arch · 3 pasos | build | **build-large** | 3.6k pero 10 archivos; integra los clasificadores |
| c0035 | Implement Task 6: saldos YAML | general-purpose | 3.5k · 7 arch · 0 pasos · spec | build | **build-small** | 7 archivos pero prompt de 3.5k y parece acotado (YAML) |
| c0056 | T3 la cola | general-purpose | 2.9k · 8 arch · 5 pasos · spec | build | **build-small** | 8 archivos pero prompt de 2.9k |
| c0057 | T4 el registro del log | general-purpose | 3.3k · 7 arch · 6 pasos · spec | build | **build-small** | 7 archivos pero prompt de 3.3k |
| c0066 | T6 el comando preguntar | general-purpose | 3.3k · 9 arch · 7 pasos · spec | build | **build-small** | 9 archivos pero prompt de 3.3k |
| c0067 | T9 entrante encola | general-purpose | 3.0k · 9 arch · 6 pasos · spec | build | **build-small** | 9 archivos pero prompt de 3.0k |
| c0083 | Implement Task 2: lectura trimestre | general-purpose | 2.9k · 10 arch · 4 pasos · spec | build | **build-small** | 10 archivos pero prompt de 2.9k |
| c0093 | Implement Task 6: paso 1 y oro | general-purpose | 2.8k · 10 arch · 4 pasos · spec | build | **build-small** | 10 archivos pero prompt de 2.8k |
| c0120 | Implement Task 7: banco y preguntas de oro | general-purpose | 3.8k · 8 arch · 0 pasos · spec | build | **build-small** | 3.8k y 8 archivos: en el borde |
| c0135 | Implement Task 2 Steps 4-6: snapshot pins | general-purpose | 3.8k · 7 arch · 0 pasos | build | **build-small** | 7 archivos pero solo los pasos 4-6 de una tarea, 3.8k |
| c0151 | Implement Task 1: filtro por tercero | general-purpose | 2.8k · 10 arch · 0 pasos | build | **build-small** | 10 archivos pero prompt de 2.8k |
| c0161 | Implement Task 5: palabra, linea, punta a punta | general-purpose | 3.1k · 7 arch · 0 pasos · spec | build | **build-small** | 3.1k y 7 archivos; "punta a punta" sugiere integración |
| c0176 | Implement Task 9: umbral consulta y linea | general-purpose | 3.5k · 9 arch · 0 pasos · spec | build | **build-small** | 3.5k y 9 archivos: en el borde |
| c0197 | Implement Task 8a: saldos comparar | general-purpose | 2.5k · 11 arch · 3 pasos · spec | build | **build-small** | 11 archivos pero prompt de 2.5k |
| c0199 | Implement Task 7: presencia | general-purpose | 2.9k · 10 arch · 3 pasos · spec | build | **build-small** | 10 archivos pero prompt de 2.9k |
| c0231 | Implement Task 6: clasificación de pagos | general-purpose | 3.5k · 9 arch · 4 pasos · spec | build | **build-small** | 3.5k y 9 archivos: en el borde |
| c0233 | Implement Task 3: soporte de flujo | general-purpose | 3.4k · 8 arch · 4 pasos · spec | build | **build-small** | 3.4k y 8 archivos: en el borde |
| c0279 | Task 2: cliente de Jev | general-purpose | 2.2k · 14 arch · 5 pasos · spec | build | **build-small** | 14 archivos pero prompt de 2.2k; un cliente nuevo puede ser grande |
| c0287 | Task 6: paso 1 con Jev | general-purpose | 2.9k · 11 arch · 6 pasos · spec | build | **build-small** | 11 archivos pero prompt de 2.9k |
| c0291 | Instrucción de entidades y regla D | general-purpose | 2.3k · 7 arch · 3 pasos | — | **build-small** | regla null; ajustar una instrucción de prompt: build-small o write |
| c0317 | T1: el esquema neteo | general-purpose | 4.4k · 5 arch · 3 pasos · spec | build | **build-small** | 4.4k y 5 archivos: en el borde |
| c0330 | Tipar el nota_neteo de la fila de detalle | general-purpose | 5.9k · 5 arch · 0 pasos | — | **build-small** | regla null; tipar un campo es acotado, pero el prompt es de 5.9k |
| c0355 | Implement Task 10: recreate the VM database | general-purpose | 7.7k · 2 arch · 1 pasos · spec | build | **build-small** | recrear la base es operar más que implementar; 7.7k pero 2 archivos |
| c0382 | Implement Tarea 3: ingreso data layer | general-purpose | 2.6k · 17 arch · 0 pasos · spec | build | **build-small** | 17 archivos pero prompt de 2.6k |
| c0396 | Implement Tarea 8: cleanup and rules | general-purpose | 2.6k · 20 arch · 0 pasos · spec | build | **build-small** | 20 archivos pero prompt de 2.6k; limpieza |
| c0446 | El filtro de res.partner al dominio | general-purpose | 5.7k · 3 arch · 0 pasos · spec | — | **build-small** | regla null; agregar un filtro es acotado, pero el prompt es de 5.7k |
| c0453 | Implementar T1: filtro de tercero | general-purpose | 2.7k · 10 arch · 0 pasos · spec | build | **build-small** | 10 archivos pero prompt de 2.7k |
| c0454 | Implementar T2: palabra de D3 | general-purpose | 3.0k · 12 arch · 0 pasos · spec | build | **build-small** | 12 archivos pero prompt de 3.0k |
| c0479 | Implement Task 2: latido y estadoDelTrabajo | general-purpose | 3.6k · 9 arch · 3 pasos · spec | build | **build-small** | 3.6k y 9 archivos: en el borde |
| c0510 | Implementar T1: lectura de la pregunta | general-purpose | 3.4k · 7 arch · 4 pasos · spec | build | **build-small** | 3.4k y 7 archivos: en el borde |
| c0511 | Implementar T2: migración 0017 | general-purpose | 3.0k · 12 arch · 3 pasos | build | **build-small** | 12 archivos pero una migración de 3.0k |
| c0512 | Implementar T3: vocabulario de la instancia | general-purpose | 3.1k · 8 arch · 3 pasos | build | **build-small** | 3.1k y 8 archivos: en el borde |
| c0575 | Integrate master into tercero branch | general-purpose | 3.3k · 15 arch · 0 pasos · spec | — | **build-small** | regla null; integrar master es un merge con conflictos, no encaja bien en ningún tipo |
| c0618 | Los dos huecos que faltan marcar | general-purpose | 5.8k · 7 arch · 0 pasos · spec | — | **build-small** | regla null; "marcar dos huecos" suena acotado pero el prompt es de 5.8k y no queda claro qué hace |
| c0642 | Implement Tarea 12: docs y renumerado | general-purpose | 2.8k · 8 arch · 6 pasos · spec | build | **build-small** | "docs y renumerado": build-small o write |
| c0650 | Merge origin/master into branch | general-purpose | 2.3k · 7 arch · 3 pasos | — | **build-small** | regla null; un merge de master no encaja bien en ningún tipo |
| c0667 | Tarea 3: paginación keyset | general-purpose | 4.3k · 6 arch · 0 pasos · spec | build | **build-small** | 4.3k y 6 archivos: en el borde |
| c0670 | Tarea 4: relevamiento de esquema | general-purpose | 4.4k · 6 arch · 0 pasos · spec | build | **build-small** | 4.4k y 6 archivos: en el borde |
| c0699 | Implement Task 10: verificación en vivo | general-purpose | 4.0k · 5 arch · 0 pasos · spec | build | **build-small** | verificación en vivo: más probar y anotar que implementar |
| c0274 | TZ local en el script del banco | general-purpose | 1.3k · 3 arch · 0 pasos | — | **fix** | regla null; ajustar la zona horaria parece un bug puntual, pero puede ser build-small |
| c0328 | Los dos cabos sueltos de comentarios | general-purpose | 3.7k · 9 arch · 0 pasos | — | **fix** | regla null; "cabos sueltos de comentarios" suena a arreglar hallazgos |
| c0531 | T1 ronda 4 (implementador nuevo) | general-purpose | 5.5k · 9 arch · 4 pasos | build | **fix** | regla build; "ronda 4 (implementador nuevo)" suena a otra ronda de arreglos de T1, pero con implementador nuevo y 5.5k puede ser rehacer la tarea (build-large) |
| c0275 | Investigar timeout de la P5-2 | general-purpose | 3.0k · 4 arch · 3 pasos | research | **explore** | la regla dice research, pero investigar un timeout propio es depurar código, no buscar en la web |
| c0320 | Investigar las 486 líneas entry | general-purpose | 5.1k · 2 arch · 2 pasos | research | **explore** | la regla dice research, pero investigar líneas de datos propios es explorar, no buscar en la web |
| c0329 | El contraste contra el ERP, sin escribir nada | general-purpose | 6.7k · 6 arch · 4 pasos · spec | — | **explore** | regla null; contrastar contra el ERP sin escribir nada es relevar |
| c0622 | Pre-flight conflict scan of the plan | general-purpose | 2.7k · 6 arch · 4 pasos · spec | — | **explore** | regla null; escanear un plan contra el repo buscando conflictos: explore o review |
| c0674 | Tarea 5: relevar contra el ERP real | general-purpose | 4.3k · 8 arch · 0 pasos · spec | build | **explore** | regla build; "relevar contra el ERP real" puede ser correr el relevador (explore) o implementarlo |
| c0508 | Probar parsers de fechas en castellano | general-purpose | 3.9k · 0 arch · 4 pasos | — | **research** | regla null; probar librerías puede ser research o un build de prueba |
| c0728 | El nombre en castellano | general-purpose | 2.9k · 0 arch · 0 pasos | — | **research** | regla null; puede ser investigar o redactar propuestas de nombre (write) |
| c0009 | Generador de KB desde la guía | general-purpose | 4.7k · 8 arch · 5 pasos | — | **write** | "Generador de KB" puede ser un script (build) o redactar la KB (write) |
| c0039 | Implement Task 8: docs | general-purpose | 2.8k · 5 arch · 0 pasos · spec | build | **write** | Task de plan cuyo contenido es docs: write o build-small |
| c0356 | Implement Task 11: documentation corrections | general-purpose | 9.7k · 13 arch · 7 pasos · spec | build | **write** | regla build, pero la tarea son correcciones de documentación |
| c0413 | Implement Task 14: correcciones de docs | general-purpose | 5.2k · 8 arch · 12 pasos · spec | build | **write** | regla build, pero la tarea son correcciones de docs |
| c0448 | DDL completo de los esquemas | general-purpose | 3.3k · 10 arch · 4 pasos | — | **write** | regla null; puede ser redactar el DDL para un plan (write) o implementarlo (build) |
| c0449 | Configuración de CI en dos niveles | general-purpose | 2.1k · 7 arch · 7 pasos | — | **write** | regla null; puede ser redactar la sección de CI de un plan (write) o implementarla (build) |
| c0450 | Banco de arranque del golden set | general-purpose | 2.4k · 4 arch · 5 pasos | — | **write** | regla null; puede ser redactar el banco para un plan (write) o armarlo (build) |
| c0529 | Implementar T11: ADR 0060 y AGENTS.md | general-purpose | 4.2k · 7 arch · 5 pasos · spec | build | **write** | regla build, pero la tarea es un ADR y AGENTS.md |
| c0559 | Implement Task 8: documentación | general-purpose | 5.1k · 8 arch · 0 pasos · spec | build | **write** | regla build, pero la tarea es documentación |
| c0601 | Implement Task 14: correcciones de documentacion | general-purpose | 6.3k · 10 arch · 0 pasos · spec | build | **write** | regla build, pero la tarea son correcciones de documentación |
| c0656 | Forma del pedido y la respuesta | general-purpose | 1.9k · 5 arch · 7 pasos | — | **write** | regla null; parece redactar una sección de diseño (serie de ADRs y spec), pero podría ser build |

## Builds con muchos archivos etiquetados como chicos (seguros)

Estos 32 casos están como `build-small` con `seguro: true`, aunque el ancla vieja (más de 5000 caracteres o más de 6 archivos) los llamaría grandes. Están chicos porque `archivos` cuenta los archivos que el prompt *nombra* (spec, plan, contexto), no los que la tarea toca, y el prompt es corto y la descripción acotada.
Si alguno te parece grande, cambiá su `tipo` a `build-large` en `bench/etiquetas.json`.

| id | descripción | chars | archivos |
|---|---|---:|---:|
| c0631 | Implement Tarea 7: agrupar por tercero | 2072 | 14 |
| c0630 | Implement Tarea 6: el N del ranking | 1856 | 12 |
| c0384 | Implement Tarea 7: first admin command | 1905 | 11 |
| c0278 | Task 1: timeout del puerto | 1731 | 10 |
| c0636 | Implement Tarea 9: tabla del ranking | 1739 | 10 |
| c0637 | Implement Tarea 10: línea final ranking | 1818 | 10 |
| c0163 | Implement Task 5b: fecha como marcador | 2537 | 9 |
| c0195 | Implement Task 6: ranking de meses | 2787 | 9 |
| c0365 | Real data for Definiciones | 1720 | 9 |
| c0513 | Implementar T4: la reformulación | 2647 | 9 |
| c0536 | Implementar T1b: acotante lejos del mes | 2472 | 9 |
| c0690 | Implement Task 6: la decisión | 2452 | 9 |
| c0157 | Implement Task 4: D7 descripcion paso 1 | 2478 | 8 |
| c0253 | Task 1b: casos iteracion-a y b | 2197 | 8 |
| c0254 | Task 1c: casos sellado y reservado | 1934 | 8 |
| c0256 | Task 3: tabla corrida_de_banco | 1563 | 8 |
| c0379 | Implement Tarea 2: migration 0021 | 1980 | 8 |
| c0640 | Implement Tarea 11: ranking en pipeline | 2577 | 8 |
| c0711 | Implement F2 Task 4: tope y sombra | 2121 | 8 |
| c0717 | Implement F2 Task 6: extraer casos | 2387 | 8 |
| c0188 | Implement Task 5: saldos por cuenta | 2733 | 7 |
| c0193 | Implement Task 9a: lista de comprobantes | 2928 | 7 |
| c0252 | Task 1: test y casos dev | 1985 | 7 |
| c0255 | Task 2: paso 1 y llamadas en log | 1589 | 7 |
| c0281 | Task 5: migración 0021 | 1401 | 7 |
| c0366 | Real data for Datos | 1281 | 7 |
| c0369 | Real data for Inicio | 1375 | 7 |
| c0372 | Real data for Veredictos | 1504 | 7 |
| c0545 | Implementar T14: descartar opcionales | 1959 | 7 |
| c0626 | Implement Tarea 4: ventas filtra producto | 1584 | 7 |
| c0634 | Implement Tarea 8: ranking compiler | 2146 | 7 |
| c0709 | Implement F2 Task 3: clasificador Jev | 1812 | 7 |
