import { EXIT_ERROR, EXIT_OK, parseCommandArgs, type CommandContext } from "./context.js";
import { requireStore, warnAboutProblems } from "./store-access.js";
import { byId, type LoadedDecision } from "../lib/store.js";
import { declaredAreas, loadConfig } from "../lib/config.js";

const STATUSES = ["active", "superseded", "any"] as const;

export default async function list(ctx: CommandContext): Promise<number> {
	const args = parseCommandArgs(ctx.argv, {
		scope: { type: "string" },
		status: { type: "string", default: "active" },
		json: { type: "boolean", default: false },
	});
	if (!args.ok) {
		ctx.io.err(`lore list: ${args.message}\n`);
		return EXIT_ERROR;
	}

	const status = String(args.parsed.values["status"]);
	if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
		ctx.io.err(`lore list: --status must be one of ${STATUSES.join(", ")}\n`);
		return EXIT_ERROR;
	}
	const scope = args.parsed.values["scope"];
	const asJson = args.parsed.values["json"] === true;

	const loaded = requireStore(ctx);
	if (!loaded.ok) return EXIT_ERROR;
	if (!asJson) warnAboutProblems(ctx, loaded.store);

	// A scope nobody declared reads exactly like a scope with nothing in it, and
	// "no decisions" is the answer a typo gets. `--status` already refuses an
	// unknown value rather than silently listing nothing; this is the same rule.
	// Areas with decisions but no declaration count as real, so a lore that was
	// hand-assembled still answers instead of arguing.
	if (typeof scope === "string") {
		const known = new Set(declaredAreas(loadConfig(loaded.store.loreDir).config));
		for (const row of loaded.store.decisions) {
			for (const area of row.decision.frontmatter.scope) known.add(area);
		}
		if (!known.has(scope)) {
			ctx.io.err(
				`lore list: no area called "${scope}".\n` +
					`known areas: ${[...known].sort().join(", ") || "none yet"}\n`,
			);
			return EXIT_ERROR;
		}
	}

	let rows = loaded.store.decisions.slice().sort(byId);
	if (status !== "any") {
		rows = rows.filter((row) => row.decision.frontmatter.status === status);
	}
	if (typeof scope === "string") {
		rows = rows.filter((row) => row.decision.frontmatter.scope.includes(scope));
	}

	if (asJson) {
		ctx.io.out(`${JSON.stringify(rows.map(toJson), null, 2)}\n`);
		return EXIT_OK;
	}

	if (rows.length === 0) {
		ctx.io.out("No decisions match.\n");
		return EXIT_OK;
	}

	const width = Math.max(...rows.map((row) => row.decision.frontmatter.id.length));
	for (const row of rows) {
		const { id, what, scope: areas, status: rowStatus } = row.decision.frontmatter;
		const suffix = rowStatus === "active" ? "" : `  (${rowStatus})`;
		ctx.io.out(`${id.padEnd(width)}  ${what}  [${areas.join(", ")}]${suffix}\n`);
	}
	return EXIT_OK;
}

function toJson(row: LoadedDecision) {
	return { ...row.decision.frontmatter, file: `.lore/${row.file}` };
}
