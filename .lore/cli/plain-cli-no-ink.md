---
id: plain-cli-no-ink
what: Build the CLI on parseArgs, with no Ink, React or CLI framework
scope: [cli]
status: active
date: 2026-08-11
source: charla de diseño inicial, 2026-08-11
paths: [source/app.ts, source/cli.ts, source/commands/**]
---

## Why

lore corre en cada sesión de agente y `lore for` va a correr en cada Edit si se engancha un
hook. El arranque es una feature, no una preferencia: medido, 50ms contra los ~400ms que cuesta
levantar React.

## Rejected

- **Ink + Pastel** — es el stack de mintree y se copiaba solo, pero levantar React son
  ~300-500ms de arranque en un binario cuyo pitch entero es ser barato de invocar
- **Go o Rust** — bajarían a ~5ms y darían binario único para Homebrew, pero sacan del stack
  conocido y complican @minex-labs/lore en npm (wrapper y binarios por plataforma) para ganar
  45ms que nadie percibe
