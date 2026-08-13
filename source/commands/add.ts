import { EXIT_ERROR, parseCommandArgs, type CommandContext } from "./context.js";
import { requireStore } from "./store-access.js";

const SCHEMA_HELP = `lore add --json — send one object, or an array of them, on stdin:

  {
    "what": "Use Postgres as the primary store, not DynamoDB",
    "scope": ["backend", "data"],
    "why": "Las queries del dashboard son relacionales...",
    "rejected": [
      { "option": "DynamoDB", "reason": "cada vista nueva pedía un GSI nuevo" }
    ],
    "source": "https://notion.so/...",     // optional, required for harvest
    "paths": ["packages/api/**"],          // optional
    "id": "postgres-over-dynamo",          // optional but worth sending: derived
                                           // from "what" it gets long, and the id
                                           // is on every line of INDEX.md
    "date": "2026-08-11"                   // optional, defaults to today
  }

Everything is validated before anything is written, and the result comes back as
JSON on stdout: {"ok":true,"created":[{"id","path"}],"errors":[]}.

Proposals land in .lore/inbox/ and do not count as lore until \`lore review\`
approves them. --approved skips the inbox; it is for humans, not for agents.
`;

export default async function add(ctx: CommandContext): Promise<number> {
	const args = parseCommandArgs(ctx.argv, {
		json: { type: "boolean", default: false },
		approved: { type: "boolean", default: false },
		schema: { type: "boolean", default: false },
		date: { type: "string" },
	});
	if (!args.ok) {
		ctx.io.err(`lore add: ${args.message}\n`);
		return EXIT_ERROR;
	}

	if (args.parsed.values["schema"] === true) {
		ctx.io.out(SCHEMA_HELP);
		return 0;
	}

	const loaded = requireStore(ctx);
	if (!loaded.ok) return EXIT_ERROR;

	const today = args.parsed.values["date"];

	if (args.parsed.values["json"] === true) {
		const { addFromJson, emitJson } = await import("./add-json.js");
		const approved = args.parsed.values["approved"] === true;
		const raw = await readStdin();
		const { result, code } = addFromJson(raw, loaded.store, {
			approved,
			...(typeof today === "string" ? { today } : {}),
		});
		emitJson(ctx.io, result);

		// Nothing on disk distinguishes a record written this way from one a human
		// approved in `lore review`, and git does not either once the migration
		// lands as a single commit. So the gate that was skipped is at least said
		// out loud, on stderr, where it does not disturb the JSON on stdout.
		if (approved && result.ok && result.created.length > 0) {
			const n = result.created.length;
			ctx.io.err(
				`note: --approved put ${n} decision${n === 1 ? "" : "s"} straight into the lore, skipping \`lore review\`.\n` +
					"That is the right call when a human curated the list first, and the wrong one for something decided mid-ticket.\n",
			);
		}
		return code;
	}

	if (!process.stdin.isTTY) {
		ctx.io.err("lore add: not a terminal. Use `lore add --json` and send an object on stdin.\n");
		return EXIT_ERROR;
	}

	// Only the interactive path pays for @clack/prompts.
	const { addInteractively } = await import("./add-interactive.js");
	return addInteractively(ctx, loaded.store, typeof today === "string" ? today : undefined);
}

async function readStdin(): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
	return Buffer.concat(chunks).toString("utf8");
}
