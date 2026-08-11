export const BLOCK_START = "<!-- lore:start -->";
export const BLOCK_END = "<!-- lore:end -->";

/**
 * The instructions lore writes into the target repo's CLAUDE.md.
 *
 * This is the whole product, in a sense: everything else exists so that these
 * paragraphs are true and cheap to follow. `docs/claude-block.md` quotes it
 * verbatim and a test keeps the two in step.
 *
 * The reading half is ordered by cost — index first, full files only when they
 * look relevant. The writing half is a filter, not an invitation: the four tests
 * decide what counts, and the quality bar underneath them is what keeps review
 * fast enough that it actually happens. There is deliberately no cap on how many
 * decisions a session may record, because the inbox makes a surplus proposal cost
 * one keystroke while a decision never captured is lost for good.
 */
export const CLAUDE_BLOCK = `${BLOCK_START}
## Project lore

\`.lore/\` holds the decisions this project already made. Read them before you write
code, and add to them when a decision gets made.

### Reading

1. Read \`.lore/INDEX.md\`. Always read every decision under \`## global\`.
2. Read the sections for the areas your ticket touches. Open the full file
   (\`.lore/*/<id>.md\`) for the ones that look relevant — not for all of them.
3. Before editing a file, \`lore for <path>\` lists the decisions that govern it.
4. A decision's \`## Rejected\` section lists options already discarded, and why. If
   you are about to propose one of them, don't — unless the stated reason no longer
   holds, in which case say so out loud and explain what changed.

### Writing

Record a decision with \`lore add --json\` (object on stdin; \`lore add --help\` for
the schema). Never write files under \`.lore/\` by hand, and never touch \`INDEX.md\`.

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

- **\`source\` points at the specific thing** — a quoted line from this session, a PR
  number, a URL. Not "we discussed it". It is what makes a proposal checkable
  instead of something the user has to take on faith.
- **\`## Rejected\` names the alternative.** If you cannot name what was almost
  chosen instead, you don't have a decision, you have a description.
- **The record is reviewable in under 30 seconds** — \`what\` in one line, \`## Why\`
  in three sentences or fewer.
- **You checked \`INDEX.md\` first** for something that already covers it.

If you are unsure, do not write it — say so in one line when you finish, and let
the user decide.

Everything you record lands in \`.lore/inbox/\` and does not count as lore until the
user approves it. That is deliberate: a wrong entry there costs one keystroke to
discard, while a wrong entry in the lore misleads every agent that comes after you.
${BLOCK_END}`;

export type InjectResult = {
	text: string;
	action: "created" | "replaced" | "appended" | "unchanged";
};

/**
 * Put the block into a CLAUDE.md, replacing an existing one in place.
 *
 * Running this twice must not change the file the second time, which is why the
 * markers exist: without them a re-run would either duplicate the block or force
 * us to guess where it ended.
 */
export function injectBlock(existing: string | undefined): InjectResult {
	if (existing === undefined) {
		return { text: `# CLAUDE.md\n\n${CLAUDE_BLOCK}\n`, action: "created" };
	}

	const start = existing.indexOf(BLOCK_START);
	const end = existing.indexOf(BLOCK_END);

	if (start !== -1 && end !== -1 && end > start) {
		const before = existing.slice(0, start);
		const after = existing.slice(end + BLOCK_END.length);
		const text = `${before}${CLAUDE_BLOCK}${after}`;
		return { text, action: text === existing ? "unchanged" : "replaced" };
	}

	const separator = existing.endsWith("\n\n") ? "" : existing.endsWith("\n") ? "\n" : "\n\n";
	return { text: `${existing}${separator}${CLAUDE_BLOCK}\n`, action: "appended" };
}
