---
id: index-active-only
what: List only active decisions in INDEX.md, one line each
scope: [format]
status: active
date: 2026-08-11
source: revisión del plan, menores
paths: [source/lib/index-file.ts]
---

## Why

Con 200 decisiones el índice deja de ser barato y viola el principio rector. Lo que evita
revivir algo descartado no es su archivo, es el `## Rejected` de la decisión que lo reemplazó.

## Rejected

- **Incluir las superadas en el índice** — resolvería el caso del agente que encuentra un id
  viejo en un comentario, pero eso lo resuelve `lore show` y cuesta una línea por decisión
  muerta en el archivo más caro
- **Duplicar la decisión entera en cada área de su scope** — máximo descubrimiento, pero infla
  el índice; la línea agrupada `Also applies here` da lo mismo por 85 caracteres menos
