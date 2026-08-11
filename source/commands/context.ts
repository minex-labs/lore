import { parseArgs, type ParseArgsConfig } from "node:util";

/**
 * Everything the router needs, and nothing that costs anything to import.
 *
 * This module must never import the store, the schema, or anything that pulls in
 * zod or yaml: `app.ts` imports it on every single invocation, so a dependency
 * added here is paid by `lore --version` and by every `lore for` a PreToolUse hook
 * fires. Store access lives in `store-access.ts`, which only handlers import.
 */

export type IO = { out: (text: string) => void; err: (text: string) => void };

export type CommandContext = {
	argv: string[];
	io: IO;
	cwd: string;
};

export type Handler = (ctx: CommandContext) => Promise<number>;

export const EXIT_OK = 0;
/** Nothing matched, or the thing asked for does not exist. Not an error. */
export const EXIT_NO_MATCH = 1;
/** Bad usage, broken setup, or a real failure. */
export const EXIT_ERROR = 2;

type Options = NonNullable<ParseArgsConfig["options"]>;

export type Parsed = {
	values: Record<string, string | boolean | undefined>;
	positionals: string[];
};

/** parseArgs, but a bad flag comes back as a message instead of an exception. */
export function parseCommandArgs(
	argv: string[],
	options: Options,
): { ok: true; parsed: Parsed } | { ok: false; message: string } {
	try {
		const { values, positionals } = parseArgs({
			args: argv,
			options,
			allowPositionals: true,
		});
		return { ok: true, parsed: { values: values as Parsed["values"], positionals } };
	} catch (error) {
		return { ok: false, message: error instanceof Error ? error.message : String(error) };
	}
}
