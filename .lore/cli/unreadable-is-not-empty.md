---
id: unreadable-is-not-empty
what: Make a file that cannot be parsed a loud error, never a silent skip
scope: [cli]
status: active
date: 2026-08-15
source: reporte de operacion en dos repos, 2026-08-15
paths: [source/commands/review.ts, source/lib/check.ts]
---

## Why

`check` globeaba el directorio y contaba; `review` parseaba y descartaba lo ilegible. Dos
mediciones del mismo hecho que nunca se enfrentaban, las dos con RC=0: el operador leia '4
propuestas esperando' y `review` le ofrecia 2. Un guard tiene que distinguir 'no habia nada' de
'no pude leerlo' - tres estados, no dos.

## Rejected

- **Dejar que `review` saltee en silencio** — es el comportamiento comodo y nunca molesta a
  nadie, pero hace que una propuesta impromovible se vea identica a un inbox vacio
- **Reportarlo como warning en vez de error** — seria coherente con el trato que reciben los
  globs muertos, pero un archivo ilegible no es rot probable: es una decision registrada sobre
  la que ningun comando puede actuar
