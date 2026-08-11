---
id: startup-budget
what: Keep the store, the schema, zod and yaml off the startup path
scope: [cli]
status: active
date: 2026-08-11
source: regresión medida en el paso 2; test/startup.test.ts la fija
paths: [source/app.ts, source/commands/context.ts, source/commands/registry.ts]
---

## Why

Los handlers se cargan por `registry.load()` y el acceso al store vive aparte. Esto no es
teórico: un módulo de contexto compartido llevó el arranque de 50ms a 170ms sin que nadie lo
notara, justo en el comando que un hook dispara por cada Edit.

## Rejected

- **Un único módulo de contexto compartido** — es más cómodo de importar, pero arrastra el store
  a app.ts y con él zod y yaml, que pagan todos los comandos incluido --version
