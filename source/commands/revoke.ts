import { EXIT_ERROR, EXIT_OK, parseCommandArgs, type CommandContext } from "./context.js";
import { requireStore } from "./store-access.js";
import { fromInput } from "../lib/decision.js";
import { markSuperseded, rewriteDecision } from "../lib/mutate.js";
import { findById, suggestIds } from "../lib/store.js";
import { takenIds, todayISO, writeDecision } from "../lib/write.js";

const USAGE = `lore revoke <id> — retire a decision by recording the one that undoes it.

There is no "revoked" status: dropping something is itself a decision, so it gets
its own record and supersedes the old one. That keeps one invariant — every
retired decision points at a live one — and puts the reason somewhere an agent
will actually read it.

  lore revoke <id> --json     send {what, scope, why, [id], [source]} on stdin
  lore revoke <id>            same thing, interactively

The retired decision is added to the new one's ## Rejected list automatically.
`;

export default async function revoke(ctx: CommandContext): Promise<number> {
	const args = parseCommandArgs(ctx.argv, {
		json: { type: "boolean", default: false },
		reason: { type: "string" },
		date: { type: "string" },
	});
	if (!args.ok) {
		ctx.io.err(`lore revoke: ${args.message}\n`);
		return EXIT_ERROR;
	}

	const id = args.parsed.positionals[0];
	if (!id) {
		ctx.io.err(USAGE);
		return EXIT_ERROR;
	}

	const loaded = requireStore(ctx);
	if (!loaded.ok) return EXIT_ERROR;

	const older = findById(loaded.store, id);
	if (!older) {
		ctx.io.err(`lore revoke: no decision with id "${id}"\n`);
		const suggestions = suggestIds(loaded.store, id);
		if (suggestions.length > 0) ctx.io.err(`did you mean: ${suggestions.join(", ")}\n`);
		return EXIT_ERROR;
	}
	if (older.decision.frontmatter.status !== "active") {
		ctx.io.err(`lore revoke: "${id}" is already superseded\n`);
		return EXIT_ERROR;
	}

	const today =
		typeof args.parsed.values["date"] === "string" ? args.parsed.values["date"] : todayISO();
	const reason =
		typeof args.parsed.values["reason"] === "string" ? args.parsed.values["reason"] : "";

	const seed = {
		option: older.decision.frontmatter.what,
		scope: older.decision.frontmatter.scope,
	};

	const built =
		args.parsed.values["json"] === true
			? await fromStdin(ctx, seed, reason, today)
			: await fromPrompts(ctx, loaded.store, seed, reason, today);

	if (!built) return EXIT_ERROR;

	const taken = takenIds(loaded.store.loreDir);
	if (taken.has(built.frontmatter.id)) {
		ctx.io.err(`lore revoke: id "${built.frontmatter.id}" already exists\n`);
		return EXIT_ERROR;
	}

	const written = writeDecision(loaded.store.loreDir, built, "area");
	rewriteDecision(
		loaded.store.loreDir,
		older,
		markSuperseded(older.decision, built.frontmatter.id),
	);
	// Written before the supersede flip, so refresh once both are on disk.
	const { refreshIndex } = await import("../lib/write.js");
	refreshIndex(loaded.store.loreDir);

	ctx.io.out(`Wrote ${written.path}\n${id} is now superseded by ${built.frontmatter.id}\n`);
	return EXIT_OK;
}

type Seed = { option: string; scope: string[] };

/**
 * Build the replacement. Either way the retired decision goes into `## Rejected`
 * by construction — the invariant is not something the caller can forget.
 */
function build(
	input: { what: string; scope: string[]; why: string; id?: string; source?: string },
	seed: Seed,
	reason: string,
	today: string,
) {
	return fromInput(
		{
			what: input.what,
			scope: input.scope.length > 0 ? input.scope : seed.scope,
			why: input.why,
			rejected: [{ option: seed.option, reason: reason || input.why }],
			...(input.id ? { id: input.id } : {}),
			...(input.source ? { source: input.source } : {}),
			date: today,
		},
		today,
	);
}

async function fromStdin(ctx: CommandContext, seed: Seed, reason: string, today: string) {
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
	let payload: { what?: string; scope?: string[]; why?: string; id?: string; source?: string };
	try {
		payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as typeof payload;
	} catch (error) {
		ctx.io.err(`lore revoke: stdin is not JSON: ${error instanceof Error ? error.message : ""}\n`);
		return undefined;
	}

	const built = build(
		{
			what: payload.what ?? "",
			scope: payload.scope ?? [],
			why: payload.why ?? "",
			...(payload.id ? { id: payload.id } : {}),
			...(payload.source ? { source: payload.source } : {}),
		},
		seed,
		reason,
		today,
	);
	if (!built.ok) {
		ctx.io.err(`${JSON.stringify({ ok: false, errors: built.issues }, null, 2)}\n`);
		return undefined;
	}
	return built.decision;
}

async function fromPrompts(
	ctx: CommandContext,
	store: { loreDir: string },
	seed: Seed,
	reason: string,
	today: string,
) {
	if (!process.stdin.isTTY) {
		ctx.io.err("lore revoke: not a terminal. Use `lore revoke <id> --json`.\n");
		return undefined;
	}

	const { cancel, intro, isCancel, text } = await import("@clack/prompts");
	intro(`lore revoke ${seed.option}`);

	const what = await text({
		message: "What replaces it? Usually 'Stop doing X'.",
		placeholder: `Stop using ${seed.option}`,
	});
	if (isCancel(what)) {
		cancel("Nothing written.");
		return undefined;
	}

	const why = await text({
		message: "Why are we dropping it? En castellano.",
		validate: (value?: string) => (value?.trim() ? undefined : "this is the part that matters"),
	});
	if (isCancel(why)) {
		cancel("Nothing written.");
		return undefined;
	}

	const built = build(
		{ what: String(what), scope: seed.scope, why: String(why) },
		seed,
		reason,
		today,
	);
	if (!built.ok) {
		cancel(built.issues.map((issue) => `${issue.field}: ${issue.message}`).join("\n"));
		return undefined;
	}
	void store;
	return built.decision;
}
