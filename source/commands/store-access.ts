import { findLoreDir, loadStore, type Store } from "../lib/store.js";
import type { CommandContext } from "./context.js";

/**
 * Kept apart from `context.ts` on purpose: this is where zod and yaml enter the
 * process, so only the handlers that actually read decisions pay for them.
 */

/** Load the store, or explain why we cannot. */
export function requireStore(ctx: CommandContext): { ok: true; store: Store } | { ok: false } {
	const loreDir = findLoreDir(ctx.cwd);
	if (!loreDir) {
		ctx.io.err("lore: no .lore/ directory here or in any parent. Run `lore init` first.\n");
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
