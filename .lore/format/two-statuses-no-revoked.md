---
id: two-statuses-no-revoked
what: Allow only active and superseded; retiring something is itself a decision
scope: [format]
status: active
date: 2026-08-11
source: revisión del plan, punto 1
---

## Why

Nadie abre un archivo superado, así que un estado terminal sin sucesora no protege a nadie. Dar
de baja algo es decidir: se escribe su propia decisión y supersede a la vieja, lo que deja un
invariante verificable — toda decisión retirada apunta a una viva.

## Rejected

- **Un estado `revoked` con destino obligatorio** — tapaba el agujero pidiendo a dónde va el
  descarte, pero agrega un valor al enum que todos los comandos tienen que filtrar para ganar lo
  mismo que da add + supersede
