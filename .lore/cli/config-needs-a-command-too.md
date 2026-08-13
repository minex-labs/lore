---
id: config-needs-a-command-too
what: Give config.yml a command, because the no-hand-editing rule is aimed at agents
scope: [cli]
status: active
date: 2026-08-13
source: reporte de operacion en dos repos, 2026-08-13
paths: [source/commands/area.ts]
---

## Why

La prohibicion de escribir bajo .lore/ a mano se la escribimos al agente en el bloque de
CLAUDE.md, y es el agente quien sigue el consejo de `lore check` de mover una decision fuera de
global. Sin comando, ese consejo termina en un paso que no tiene permitido dar. El write ya
existia para el add interactivo y para review; esto solo abre la puerta.

## Rejected

- **Declarar que config.yml esta fuera de la regla y documentarlo** — es la respuesta de menos
  superficie y era tentadora, pero deja al agente sin forma de completar una cadena que la
  propia herramienta le recomienda empezar
- **Un subcomando `lore area add <nombre>`** — mas explicito, pero el router es de un nivel y
  agregar sub-subcomandos por una operacion complica la superficie mas de lo que aclara
