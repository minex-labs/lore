import { spawn } from "node:child_process";
import { EXIT_ERROR, EXIT_OK, type CommandContext } from "./context.js";
import { addFromJson } from "./add-json.js";
import { buildPackage, type Chunk } from "../lib/harvest.js";
import type { Store } from "../lib/store.js";

/**
 * `--run`: hand each package to the `claude` CLI and ingest what comes back.
 *
 * Split out so the common path never imports child_process, and kept deliberately
 * thin — this is a convenience over "paste the prompt yourself", not a pipeline.
 * The CLI is an optional dependency: if it is not installed, the package is still
 * printable, which is the actual product.
 */
export async function runWithClaude(
	ctx: CommandContext,
	store: Store,
	pieces: Chunk[],
): Promise<number> {
	const proposals: unknown[] = [];

	for (const piece of pieces) {
		ctx.io.err(`  extracting ${piece.index}/${piece.total}…\n`);
		let output: string;
		try {
			output = await claude(buildPackage(piece));
		} catch (error) {
			ctx.io.err(
				`lore harvest: could not run \`claude\`: ${error instanceof Error ? error.message : ""}\n` +
					"Run without --run and paste the package into a session instead.\n",
			);
			return EXIT_ERROR;
		}

		const parsed = parseArray(output);
		if (!parsed) {
			ctx.io.err(`  package ${piece.index}: no JSON array in the reply, skipped\n`);
			continue;
		}
		ctx.io.err(`  package ${piece.index}: ${parsed.length} proposal(s)\n`);
		proposals.push(...parsed);
	}

	if (proposals.length === 0) {
		ctx.io.out("No decisions found in that material.\n");
		return EXIT_OK;
	}

	const { result, code } = addFromJson(JSON.stringify(proposals), store, { approved: false });
	ctx.io.out(`${JSON.stringify(result, null, 2)}\n`);
	if (result.ok) {
		ctx.io.err(`\n${result.created.length} proposal(s) in .lore/inbox/ — run \`lore review\`\n`);
	}
	return code;
}

function claude(prompt: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = spawn("claude", ["-p", "--output-format", "text"], {
			stdio: ["pipe", "pipe", "ignore"],
		});
		let out = "";
		child.stdout.setEncoding("utf8");
		child.stdout.on("data", (part: string) => {
			out += part;
		});
		child.on("error", reject);
		child.on("close", (code) =>
			code === 0 ? resolve(out) : reject(new Error(`claude exited with ${code}`)),
		);
		child.stdin.end(prompt);
	});
}

/** Models like to wrap JSON in prose or a fence; take the outermost array. */
function parseArray(text: string): unknown[] | undefined {
	const start = text.indexOf("[");
	const end = text.lastIndexOf("]");
	if (start === -1 || end <= start) return undefined;
	try {
		const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
		return Array.isArray(parsed) ? parsed : undefined;
	} catch {
		return undefined;
	}
}
