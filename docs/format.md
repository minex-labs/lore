# The decision file format

The example below is the canonical output of the serializer, byte for byte. It is
also the fixture the parser is tested against, so this document cannot drift from
the code without a test going red.

```markdown
---
id: postgres-over-dynamo
what: Use Postgres as the primary store, not DynamoDB
scope: [backend, data]
status: active
date: 2026-08-11
source: https://www.notion.so/minex/store-decision-abc123
paths: [packages/api/**, packages/ingest/**]
---

## Why

Las queries del dashboard son inherentemente relacionales (joins entre tenant,
sitio y evento). Con Postgres son una query; con Dynamo eran tres round-trips
más una tabla de índice mantenida a mano.

## Rejected

- **DynamoDB** — access patterns rígidos: cada vista nueva del dashboard pedía un GSI nuevo. Lo
  modelamos en el spike de julio y a la tercera vista ya no cerraba.
- **SQLite + Litestream** — alcanzaba para el volumen actual, pero no soporta los writes
  concurrentes que ya tenemos en ingest.
```

Path: `.lore/<first-scope>/<id>.md`. Proposals awaiting review sit in
`.lore/inbox/<id>.md` instead — see the review gate below.

## Frontmatter

| Field | Required | Notes |
| --- | --- | --- |
| `id` | yes | Slug, no date prefix, unique across the repo, equal to the filename. |
| `what` | yes | One line, imperative, ≤ 100 characters. Copied verbatim into `INDEX.md`. English. |
| `scope` | yes | Non-empty list of areas. The **first** one decides which directory the file lives in; the rest are cross-references. `inbox` is reserved. |
| `status` | yes | `active` or `superseded`. There is no third value. |
| `superseded_by` | iff superseded | Id of the decision that replaced it. Required when superseded, refused when active. |
| `date` | yes | `YYYY-MM-DD`, validated as a real date. |
| `source` | no | Notion/Slack URL, PR number, or `claude-session:<uuid>`. Required for anything produced by `lore harvest`. |
| `paths` | no | Globs the decision governs, e.g. `packages/api/**`. Read by `lore for <path>`; never printed in the index. |

Unknown keys are a parse error, not a warning. A typo'd field that parses fine is
a field nobody notices is missing.

## Body

Exactly two sections, `## Why` then `## Rejected`. Any other heading is a parse
error — the serializer would drop it on the next rewrite, and losing someone's
prose silently is worse than refusing the file.

- **`## Why`** is kept verbatim: paragraphs, lists and code blocks all survive
  untouched.
- **`## Rejected`** is a bullet list and nothing else, one entry per discarded
  option, in the form `- **Option** — reason`. An indented line continues the
  reason above it. An entry with no reason is refused: the reason is the part that
  stops the option being proposed again.

At least one rejected entry is mandatory. A record with nothing turned down is a
description of the code, and the code already says it.

## Why this shape

- Every frontmatter value is a scalar or a list of scalars. Nothing multi-line
  lives in the YAML, which is where escaping breaks and diffs turn unreadable.
- `what` sits in the frontmatter rather than the body because `INDEX.md` copies it
  literally. One source of truth, nobody re-summarises anything.
- The two headings are fixed, so `lore add` can refuse an empty `## Rejected` and
  `lore supersede` can read individual options back out.
- Bullets wrap at 96 columns with a two-space hang, so a decision reads as a normal
  markdown list in a PR diff instead of one 400-character line.
- Serializing is a fixed point: parse → serialize → parse returns identical bytes,
  which is what lets `lore check` tell "not canonical" apart from "not valid".

## Statuses

`active` and `superseded`, nothing else. Retiring something without a replacement
is still a decision — it gets its own record ("Stop using Redis; queue state lives
in Postgres") and supersedes the old one. That keeps one invariant worth having:
**every retired decision points at a live one.** Nobody opens a superseded file;
what protects the codebase is the `## Rejected` section of a decision that is still
active, which is exactly where `lore revoke` puts the reason.
