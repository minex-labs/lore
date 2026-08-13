---
id: amend-trail-lives-in-git
what: Record an amendment in the git diff, not in the frontmatter
scope: [format]
status: active
date: 2026-08-13
source: reporte de uso en dos repos con 19 decisiones, 2026-08-13
---

## Why

Una enmienda ES un diff: dice que cambio, no solo que algo cambio. Un campo `amended: fecha`
diria menos y costaria un cambio de formato con 19 decisiones ya cargadas en dos repos. Distinto
del caso de la procedencia por el inbox, donde medimos que git no sirve: ahi el hecho a
registrar desaparece al colapsar los commits, aca el hecho es el diff mismo.

## Rejected

- **Un campo `amended` en el frontmatter** — hace visible la enmienda al abrir el archivo, pero
  registra menos que el diff y toca el formato para guardar un dato sobre el que no se puede
  automatizar nada
