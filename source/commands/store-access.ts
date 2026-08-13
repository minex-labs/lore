import { dirname, relative } from "node:path";
import { findLoreDir, findLoreDirOutsideRepo, loadStore, type Store } from "../lib/store.js";
import type { CommandContext } from "./context.js";

/**
 * Kept apart from `context.ts` on purpose: this is where zod and yaml enter the
 * process, so only the handlers that actually read decisions pay for them.
 */

/**
 * Load the store, or explain why we cannot.
 *
 * The lookup stops at the repo root, so the message says "in this repo" — saying
 * "or in any parent" would describe a search we no longer do. When there is a
 * lore just outside the boundary, say so: otherwise "not found" reads as a bug to
 * anyone who can see the directory sitting right there.
 */
export function requireStore(ctx: CommandContext): { ok: true; store: Store } | { ok: false } {
	const loreDir = findLoreDir(ctx.cwd);
	if (!loreDir) {
		ctx.io.err("lore: no .lore/ directory in this repo. Run `lore init` first.\n");
		const outside = findLoreDirOutsideRepo(ctx.cwd);
		if (outside) {
			ctx.io.err(
				`there is one at ${relative(ctx.cwd, dirname(outside)) || "."}/, but that is a different git repo — lore does not read across that boundary.\n`,
			);
		}
		return { ok: false };
	}
	return { ok: true, store: loadStore(loreDir) };
}

/**
 * Nudge about broken files without derailing a read command. `lore for` never
 * calls this: it feeds a PreToolUse hook that fires on every edit, and a warning
 * printed that often is a warning nobody reads.
 */
export function warnAboutProblems(ctx: CommandContext, store: Store): void {
	if (store.problems.length === 0) return;
	const count = store.problems.length;
	ctx.io.err(
		`lore: ${count} ${count === 1 ? "problem" : "problems"} in .lore/ — run \`lore check\` for details\n`,
	);
}
