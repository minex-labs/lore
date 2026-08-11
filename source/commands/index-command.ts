import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	EXIT_ERROR,
	EXIT_NO_MATCH,
	EXIT_OK,
	parseCommandArgs,
	type CommandContext,
} from "./context.js";
import { requireStore, warnAboutProblems } from "./store-access.js";
import { renderIndex } from "../lib/index-file.js";
import { INDEX_FILE } from "../lib/store.js";

export default async function indexCommand(ctx: CommandContext): Promise<number> {
	const args = parseCommandArgs(ctx.argv, {
		check: { type: "boolean", default: false },
		quiet: { type: "boolean", default: false },
	});
	if (!args.ok) {
		ctx.io.err(`lore index: ${args.message}\n`);
		return EXIT_ERROR;
	}

	const loaded = requireStore(ctx);
	if (!loaded.ok) return EXIT_ERROR;
	warnAboutProblems(ctx, loaded.store);

	const target = join(loaded.store.loreDir, INDEX_FILE);
	const rendered = renderIndex(loaded.store);
	const current = readCurrent(target);

	if (args.parsed.values["check"] === true) {
		if (current === rendered) return EXIT_OK;
		ctx.io.err("lore index: INDEX.md is out of date — run `lore index`\n");
		return EXIT_NO_MATCH;
	}

	if (current === rendered) {
		if (args.parsed.values["quiet"] !== true) ctx.io.out("INDEX.md already up to date\n");
		return EXIT_OK;
	}

	writeFileSync(target, rendered, "utf8");
	if (args.parsed.values["quiet"] !== true) ctx.io.out(`Wrote .lore/${INDEX_FILE}\n`);
	return EXIT_OK;
}

function readCurrent(path: string): string | undefined {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return undefined;
	}
}
