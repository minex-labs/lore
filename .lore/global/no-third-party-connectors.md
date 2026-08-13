---
id: no-third-party-connectors
what: Never talk to a third-party API; ingest through JSON on stdin
scope: [global, capture]
status: active
date: 2026-08-11
source: paso 6, hallazgo al diseñar harvest
---

## Why

El material bueno está en Notion, Slack y sesiones viejas, pero el agente ya tiene esas
integraciones con las credenciales del usuario. Lee la página con su MCP y pipea a `lore add
--json`: la ingesta ya está resuelta por un esquema en stdin.

## Rejected

- **Conectores propios a Notion y Slack** — es el movimiento obvio y no compra nada: OAuth,
  tokens guardados, llamadas de red en un binario cuyo pitch es arrancar en 50ms, y una API
  ajena que mantener al dia
- **Chequear la version publicada en cada invocacion** — seria comodo para avisar de
  actualizaciones, pero pone una llamada de red en el camino caliente: `lore for` corre en cada
  Edit de un hook. La linea no es 'nunca red' sino 'nunca red que el usuario no pidio' - por eso
  `lore update` es un comando explicito y es el unico que sale a la red
