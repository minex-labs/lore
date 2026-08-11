import { EXIT_ERROR, EXIT_OK, parseCommandArgs, type CommandContext, type IO } from "./context.js";
import { requireStore } from "./store-access.js";
import {
	alreadyRejects,
	markSuperseded,
	rewriteDecision,
	withRejectedOption,
} from "../lib/mutate.js";
import { findById, suggestIds, type Store } from "../lib/store.js";
import { refreshIndex } from "../lib/write.js";

export default async function supersede(ctx: CommandContext): Promise<number> {
	const args = parseCommandArgs(ctx.argv, {
		by: { type: "string" },
		reason: { type: "string" },
		"no-reason": { type: "boolean", default: false },
	});
	if (!args.ok) {
		ctx.io.err(`lore supersede: ${args.message}\n`);
		return EXIT_ERROR;
	}

	const oldId = args.parsed.positionals[0];
	const newId = args.parsed.values["by"];
	if (!oldId || typeof newId !== "string") {
		ctx.io.err("lore supersede: needs both ids\n\n  lore supersede <old-id> --by <new-id>\n");
		return EXIT_ERROR;
	}

	const loaded = requireStore(ctx);
	if (!loaded.ok) return EXIT_ERROR;

	const older = resolve(ctx.io, loaded.store, oldId);
	const newer = resolve(ctx.io, loaded.store, newId);
	if (!older || !newer) return EXIT_ERROR;

	if (older.decision.frontmatter.id === newer.decision.frontmatter.id) {
		ctx.io.err("lore supersede: a decision cannot supersede itself\n");
		return EXIT_ERROR;
	}
	if (older.decision.frontmatter.status === "superseded") {
		ctx.io.err(
			`lore supersede: "${oldId}" is already superseded by "${older.decision.frontmatter.superseded_by}"\n`,
		);
		return EXIT_ERROR;
	}
	if (newer.decision.frontmatter.status !== "active") {
		ctx.io.err(`lore supersede: "${newId}" is not active, so it cannot replace anything\n`);
		return EXIT_ERROR;
	}

	// The old decision's `what` becomes the name of the rejected option, which is
	// what makes "did we already try this?" answerable from the live decision.
	const option = older.decision.frontmatter.what;
	const reason = args.parsed.values["reason"];
	const skip = args.parsed.values["no-reason"] === true;

	if (!alreadyRejects(newer.decision, option) && !skip && typeof reason !== "string") {
		ctx.io.err(
			[
				`lore supersede: "${newId}" does not say why it replaced "${oldId}".`,
				"",
				"  Nobody opens a superseded file, so flipping its status protects nobody.",
				"  What stops this being proposed again is the ## Rejected list of the",
				"  decision that is still active.",
				"",
				`  lore supersede ${oldId} --by ${newId} --reason "why it was dropped"`,
				"  lore supersede ... --no-reason      if it really is already covered",
				"",
			].join("\n"),
		);
		return EXIT_ERROR;
	}

	rewriteDecision(
		loaded.store.loreDir,
		older,
		markSuperseded(older.decision, newer.decision.frontmatter.id),
	);

	if (typeof reason === "string" && reason.trim()) {
		const updated = withRejectedOption(newer.decision, option, reason.trim());
		if (updated !== newer.decision) {
			rewriteDecision(loaded.store.loreDir, newer, updated);
			ctx.io.out(`Added "${option}" to the rejected options of ${newId}\n`);
		}
	}

	refreshIndex(loaded.store.loreDir);
	ctx.io.out(`${oldId} is now superseded by ${newId}; INDEX.md refreshed\n`);
	return EXIT_OK;
}

function resolve(io: IO, store: Store, id: string) {
	const found = findById(store, id);
	if (found) return found;
	io.err(`lore supersede: no decision with id "${id}"\n`);
	const suggestions = suggestIds(store, id);
	if (suggestions.length > 0) io.err(`did you mean: ${suggestions.join(", ")}\n`);
	return undefined;
}
