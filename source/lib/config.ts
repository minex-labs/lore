import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { GLOBAL_AREA, slugSchema } from "./schema.js";

export const CONFIG_FILE = "config.yml";

/**
 * Areas are declared rather than inferred from directory names, for one reason:
 * free-text scopes rot. Six months in you have `auth`, `authentication` and
 * `Auth`, and an agent reading the index cannot tell they are the same thing.
 * The description is not decoration either — it is what lets an agent map a
 * ticket onto an area without guessing.
 */
/**
 * Size budgets, in characters.
 *
 * The defaults come from measurement, not taste. Across a lore whose records the
 * tool itself considers good, `## Why` runs 184–393 characters, median 242. 600
 * leaves half again as much room as the longest healthy one, and still flags the
 * 1,700–2,200-character records that show up when nobody is looking.
 *
 * `alwaysRead` is the one that matters more. The block lore writes into CLAUDE.md
 * says to read every decision under `global` on every session, so `INDEX.md` plus
 * `global/` is a fixed cost paid by every ticket, whether or not it is relevant.
 * 8,000 characters is roughly 2,000 tokens — about ten records the size of a
 * healthy one.
 */
export const DEFAULT_BUDGET = { why: 600, alwaysRead: 8000 } as const;

export const budgetSchema = z
	.object({
		why: z.number().int().positive().default(DEFAULT_BUDGET.why),
		always_read: z.number().int().positive().default(DEFAULT_BUDGET.alwaysRead),
	})
	.strict();

export const configSchema = z
	.object({
		areas: z.record(slugSchema, z.string().trim().min(1)).default({}),
		budget: budgetSchema.default({
			why: DEFAULT_BUDGET.why,
			always_read: DEFAULT_BUDGET.alwaysRead,
		}),
	})
	.strict();

export type Config = z.infer<typeof configSchema>;

export const DEFAULT_CONFIG = `# lore configuration.
#
# Areas of this codebase. \`lore add\` offers these, \`lore check\` refuses a scope
# that is not listed here, and the description is what helps an agent map a ticket
# onto an area — so write it for a reader who does not know the codebase.
#
# Keep the list short. Areas are for deciding what to read, not for filing.
areas:
  ${GLOBAL_AREA}: Applies to the whole repo; read on every session
  # backend: HTTP API, workers and background jobs
  # frontend: The web client
  # data: Schema, migrations and the analytics pipeline

# Size budgets in characters, reported by \`lore check\`. Uncomment to change them.
#
# \`always_read\` is INDEX.md plus everything in \`${GLOBAL_AREA}/\` — the context every
# session pays whether the ticket needs it or not. It is the number worth watching:
# a long decision in a niche area is read by whoever touches that area, one in
# \`${GLOBAL_AREA}\` is read by everyone, always.
#
# budget:
#   why: ${DEFAULT_BUDGET.why}
#   always_read: ${DEFAULT_BUDGET.alwaysRead}
`;

/** A config we could not read still carries the default budgets. */
function emptyConfig(): Config {
	return {
		areas: {},
		budget: { why: DEFAULT_BUDGET.why, always_read: DEFAULT_BUDGET.alwaysRead },
	};
}

export type LoadedConfig = { config: Config; problem?: string };

/** Read `.lore/config.yml`. A missing or broken file degrades to "no areas declared". */
export function loadConfig(loreDir: string): LoadedConfig {
	let raw: string;
	try {
		raw = readFileSync(join(loreDir, CONFIG_FILE), "utf8");
	} catch {
		return { config: emptyConfig(), problem: `${CONFIG_FILE} is missing — run \`lore init\`` };
	}

	let parsed: unknown;
	try {
		parsed = YAML.parse(raw) as unknown;
	} catch (error) {
		const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
		return { config: emptyConfig(), problem: `${CONFIG_FILE} is not valid YAML: ${message}` };
	}

	const result = configSchema.safeParse(parsed ?? {});
	if (!result.success) {
		const first = result.error.issues[0];
		return {
			config: emptyConfig(),
			problem:
				`${CONFIG_FILE}: ${first?.path.join(".") ?? ""} ${first?.message ?? "is invalid"}`.trim(),
		};
	}

	return { config: result.data };
}

/**
 * Add an area to config.yml, keeping the comments intact.
 *
 * Round-tripping through a plain object would strip the explanatory header, and
 * that header is what stops the area list turning into a filing cabinet.
 */
export function addArea(loreDir: string, name: string, description: string): void {
	const path = join(loreDir, CONFIG_FILE);
	const raw = (() => {
		try {
			return readFileSync(path, "utf8");
		} catch {
			return "areas:\n";
		}
	})();

	const doc = YAML.parseDocument(raw);
	if (!doc.has("areas")) doc.set("areas", {});
	doc.setIn(["areas", name], description.trim() || name);
	writeFileSync(path, doc.toString({ lineWidth: 0 }), "utf8");
}

export function declaredAreas(config: Config): string[] {
	return Object.keys(config.areas).sort((a, b) => {
		if (a === GLOBAL_AREA) return -1;
		if (b === GLOBAL_AREA) return 1;
		return a.localeCompare(b);
	});
}
