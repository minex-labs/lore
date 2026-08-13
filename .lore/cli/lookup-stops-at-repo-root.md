---
id: lookup-stops-at-repo-root
what: Stop the .lore/ lookup at the git repo root, never crossing into another repo
scope: [cli]
status: active
date: 2026-08-13
source: reporte de defectos del agente que evaluó lore en ciudalerta-suite, reproducido en sandbox
paths: [source/lib/store.ts]
---

## Why

Subir es el comportamiento correcto: un paquete de un monorepo tiene que encontrar el .lore/ de
la raíz. Cruzar a OTRO repo no: una decisión registrada parado en un repo anidado se versionaba
en un repo que no la gobierna y que ni siquiera se clona junto con ella. La frontera se detecta
por la existencia de `.git`, archivo o directorio, porque en un worktree y en un submódulo es un
archivo.

## Rejected

- **Dejar que el lookup suba sin límite** — era el comportamiento hasta 0.1.1 y se recomendó
  como feature para un caso de repos anidados, pero medido escribía decisiones en el repo de
  arriba reportando una ruta relativa que parecía local
- **Parar siempre en el directorio actual, sin subir** — cerraría el agujero pero rompe el
  monorepo, que es el caso de uso central; un fix que rompe monorepos se desactiva en una semana
  y se lleva puesto el arreglo real
- **Detectar la raíz con `git rev-parse --show-toplevel`** — resuelve worktrees bien, pero es un
  subprocess en cada invocación y `lore for` corre en cada Edit de un hook contra un presupuesto
  de 50ms; chequear `.git` durante el ascenso que ya se hace es gratis
- **Componer los loros anidados (que el interno vea el suyo más el de arriba)** — resolvería el
  caso de una capa de orquestación sobre varios repos, pero es una feature con decisiones
  propias sin resolver — qué gana ante ids repetidos, si el índice se fusiona — y en al menos un
  proyecto real componer es lo contrario de lo que se necesita
