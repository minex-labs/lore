---
id: amend-freezes-identity
what: Let amend change context, never identity
scope: [cli]
status: active
date: 2026-08-13
source: reporte de uso en dos repos con 19 decisiones, 2026-08-13
paths: [source/commands/amend.ts]
---

## Why

Si enmendar fuera libre, la diferencia entre arreglar una errata y decidir otra cosa viviria
solo en la intencion de quien tipea el comando, y supersede -con el mecanismo que hace segura la
baja- dejaria de usarse. Si fuera mas estrecho, mover una decision de area seria imposible, y
`lore check` recomienda exactamente eso cuando global se pone pesado.

## Rejected

- **add --amend** — reusa un comando conocido, pero sugiere que enmendar es una variante de
  agregar cuando no agrega nada; un comando propio deja el historial de shell diciendo que paso
- **Que supersede distinga reemplazo de correccion** — evita un comando nuevo, pero mezcla dos
  semanticas en el comando cuyo valor es justamente ser inequivoco
- **Permitir editar tambien el what** — cubriria mas casos de mantenimiento, pero el what es lo
  que define la decision y lo que se lee en el indice: cambiarlo es decidir de nuevo
- **Permitir quitar entradas de ## Rejected** — seria simetrico con poder agregarlas, pero
  agregar completa el registro mientras quitar lo reescribe, y ese campo es la memoria de lo que
  ya se descarto
