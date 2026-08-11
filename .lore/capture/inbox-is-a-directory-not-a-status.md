---
id: inbox-is-a-directory-not-a-status
what: Gate agent proposals with an inbox directory, not a status value
scope: [capture]
status: active
date: 2026-08-11
source: cambio de alcance, punto 3
paths: [source/lib/store.ts, source/commands/review.ts]
---

## Why

El loader sólo lee `.lore/<área>/*.md` y `inbox` no es un área. Esa única regla es la razón de
que una propuesta no pueda filtrarse al índice, a un listado ni a `lore for`: ningún comando
tiene un filtro que olvidar.

## Rejected

- **Un estado `proposed` que el índice no lista** — funciona igual de bien hasta que alguien
  agrega un comando nuevo y se olvida de filtrarlo, y ahí la propuesta se cuela en el lore sin
  que nadie lo note
