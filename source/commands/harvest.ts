import { readFileSync } from "node:fs";
import { EXIT_ERROR, EXIT_OK, parseCommandArgs, type CommandContext } from "./context.js";
import { requireStore } from "./store-access.js";
import { buildPackage, chunk, estimateTokens, flatten, type Material } from "../lib/harvest.js";

const USAGE = `lore harvest <file...> — turn past discussions into proposals.

  lore harvest thread.md notes.md      print the extraction package to stdout
  lore harvest session.jsonl --run     run it through \`claude -p\` and ingest
  lore harvest - < input.txt           read the material from stdin

lore never calls a model itself. Without --run it prints a package you paste into
a session that already has the material's context; with --run it shells out to the
\`claude\` CLI if you have one. Either way the model's JSON goes to \`lore add\`, and
the proposals land in .lore/inbox/ for \`lore review\`.

Large material is cut into several packages. You will be told how many.
`;

export default async function harvest(ctx: CommandContext): Promise<number> {
	const args = parseCommandArgs(ctx.argv, {
		run: { type: "boolean", default: false },
		chunk: { type: "string" },
	});
	if (!args.ok) {
		ctx.io.err(`lore harvest: ${args.message}\n`);
		return EXIT_ERROR;
	}

	const files = args.parsed.positionals;
	if (files.length === 0) {
		ctx.io.err(USAGE);
		return EXIT_ERROR;
	}

	const loaded = requireStore(ctx);
	if (!loaded.ok) return EXIT_ERROR;

	const material: Material[] = [];
	for (const file of files) {
		try {
			const raw = file === "-" ? await readStdin() : readFileSync(file, "utf8");
			material.push(flatten(file, raw));
		} catch (error) {
			ctx.io.err(
				`lore harvest: cannot read ${file}: ${error instanceof Error ? error.message : ""}\n`,
			);
			return EXIT_ERROR;
		}
	}

	const budget = Number(args.parsed.values["chunk"] ?? Number.NaN);
	const pieces = chunk(material, Number.isFinite(budget) && budget > 0 ? budget : undefined);

	// Say what was skipped and how the material was cut. A harvest that quietly
	// looked at a third of a transcript reads exactly like one that looked at all
	// of it, and the difference is the whole point.
	for (const item of material) {
		if (item.dropped) ctx.io.err(`  ${item.label}: ${item.dropped}\n`);
	}
	const chars = pieces.reduce((total, piece) => total + piece.chars, 0);
	ctx.io.err(
		`  ${material.length} file(s), ~${estimateTokens(chars).toLocaleString()} tokens, ${pieces.length} package(s)\n`,
	);

	if (pieces.length === 0) {
		ctx.io.err("lore harvest: nothing readable in that material\n");
		return EXIT_ERROR;
	}

	if (args.parsed.values["run"] !== true) {
		for (const piece of pieces) ctx.io.out(`${buildPackage(piece)}\n`);
		if (pieces.length > 1) {
			ctx.io.err(
				`\nThat is ${pieces.length} separate prompts — run them one at a time, then send the combined array to \`lore add --json\`.\n`,
			);
		}
		return EXIT_OK;
	}

	const { runWithClaude } = await import("./harvest-run.js");
	return runWithClaude(ctx, loaded.store, pieces);
}

async function readStdin(): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const part of process.stdin) chunks.push(part as Buffer);
	return Buffer.concat(chunks).toString("utf8");
}
