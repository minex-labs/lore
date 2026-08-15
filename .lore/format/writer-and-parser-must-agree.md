---
id: writer-and-parser-must-agree
what: Never let line wrapping decide whether lore can read its own file
scope: [format]
status: active
date: 2026-08-15
source: reporte de operacion en dos repos, 2026-08-15, reproducido con un 2x2
paths: [source/lib/decision.ts]
---

## Why

El escritor wrappeaba el bullet entero y partia el `**bold**`; el parser exigia el bold cerrado
en una linea. Un `option` de mas de ~88 caracteres producia un archivo que `lore add` daba por
bueno y `lore review` no podia leer, para siempre. Se arreglan los dos lados: el head nunca se
parte al escribir, y el parser pliega las lineas de un bullet antes de leerlo.

## Rejected

- **Arreglar solo el escritor** — impide generar archivos nuevos rotos pero deja invisibles los
  ya escritos en dos repos de produccion, que era el dano real
- **Arreglar solo el parser** — recupera los archivos existentes pero deja el escritor generando
  markdown que necesita un lector tolerante, y el caso sin espacios dejaba un guion solo en su
  linea que ningun lector razonable acepta
- **Validar en `add` y rechazar options largos** — seria el arreglo mas barato de todos, pero
  mueve al usuario el costo de un defecto de la herramienta y un option largo es legitimo
