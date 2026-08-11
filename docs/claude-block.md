# The CLAUDE.md block

`lore init` injects this between `<!-- lore:start -->` and `<!-- lore:end -->` in
the target repo's `CLAUDE.md`, and rewrites it in place on later runs.

The text below is quoted verbatim from `CLAUDE_BLOCK` in
`source/lib/claude-block.ts`, which is the source of truth. A test fails if the
two drift, so edit the code and re-sync this file — never the other way round.

```markdown
<!-- lore:start -->
## Project lore

`.lore/` holds the decisions this project already made. Read them before you write
code, and add to them when a decision gets made.

### Reading

1. Read `.lore/INDEX.md`. Always read every decision under `## global`.
2. Read the sections for the areas your ticket touches. Open the full file
   (`.lore/*/<id>.md`) for the ones that look relevant — not for all of them.
3. Before editing a file, `lore for <path>` lists the decisions that govern it.
4. A decision's `## Rejected` section lists options already discarded, and why. If
   you are about to propose one of them, don't — unless the stated reason no longer
   holds, in which case say so out loud and explain what changed.

### Writing

Record a decision with `lore add --json` (object on stdin; `lore add --schema` for
the payload). Send a short explicit `id` — it appears on every line of the index.
Never write files under `.lore/` by hand, and never touch `INDEX.md`.

Record it only if ALL FOUR hold:

- **There was a real alternative.** Something a competent person could have picked
  instead, and might propose again next month. No alternative, no decision.
- **The reason is not readable from the code.** If someone could open the repo and
  work it out, the code already says it. Don't repeat it here.
- **It outlives this ticket.** It governs code not yet written, not just the lines
  you are touching now.
- **It was chosen, not discovered.** "The library doesn't support X" is a fact.
  "We're dropping the library because of it" is a decision.

Do NOT record:

- How the code turned out — naming, file layout, this handler returning 404.
- Anything the linter, formatter, or type checker already enforces.
- Implementation details a future refactor can change without asking anyone.
- Something already in the index. If it is a nuance of an existing decision,
  supersede or amend that one instead of adding a near-duplicate.

There is no cap on how many you record. A long session can legitimately produce
several; most sessions produce none. Apply the four tests to each candidate on its
own — don't pad the list, and don't ration it either.

Every proposal must clear this bar, which is what keeps review fast enough to
actually happen:

- **`source` points at the specific thing** — a quoted line from this session, a PR
  number, a URL. Not "we discussed it". It is what makes a proposal checkable
  instead of something the user has to take on faith.
- **`## Rejected` names the alternative.** If you cannot name what was almost
  chosen instead, you don't have a decision, you have a description.
- **The record is reviewable in under 30 seconds** — `what` in one line, `## Why`
  in three sentences or fewer.
- **You checked `INDEX.md` first** for something that already covers it.

If you are unsure, do not write it — say so in one line when you finish, and let
the user decide.

Everything you record lands in `.lore/inbox/` and does not count as lore until the
user approves it. That is deliberate: a wrong entry there costs one keystroke to
discard, while a wrong entry in the lore misleads every agent that comes after you.
<!-- lore:end -->
```

## Notes on the wording

The volume rule used to be "at most one decision per session, expected zero". That
was calibrated against noise, and the inbox inverts the asymmetry it assumed:
discarding a surplus proposal costs one keystroke, while a decision never captured
is lost for good — which is the exact cost lore exists to avoid. A hard ceiling also
silently kills legitimate decisions in a long session. The four tests are the
quality filter; the pressure that keeps the inbox reviewable is applied per
proposal (citable `source`, nameable alternative, 30-second read), not by rationing
the count.

The two lines doing the most work are the last one — the agent's mistakes are cheap
here, so it does not need to be timid — and "if you are unsure, do not write it, say
so in one line". That second one gives an eager agent something to do with the
impulse other than writing a file.
