import { mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
	EXIT_ERROR,
	EXIT_NO_MATCH,
	EXIT_OK,
	parseCommandArgs,
	type CommandContext,
} from "./context.js";
import { requireStore } from "./store-access.js";
import { parseDecision, type Decision } from "../lib/decision.js";
import { addArea, declaredAreas, loadConfig } from "../lib/config.js";
import { INBOX_DIR, type Store } from "../lib/store.js";
import { inboxIds, refreshIndex } from "../lib/write.js";

type Proposal = { id: string; path: string; decision: Decision; raw: string };
type Unreadable = { id: string; issues: string[] };

export default async function review(ctx: CommandContext): Promise<number> {
	const args = parseCommandArgs(ctx.argv, {
		all: { type: "boolean", default: false },
		list: { type: "boolean", default: false },
	});
	if (!args.ok) {
		ctx.io.err(`lore review: ${args.message}\n`);
		return EXIT_ERROR;
	}

	const loaded = requireStore(ctx);
	if (!loaded.ok) return EXIT_ERROR;
	const store = loaded.store;

	const { proposals, unreadable } = readInbox(store);
	reportUnreadable(ctx, unreadable);

	if (proposals.length === 0) {
		// An inbox holding only unreadable files is not an empty inbox, and must not
		// exit like one.
		if (unreadable.length > 0) return EXIT_NO_MATCH;
		ctx.io.out("Nothing waiting for review.\n");
		return EXIT_OK;
	}

	if (args.parsed.values["list"] === true) {
		for (const proposal of proposals) {
			ctx.io.out(`${proposal.id}  ${proposal.decision.frontmatter.what}\n`);
		}
		return EXIT_OK;
	}

	if (args.parsed.values["all"] === true) {
		let approved = 0;
		for (const proposal of proposals) {
			approve(store, proposal);
			approved += 1;
		}
		refreshIndex(store.loreDir);
		ctx.io.out(`Approved ${approved} proposal(s); INDEX.md refreshed\n`);
		return EXIT_OK;
	}

	if (!process.stdin.isTTY) {
		ctx.io.err(
			`lore review: not a terminal. ${proposals.length} proposal(s) waiting — use --list to see them, --all to accept them.\n`,
		);
		return EXIT_NO_MATCH;
	}

	return interactive(ctx, store, proposals);
}

/**
 * Read the inbox directly. The store loader cannot see it — that is what keeps a
 * proposal out of the index — so this is the one place that goes looking.
 *
 * Files that do not parse come back separately instead of being dropped. Silently
 * skipping them made an unreadable proposal indistinguishable from an empty inbox:
 * three states collapsed into two, and the comfortable one won.
 */
function readInbox(store: Store): { proposals: Proposal[]; unreadable: Unreadable[] } {
	const proposals: Proposal[] = [];
	const unreadable: Unreadable[] = [];
	for (const id of inboxIds(store.loreDir)) {
		const path = join(store.loreDir, INBOX_DIR, `${id}.md`);
		const raw = readFileSync(path, "utf8");
		const parsed = parseDecision(raw);
		if (parsed.ok) proposals.push({ id, path, decision: parsed.decision, raw });
		else
			unreadable.push({
				id,
				issues: parsed.issues.map((issue) => `${issue.field}: ${issue.message}`),
			});
	}
	return { proposals, unreadable };
}

function reportUnreadable(ctx: CommandContext, unreadable: Unreadable[]): void {
	if (unreadable.length === 0) return;
	const count = unreadable.length;
	ctx.io.err(
		`lore review: ${count} ${count === 1 ? "proposal" : "proposals"} in the inbox cannot be read and ${count === 1 ? "was" : "were"} skipped:\n`,
	);
	for (const entry of unreadable) {
		ctx.io.err(`  ${entry.id}: ${entry.issues[0] ?? "unparseable"}\n`);
	}
	ctx.io.err("Fix the file, or delete it — it can never be approved as it stands.\n");
}

function approve(store: Store, proposal: Proposal): string {
	const area = proposal.decision.frontmatter.scope[0]!;
	const dir = join(store.loreDir, area);
	mkdirSync(dir, { recursive: true });
	const target = join(dir, `${proposal.decision.frontmatter.id}.md`);
	// A move, not a rewrite: the diff shows a rename and the bytes stay put.
	renameSync(proposal.path, target);
	return `${area}/${proposal.decision.frontmatter.id}.md`;
}

/**
 * Reviewing forty proposals in a git diff is miserable, so this is one screen per
 * proposal with a single choice each. Approving moves the file; discarding
 * deletes it; the index is rebuilt once at the end rather than forty times.
 */
async function interactive(
	ctx: CommandContext,
	store: Store,
	proposals: Proposal[],
): Promise<number> {
	const { cancel, confirm, intro, isCancel, note, outro, select, text } =
		await import("@clack/prompts");
	const { config } = loadConfig(store.loreDir);
	const declared = new Set(declaredAreas(config));

	intro(`lore review — ${proposals.length} waiting`);

	let approved = 0;
	let discarded = 0;
	let skipped = 0;

	for (const [index, proposal] of proposals.entries()) {
		const { what, scope, source } = proposal.decision.frontmatter;
		const similar = findSimilar(store, proposal);

		note(
			[
				what,
				"",
				`scope:   ${scope.join(", ")}`,
				`source:  ${source ?? "— none, which is a reason to be suspicious"}`,
				"",
				proposal.decision.why,
				"",
				"Rejected:",
				...proposal.decision.rejected.map((entry) => `  - ${entry.option}: ${entry.reason}`),
				...(similar.length > 0 ? ["", `Similar existing: ${similar.join(", ")}`] : []),
			].join("\n"),
			`${index + 1}/${proposals.length}  ${proposal.id}`,
		);

		const action = await select({
			message: "Keep it?",
			options: [
				{ value: "approve", label: "approve" },
				{ value: "discard", label: "discard" },
				{ value: "skip", label: "skip for now" },
				{ value: "quit", label: "stop here" },
			],
		});
		if (isCancel(action) || action === "quit") break;

		if (action === "skip") {
			skipped += 1;
			continue;
		}

		if (action === "discard") {
			rmSync(proposal.path);
			discarded += 1;
			continue;
		}

		const undeclared = scope.filter((area) => !declared.has(area));
		if (undeclared.length > 0) {
			const ok = await confirm({ message: `Declare new area(s): ${undeclared.join(", ")}?` });
			if (isCancel(ok) || !ok) {
				skipped += 1;
				continue;
			}
			for (const area of undeclared) {
				const description = await text({ message: `What is "${area}"? One line.` });
				if (isCancel(description)) break;
				addArea(store.loreDir, area, String(description));
				declared.add(area);
			}
		}

		approve(store, proposal);
		approved += 1;
	}

	if (approved > 0) refreshIndex(store.loreDir);

	const remaining = inboxIds(store.loreDir).length;
	const summary = `${approved} approved, ${discarded} discarded, ${skipped} skipped, ${remaining} left in the inbox`;
	if (approved + discarded === 0) cancel(summary);
	else outro(summary);
	return EXIT_OK;
}

/** Cheap overlap check — enough to catch the near-duplicate a harvest produces. */
function findSimilar(store: Store, proposal: Proposal): string[] {
	const words = significant(proposal.decision.frontmatter.what);
	if (words.size === 0) return [];

	return store.decisions
		.filter((loaded) => loaded.decision.frontmatter.status === "active")
		.filter((loaded) =>
			loaded.decision.frontmatter.scope.some((area) =>
				proposal.decision.frontmatter.scope.includes(area),
			),
		)
		.filter((loaded) => {
			const other = significant(loaded.decision.frontmatter.what);
			let shared = 0;
			for (const word of words) if (other.has(word)) shared += 1;
			return shared >= 2;
		})
		.map((loaded) => loaded.decision.frontmatter.id)
		.slice(0, 3);
}

const STOP_WORDS = new Set([
	"the",
	"a",
	"an",
	"to",
	"for",
	"of",
	"in",
	"on",
	"with",
	"not",
	"use",
	"using",
	"and",
	"or",
	"as",
	"by",
	"it",
	"we",
	"our",
	"from",
	"into",
	"over",
	"keep",
	"make",
]);

function significant(text: string): Set<string> {
	return new Set(
		text
			.toLowerCase()
			.split(/[^a-z0-9]+/)
			.filter((word) => word.length > 2 && !STOP_WORDS.has(word)),
	);
}
