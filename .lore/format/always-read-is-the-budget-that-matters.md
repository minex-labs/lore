---
id: always-read-is-the-budget-that-matters
what: Budget the always-read context, not just individual decisions
scope: [format]
status: active
date: 2026-08-13
source: reporte de adopcion en tres repos, 2026-08-13
---

## Why

El bloque que lore inyecta manda leer todo `global` en cada sesion, asi que INDEX.md mas global/
es un costo fijo que paga cada ticket sin importar si le sirve. Una decision larga en un area de
nicho la lee quien toca esa area; una en global la lee todo el mundo, siempre. Medido: 184-393
chars de `## Why` en un lore sano contra 1774-2243 en uno que nadie miro.

## Rejected

- **Solo un presupuesto por decision** — es lo intuitivo y lo mas facil de explicar, pero deja
  pasar el caso que de verdad duele: veinte decisiones aceptables en global suman mas contexto
  fijo que una sola larga en un area de nicho
- **Cobrar tambien el `## Rejected` en el presupuesto por decision** — seria mas fiel a lo que
  el agente lee al abrir el archivo, pero el Rejected es el campo que le da valor al registro y
  suele ser mas largo que el why en un record sano - cobrarlo empuja a recortar la mitad
  equivocada
