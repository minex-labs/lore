import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	EXIT_ERROR,
	EXIT_NO_MATCH,
	EXIT_OK,
	parseCommandArgs,
	type CommandContext,
} from "./context.js";
import { requireStore } from "./store-access.js";
import { findById, suggestIds } from "../lib/store.js";

export default async function show(ctx: CommandContext): Promise<number> {
	const args = parseCommandArgs(ctx.argv, { json: { type: "boolean", default: false } });
	if (!args.ok) {
		ctx.io.err(`lore show: ${args.message}\n`);
		return EXIT_ERROR;
	}

	const id = args.parsed.positionals[0];
	if (!id) {
		ctx.io.err("lore show: needs a decision id\n\n  lore show <id>\n");
		return EXIT_ERROR;
	}

	const loaded = requireStore(ctx);
	if (!loaded.ok) return EXIT_ERROR;

	const found = findById(loaded.store, id);
	if (!found) {
		ctx.io.err(`lore show: no decision with id "${id}"\n`);
		const suggestions = suggestIds(loaded.store, id);
		if (suggestions.length > 0) {
			ctx.io.err(`did you mean: ${suggestions.join(", ")}\n`);
		}
		return EXIT_NO_MATCH;
	}

	if (args.parsed.values["json"] === true) {
		ctx.io.out(
			`${JSON.stringify(
				{
					...found.decision.frontmatter,
					why: found.decision.why,
					rejected: found.decision.rejected,
					file: `.lore/${found.file}`,
				},
				null,
				2,
			)}\n`,
		);
		return EXIT_OK;
	}

	// Print the file verbatim rather than re-rendering it: what the agent reads
	// on disk and what `lore show` prints must be the same bytes.
	ctx.io.out(readFileSync(join(loaded.store.loreDir, found.file), "utf8"));
	return EXIT_OK;
}
