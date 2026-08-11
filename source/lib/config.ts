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
export const configSchema = z
	.object({
		areas: z.record(slugSchema, z.string().trim().min(1)).default({}),
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
`;

export type LoadedConfig = { config: Config; problem?: string };

/** Read `.lore/config.yml`. A missing or broken file degrades to "no areas declared". */
export function loadConfig(loreDir: string): LoadedConfig {
	let raw: string;
	try {
		raw = readFileSync(join(loreDir, CONFIG_FILE), "utf8");
	} catch {
		return { config: { areas: {} }, problem: `${CONFIG_FILE} is missing — run \`lore init\`` };
	}

	let parsed: unknown;
	try {
		parsed = YAML.parse(raw) as unknown;
	} catch (error) {
		const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
		return { config: { areas: {} }, problem: `${CONFIG_FILE} is not valid YAML: ${message}` };
	}

	const result = configSchema.safeParse(parsed ?? {});
	if (!result.success) {
		const first = result.error.issues[0];
		return {
			config: { areas: {} },
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
