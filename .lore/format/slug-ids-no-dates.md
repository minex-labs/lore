---
id: slug-ids-no-dates
what: Identify decisions by slug alone, with no date prefix
scope: [format]
status: active
date: 2026-08-11
source: revisión del plan, punto 3
paths: [source/lib/schema.ts]
---

## Why

El id aparece en cada línea del INDEX, que es el archivo que se lee en todas las sesiones. Sin
fecha es más corto, se cita en un comentario o un PR sin parecer un timestamp, y la búsqueda es
por tema.

## Rejected

- **Fecha + slug (2026-08-11-postgres-over-dynamo)** — resistente a merges paralelos y
  ordenable, pero la fecha ya vive en el frontmatter y engorda cada línea del índice
- **Contador secuencial tipo ADR (0042-...)** — corto y familiar, pero dos branches que agregan
  lore a la vez piden el mismo número y el merge lo resuelve mal en silencio
