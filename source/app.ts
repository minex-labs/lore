import { COMMANDS, findCommand } from "./commands/registry.js";
import { EXIT_ERROR, EXIT_OK, type IO } from "./commands/context.js";
import { getVersion } from "./lib/version.js";

export function helpText(): string {
	const width = Math.max(...COMMANDS.map((command) => command.name.length));
	const lines = COMMANDS.map((command) => `  ${command.name.padEnd(width)}  ${command.summary}`);
	return [
		"lore — the minimum context an agent needs to stop getting it wrong",
		"",
		"Usage: lore <command> [options]",
		"",
		"Commands:",
		...lines,
		"",
		"  lore <command> --help   Usage for a single command",
		"  lore --version          Print the version",
		"",
	].join("\n");
}

export type RunIO = IO;

const processIO: RunIO = {
	out: (text) => process.stdout.write(text),
	err: (text) => process.stderr.write(text),
};

export async function run(
	argv: string[],
	io: RunIO = processIO,
	cwd = process.cwd(),
): Promise<number> {
	const [first, ...rest] = argv;

	if (!first || first === "--help" || first === "-h" || first === "help") {
		io.out(helpText());
		return EXIT_OK;
	}

	if (first === "--version" || first === "-v") {
		io.out(`${getVersion()}\n`);
		return EXIT_OK;
	}

	const command = findCommand(first);
	if (!command) {
		io.err(`lore: unknown command "${first}"\n\n${helpText()}`);
		return EXIT_ERROR;
	}

	if (rest.includes("--help") || rest.includes("-h")) {
		io.out(`${command.summary}\n\n  ${command.usage}\n`);
		return EXIT_OK;
	}

	if (!command.load) {
		io.err(`lore: "${command.name}" is not implemented yet\n`);
		return EXIT_ERROR;
	}

	const module = await command.load();
	return module.default({ argv: rest, io, cwd });
}
