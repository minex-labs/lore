import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { EXIT_ERROR, EXIT_OK, parseCommandArgs, type CommandContext } from "./context.js";
import { injectBlock } from "../lib/claude-block.js";
import { CONFIG_FILE, DEFAULT_CONFIG } from "../lib/config.js";
import { renderIndex } from "../lib/index-file.js";
import { findLoreDir, loadStore, INBOX_DIR, INDEX_FILE, LORE_DIR } from "../lib/store.js";

const LORE_README = `# .lore/

Decisions this project already made, in a form a coding agent reads before it
touches code. One file per decision, grouped by area.

- \`INDEX.md\` is generated. Do not edit it by hand — run \`lore index\`.
- \`inbox/\` holds proposals waiting for review. Nothing in there counts as lore
  until \`lore review\` approves it, and no command reads it in the meantime.
- To add a decision, run \`lore add\`. To retire one, \`lore supersede\` or
  \`lore revoke\` — never delete, the history is the point.

Format reference: https://github.com/minex-labs/lore#readme
`;

/**
 * Set up `.lore/` and wire the block into CLAUDE.md.
 *
 * Safe to run again: it never overwrites config, never touches decisions, and
 * replaces the CLAUDE.md block in place rather than appending a second copy.
 */
export default async function init(ctx: CommandContext): Promise<number> {
	const args = parseCommandArgs(ctx.argv, {
		"no-claude-md": { type: "boolean", default: false },
	});
	if (!args.ok) {
		ctx.io.err(`lore init: ${args.message}\n`);
		return EXIT_ERROR;
	}

	const existing = findLoreDir(ctx.cwd);
	const root = existing ? existing.slice(0, -(LORE_DIR.length + 1)) : ctx.cwd;
	const loreDir = join(root, LORE_DIR);
	const done: string[] = [];
	const kept: string[] = [];

	mkdirSync(join(loreDir, INBOX_DIR), { recursive: true });
	// git does not track empty directories, and an inbox that vanishes on clone
	// would silently drop everything waiting for review.
	writeIfAbsent(join(loreDir, INBOX_DIR, ".gitkeep"), "", done, kept, `${LORE_DIR}/${INBOX_DIR}/`);
	writeIfAbsent(
		join(loreDir, CONFIG_FILE),
		DEFAULT_CONFIG,
		done,
		kept,
		`${LORE_DIR}/${CONFIG_FILE}`,
	);
	writeIfAbsent(join(loreDir, "README.md"), LORE_README, done, kept, `${LORE_DIR}/README.md`);

	// Generated from whatever is on disk, so re-running in a populated repo
	// refreshes the index instead of blanking it.
	const indexPath = join(loreDir, INDEX_FILE);
	const index = renderIndex(loadStore(loreDir));
	if (existsSync(indexPath) && readFileSync(indexPath, "utf8") === index) {
		kept.push(`${LORE_DIR}/${INDEX_FILE}`);
	} else {
		writeFileSync(indexPath, index, "utf8");
		done.push(`${LORE_DIR}/${INDEX_FILE}`);
	}

	if (args.parsed.values["no-claude-md"] !== true) {
		const claudeMd = join(root, "CLAUDE.md");
		const before = existsSync(claudeMd) ? readFileSync(claudeMd, "utf8") : undefined;
		const result = injectBlock(before);
		if (result.action === "unchanged") {
			kept.push("CLAUDE.md (block already current)");
		} else {
			writeFileSync(claudeMd, result.text, "utf8");
			done.push(
				`CLAUDE.md (${result.action === "created" ? "created" : `block ${result.action}`})`,
			);
		}
	}

	for (const entry of done) ctx.io.out(`  wrote  ${entry}\n`);
	for (const entry of kept) ctx.io.out(`   kept  ${entry}\n`);
	ctx.io.out(
		existing
			? "\nlore is already set up here; refreshed what is generated.\n"
			: "\nlore is set up. Record the first decision with `lore add`.\n",
	);
	return EXIT_OK;
}

function writeIfAbsent(
	path: string,
	contents: string,
	done: string[],
	kept: string[],
	label: string,
): void {
	if (existsSync(path)) {
		kept.push(label);
		return;
	}
	writeFileSync(path, contents, "utf8");
	done.push(label);
}
