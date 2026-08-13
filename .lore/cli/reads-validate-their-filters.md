---
id: reads-validate-their-filters
what: Refuse an unknown filter value on read commands, never answer with an empty list
scope: [cli]
status: active
date: 2026-08-13
source: reporte de operacion en dos repos, 2026-08-13
paths: [source/commands/list.ts]
---

## Why

Un scope que nadie declaro se ve identico a un scope sin decisiones, y 'no hay decisiones' es la
respuesta que recibe un typo. `--status` ya rechazaba un valor desconocido en vez de listar
nada; esto es la misma regla aplicada a `--scope`. Un cero que no distingue 'no hay' de
'preguntaste mal' es la clase de error mas cara que mide este proyecto.

## Rejected

- **Dejar que `--scope` desconocido devuelva lista vacia** — es lo que hacen casi todos los CLIs
  y no rompe nada, pero hace que un typo y un area vacia sean indistinguibles justo cuando el
  usuario esta buscando algo que cree que existe
- **Validar solo contra las areas declaradas en config.yml** — seria mas estricto y coherente
  con lo que valida `add`, pero un lore armado a mano tiene areas con decisiones sin declarar y
  el comando de lectura les respondria que no existen
