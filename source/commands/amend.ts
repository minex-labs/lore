import { mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { EXIT_ERROR, EXIT_OK, parseCommandArgs, type CommandContext } from "./context.js";
import { requireStore } from "./store-access.js";
import { frontmatterSchema, normalizeOption, type Rejected } from "../lib/schema.js";
import { rewriteDecision } from "../lib/mutate.js";
import { findById, suggestIds, type LoadedDecision, type Store } from "../lib/store.js";
import { refreshIndex } from "../lib/write.js";
import type { Decision } from "../lib/decision.js";

const USAGE = `lore amend <id> — fix a decision without deciding again.

  lore amend <id> --json          {why?, scope?, paths?, source?, rejected?} on stdin
  lore amend <id> --scope a,b     move it to another area
  lore amend <id> --paths x,y     change the globs it governs
  lore amend <id> --source "..."  point at where it came from

What an amendment may NOT change: \`what\`, \`id\`, \`date\`, \`status\`. Those are what
make it this decision — change them and it is a different one, which is what
\`lore supersede\` is for.

\`## Rejected\` may only grow. You can add an option that came up later; removing or
rewording one changes what was decided.

The trail is the git diff: the file changed, and the diff says exactly what.
`;

/**
 * Amend a decision in place.
 *
 * The line drawn here is the whole design. If amending were unrestricted, the
 * difference between correcting a typo and quietly deciding something else would
 * live only in the intent of whoever typed the command, and `supersede` — with the
 * mechanism that makes retirement safe — would stop being used. If it were any
 * narrower, moving a decision to another area would be impossible, and `lore check`
 * already tells people to do exactly that.
 *
 * So: identity is frozen (`what`, `id`, `date`, `status`), context is editable
 * (`why`, `scope`, `paths`, `source`), and `## Rejected` may only grow. Adding an
 * option that came up later completes the record; removing one rewrites history.
 */
export default async function amend(ctx: CommandContext): Promise<number> {
	const args = parseCommandArgs(ctx.argv, {
		json: { type: "boolean", default: false },
		scope: { type: "string" },
		paths: { type: "string" },
		source: { type: "string" },
	});
	if (!args.ok) {
		ctx.io.err(`lore amend: ${args.message}\n`);
		return EXIT_ERROR;
	}

	const id = args.parsed.positionals[0];
	if (!id) {
		ctx.io.err(USAGE);
		return EXIT_ERROR;
	}

	const loaded = requireStore(ctx);
	if (!loaded.ok) return EXIT_ERROR;

	const target = findById(loaded.store, id);
	if (!target) {
		ctx.io.err(`lore amend: no decision with id "${id}"\n`);
		const suggestions = suggestIds(loaded.store, id);
		if (suggestions.length > 0) ctx.io.err(`did you mean: ${suggestions.join(", ")}\n`);
		return EXIT_ERROR;
	}

	const patch =
		args.parsed.values["json"] === true ? await readPatch(ctx) : fromFlags(args.parsed.values);
	if (!patch) return EXIT_ERROR;

	const result = applyPatch(target.decision, patch);
	if (!result.ok) {
		for (const message of result.errors) ctx.io.err(`lore amend: ${message}\n`);
		return EXIT_ERROR;
	}
	if (result.changed.length === 0) {
		ctx.io.err("lore amend: nothing to change\n");
		return EXIT_ERROR;
	}

	write(loaded.store, target, result.decision);
	refreshIndex(loaded.store.loreDir);

	ctx.io.out(`Amended ${id}: ${result.changed.join(", ")}\n`);
	ctx.io.out("Commit it with a message that says why — the diff is the only record.\n");
	return EXIT_OK;
}

type Patch = {
	why?: string;
	scope?: string[];
	paths?: string[];
	source?: string;
	rejected?: Rejected[];
};

/** Move the file when the first scope changed; the id, and so the filename, never does. */
function write(store: Store, target: LoadedDecision, next: Decision): void {
	const area = next.frontmatter.scope[0]!;
	if (area !== target.area) {
		mkdirSync(join(store.loreDir, area), { recursive: true });
		rewriteDecision(store.loreDir, target, next);
		renameSync(
			join(store.loreDir, target.file),
			join(store.loreDir, area, `${next.frontmatter.id}.md`),
		);
		return;
	}
	rewriteDecision(store.loreDir, target, next);
}

export function applyPatch(
	decision: Decision,
	patch: Patch,
): { ok: true; decision: Decision; changed: string[] } | { ok: false; errors: string[] } {
	const errors: string[] = [];
	const changed: string[] = [];

	if (patch.rejected) {
		const before = new Set(decision.rejected.map((entry) => normalizeOption(entry.option)));
		const after = new Set(patch.rejected.map((entry) => normalizeOption(entry.option)));
		const dropped = [...before].filter((key) => !after.has(key));
		if (dropped.length > 0) {
			const names = decision.rejected
				.filter((entry) => dropped.includes(normalizeOption(entry.option)))
				.map((entry) => `"${entry.option}"`)
				.join(", ");
			errors.push(
				`removing ${names} from ## Rejected changes what was decided — that is a new decision, use \`lore supersede\``,
			);
		}
	}

	const frontmatter = {
		...decision.frontmatter,
		...(patch.scope ? { scope: patch.scope } : {}),
		...(patch.paths ? { paths: patch.paths } : {}),
		...(patch.source ? { source: patch.source } : {}),
	};

	const parsed = frontmatterSchema.safeParse(frontmatter);
	if (!parsed.success) {
		for (const issue of parsed.error.issues) {
			errors.push(`${issue.path.join(".") || "frontmatter"} ${issue.message}`);
		}
	}
	if (!parsed.success || errors.length > 0) return { ok: false, errors };

	if (patch.why && patch.why.trim() !== decision.why.trim()) changed.push("## Why");
	if (patch.scope && patch.scope.join(",") !== decision.frontmatter.scope.join(",")) {
		changed.push(`scope → ${patch.scope.join(", ")}`);
	}
	if (patch.paths && patch.paths.join(",") !== (decision.frontmatter.paths ?? []).join(",")) {
		changed.push("paths");
	}
	if (patch.source && patch.source !== decision.frontmatter.source) changed.push("source");
	if (patch.rejected && patch.rejected.length > decision.rejected.length) {
		changed.push(`## Rejected (+${patch.rejected.length - decision.rejected.length})`);
	}

	return {
		ok: true,
		changed,
		decision: {
			frontmatter: parsed.data,
			why: patch.why?.trim() ?? decision.why,
			rejected: patch.rejected ?? decision.rejected,
		},
	};
}

const FROZEN = ["what", "id", "date", "status", "superseded_by"];

async function readPatch(ctx: CommandContext): Promise<Patch | undefined> {
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
	let raw: Record<string, unknown>;
	try {
		raw = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
	} catch (error) {
		ctx.io.err(`lore amend: stdin is not JSON: ${error instanceof Error ? error.message : ""}\n`);
		return undefined;
	}

	const frozen = FROZEN.filter((key) => key in raw);
	if (frozen.length > 0) {
		ctx.io.err(
			`lore amend: ${frozen.join(", ")} cannot be amended — those are what make it this decision.\n` +
				"Changing them means deciding again, which is `lore supersede`.\n",
		);
		return undefined;
	}

	return {
		...(typeof raw["why"] === "string" ? { why: raw["why"] } : {}),
		...(Array.isArray(raw["scope"]) ? { scope: raw["scope"] as string[] } : {}),
		...(Array.isArray(raw["paths"]) ? { paths: raw["paths"] as string[] } : {}),
		...(typeof raw["source"] === "string" ? { source: raw["source"] } : {}),
		...(Array.isArray(raw["rejected"]) ? { rejected: raw["rejected"] as Rejected[] } : {}),
	};
}

function fromFlags(values: Record<string, string | boolean | undefined>): Patch {
	const list = (value: unknown): string[] | undefined =>
		typeof value === "string"
			? value
					.split(",")
					.map((entry) => entry.trim())
					.filter(Boolean)
			: undefined;

	const scope = list(values["scope"]);
	const paths = list(values["paths"]);
	return {
		...(scope ? { scope } : {}),
		...(paths ? { paths } : {}),
		...(typeof values["source"] === "string" ? { source: values["source"] } : {}),
	};
}
