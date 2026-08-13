import { EXIT_ERROR, EXIT_OK, parseCommandArgs, type CommandContext } from "./context.js";
import { requireStore } from "./store-access.js";
import { addArea, declaredAreas, loadConfig } from "../lib/config.js";
import { slugSchema } from "../lib/schema.js";

const USAGE = `lore area — list the declared areas, or declare one.

  lore area                            list them, with how many decisions each holds
  lore area <name> --desc "one line"   declare a new one

The description is not decoration: it is what lets an agent map a ticket onto an
area without guessing. Write it for a reader who does not know the codebase.
`;

/**
 * Declaring an area needs a command for the same reason writing a decision does:
 * the rule lore publishes — never write files under `.lore/` by hand — is aimed at
 * the agent, and the agent is who follows `lore check`'s advice to move a decision
 * out of `global`. Without this, that advice ends in a step it is not allowed to
 * take. The underlying write already existed for the interactive `add` and for
 * `review`; this only opens the door.
 */
export default async function area(ctx: CommandContext): Promise<number> {
	const args = parseCommandArgs(ctx.argv, { desc: { type: "string" } });
	if (!args.ok) {
		ctx.io.err(`lore area: ${args.message}\n`);
		return EXIT_ERROR;
	}

	const loaded = requireStore(ctx);
	if (!loaded.ok) return EXIT_ERROR;
	const { config } = loadConfig(loaded.store.loreDir);

	const name = args.parsed.positionals[0];
	if (!name) {
		const areas = declaredAreas(config);
		if (areas.length === 0) {
			ctx.io.out("No areas declared yet.\n\n");
			ctx.io.out(USAGE);
			return EXIT_OK;
		}
		const width = Math.max(...areas.map((entry) => entry.length));
		for (const entry of areas) {
			const held = loaded.store.decisions.filter((row) =>
				row.decision.frontmatter.scope.includes(entry),
			).length;
			const count = `${held} ${held === 1 ? "decision" : "decisions"}`;
			ctx.io.out(`${entry.padEnd(width)}  ${count.padEnd(13)}  ${config.areas[entry] ?? ""}\n`);
		}
		return EXIT_OK;
	}

	const valid = slugSchema.safeParse(name);
	if (!valid.success) {
		ctx.io.err(`lore area: "${name}" ${valid.error.issues[0]?.message ?? "is not a valid name"}\n`);
		return EXIT_ERROR;
	}
	if (name in config.areas) {
		ctx.io.err(`lore area: "${name}" is already declared — ${config.areas[name]}\n`);
		return EXIT_ERROR;
	}

	const description = args.parsed.values["desc"];
	if (typeof description !== "string" || !description.trim()) {
		ctx.io.err(
			`lore area: "${name}" needs a description.\n\n` +
				`  lore area ${name} --desc "what lives here, for someone who does not know the codebase"\n`,
		);
		return EXIT_ERROR;
	}

	addArea(loaded.store.loreDir, name, description);
	ctx.io.out(`Declared "${name}". Move a decision into it with:\n`);
	ctx.io.out(`  lore amend <id> --scope ${name}\n`);
	return EXIT_OK;
}
