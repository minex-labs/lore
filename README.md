# lore

Your coding agent does not know what you already decided. So it picks the library
you rejected last quarter, rebuilds the pattern you solved a different way, and
revives the architecture you retired in March. Those decisions exist — they are
just scattered across chat logs, Notion pages, Slack threads, and your head.

`lore` keeps them as versioned markdown next to the code, and hands the agent the
few that matter for the ticket at hand.

The governing principle is **the minimum lore needed**. The failure mode of tools
like this is not too little context, it is dumping everything and drowning the
agent. Curation, not accumulation.

## The unit is the decision

Not the document. Each record carries what was decided, why, and **what was
rejected and why** — the field that stops an agent rediscovering the option you
already threw out.

```markdown
---
id: postgres-over-dynamo
what: Use Postgres as the primary store, not DynamoDB
scope: [backend, data]
status: active
date: 2026-08-11
source: https://www.notion.so/minex/store-decision-abc123
paths: [packages/api/**]
---

## Why

Las queries del dashboard son inherentemente relacionales (joins entre tenant,
sitio y evento). Con Postgres son una query; con Dynamo eran tres round-trips.

## Rejected

- **DynamoDB** — access patterns rígidos: cada vista nueva del dashboard pedía un
  GSI nuevo. Lo modelamos en el spike de julio y a la tercera vista ya no cerraba.
```

Full spec: [`docs/format.md`](docs/format.md).

## How the agent gets it

`lore init` writes a block into your `CLAUDE.md` telling the agent to read
`.lore/INDEX.md` first, open only the decisions matching the areas its ticket
touches, and treat `## Rejected` as a list of things not to propose. The index is
one line per active decision, so it is cheap enough to read every session.

## Commands

```
lore init                      set up .lore/ and wire the block into CLAUDE.md
lore add                       record a decision, interactively
lore add --json                …or from an object on stdin (this is the agent's door)
lore list [--scope] [--status] see what is there
lore show <id>                 print one decision
lore for <path>                which decisions govern this file
lore index                     regenerate INDEX.md
lore supersede <old> --by <new>  retire a decision, keeping the history
lore revoke <id>               retire one with no replacement — by recording the
                               decision that undoes it
lore check [--strict]          validate; wire into CI or a pre-commit hook
lore harvest <file...>         turn past discussions into proposals
lore review                    approve or discard proposals, one screen each
```

## How decisions get in

Four ways, in descending order of quality:

1. **`lore add`** — you, at a prompt. Goes straight into the lore.
2. **The agent, mid-session** — via `lore add --json`. Lands in `.lore/inbox/` and
   does not count as lore until `lore review` approves it. A wrong entry there
   costs one keystroke; a wrong entry in the lore misleads every agent after it.
3. **`lore harvest`** — recovers decisions from old sessions, PR descriptions,
   Notion pages, Slack threads. Also lands in the inbox.
4. There is no fourth way, and there are no connectors. lore never calls an API:
   your agent already has Notion and Slack access, so it reads the source itself
   and pipes JSON into `lore add`.

## Install

Not published yet. From a clone:

```
npm install && npm run build && npm link
```

## License

MIT
