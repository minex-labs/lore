---
id: size-is-reported-never-enforced
what: Report decision size as info, never fail a build on it
scope: [cli]
status: active
date: 2026-08-13
source: reporte de adopcion en tres repos, 2026-08-13
paths: [source/lib/check.ts]
---

## Why

Todo lo que lore llama error hace que el lore esté mal: frontmatter roto, un supersede colgado,
un índice viejo. El tamaño no está mal, es caro, y puede estar justificado. La asimetría decide:
`lore check --strict` corre en el gate de merge de repos reales, y un chequeo que falla por
prosa larga se saca del gate llevándose puestos los chequeos que sí atajaban roturas.

## Rejected

- **Warning, que --strict convierte en error** — es la severidad que pedía el reporte, pero un
  merge bloqueado por prosa se arregla sacando --strict del gate, y ese es el peor resultado
  posible
- **Error duro por default** — haría el presupuesto imposible de ignorar, pero convierte una
  medición en un censor y el texto es del humano
- **Un flag --enforce-budget para subirlo a error** — da la vía a quien lo quiera duro, pero
  agrega superficie por un caso que nadie pidió todavía; `check --json` ya expone el dato para
  quien quiera construir su propio gate
