import { EXIT_ERROR, EXIT_OK, parseCommandArgs, type CommandContext } from "./context.js";
import { requireStore, warnAboutProblems } from "./store-access.js";
import { byId, type LoadedDecision } from "../lib/store.js";

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
