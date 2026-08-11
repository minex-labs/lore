import picomatch from "picomatch";
import {
	EXIT_ERROR,
	EXIT_NO_MATCH,
	EXIT_OK,
	parseCommandArgs,
	type CommandContext,
} from "./context.js";
import { requireStore } from "./store-access.js";
import { activeDecisions, byId, toRepoRelative, type LoadedDecision } from "../lib/store.js";

/**
 * Which decisions govern a file.
 *
 * This is the engine for a `PreToolUse` hook on Edit/Write, so it follows grep's
 * convention: exit 0 when something matched, exit 1 when nothing did — and in that
 * case it prints absolutely nothing, on either stream. A hook that fires on every
 * edit cannot afford to be chatty, and neither can it afford to warn about
 * unrelated problems in `.lore/`, which is why this command skips that check.
 */
export default async function forPath(ctx: CommandContext): Promise<number> {
	const args = parseCommandArgs(ctx.argv, { json: { type: "boolean", default: false } });
	if (!args.ok) {
		ctx.io.err(`lore for: ${args.message}\n`);
		return EXIT_ERROR;
	}

	const target = args.parsed.positionals[0];
	if (!target) {
		ctx.io.err("lore for: needs a path\n\n  lore for <path>\n");
		return EXIT_ERROR;
	}

	const loaded = requireStore(ctx);
	if (!loaded.ok) return EXIT_ERROR;

	const relative = toRepoRelative(loaded.store.root, target);
	const matches = activeDecisions(loaded.store)
		.filter((row) => governs(row, relative))
		.sort(byId);

	if (matches.length === 0) return EXIT_NO_MATCH;

	if (args.parsed.values["json"] === true) {
		ctx.io.out(
			`${JSON.stringify(
				matches.map((row) => ({
					...row.decision.frontmatter,
					rejected: row.decision.rejected,
					file: `.lore/${row.file}`,
				})),
				null,
				2,
			)}\n`,
		);
		return EXIT_OK;
	}

	const count = matches.length;
	ctx.io.out(`${count} ${count === 1 ? "decision governs" : "decisions govern"} ${relative}:\n\n`);
	for (const row of matches) {
		const { id, what } = row.decision.frontmatter;
		ctx.io.out(`- \`${id}\` — ${what}\n`);
		const options = row.decision.rejected.map((entry) => entry.option).join(", ");
		ctx.io.out(`  Already rejected: ${options}\n`);
		ctx.io.out(`  Full text: .lore/${row.file}\n`);
	}
	return EXIT_OK;
}

function governs(row: LoadedDecision, relativePath: string): boolean {
	const globs = row.decision.frontmatter.paths;
	if (!globs || globs.length === 0) return false;
	return picomatch(globs, { dot: true })(relativePath);
}
