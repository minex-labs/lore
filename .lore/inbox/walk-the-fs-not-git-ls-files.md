---
id: walk-the-fs-not-git-ls-files
what: List repo files by walking the filesystem, never by shelling out to git
scope: [cli]
status: active
date: 2026-08-21
source: "reporte de agente 2026-08-21: 'Usar git ls-files en vez de caminar el FS. lore ya vive en un repo git'"
paths: [source/lib/check.ts]
---

## Why

El chequeo de globs necesita saber qué archivos hay. `git ls-files` es más rápido y respeta
.gitignore, pero convierte a git en un requisito de `lore check` y cambia la pregunta: un
archivo nuevo sin trackear pasaría a reportarse como 'glob matches no file', que es el mismo
falso negativo que queríamos eliminar. El walk propio anda igual en un tarball que en un clone,
y frena en cualquier directorio con su propio `.git` — la misma frontera de repo que ya usa el
lookup de `.lore/`.

## Rejected

- **git ls-files** — haría de git una dependencia de runtime y reportaría como 'no existe' a
  todo archivo no trackeado
- **Agregar .mintree y compañía a IGNORED_DIRS** — parche por herramienta: el próximo directorio
  grande sin ignorar reabre la clase entera
