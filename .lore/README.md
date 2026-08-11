# .lore/

Decisions this project already made, in a form a coding agent reads before it
touches code. One file per decision, grouped by area.

- `INDEX.md` is generated. Do not edit it by hand — run `lore index`.
- `inbox/` holds proposals waiting for review. Nothing in there counts as lore
  until `lore review` approves it, and no command reads it in the meantime.
- To add a decision, run `lore add`. To retire one, `lore supersede` or
  `lore revoke` — never delete, the history is the point.

Format reference: https://github.com/minex-labs/lore#readme
