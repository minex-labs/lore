import { COMMANDS, findCommand } from "./commands/registry.js";
import { getVersion } from "./lib/version.js";

const EXIT_USAGE = 2;

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

export type RunIO = {
	out: (text: string) => void;
	err: (text: string) => void;
};

const processIO: RunIO = {
	out: (text) => process.stdout.write(text),
	err: (text) => process.stderr.write(text),
};

export async function run(argv: string[], io: RunIO = processIO): Promise<number> {
	const [first, ...rest] = argv;

	if (!first || first === "--help" || first === "-h" || first === "help") {
		io.out(helpText());
		return 0;
	}

	if (first === "--version" || first === "-v") {
		io.out(`${getVersion()}\n`);
		return 0;
	}

	const command = findCommand(first);
	if (!command) {
		io.err(`lore: unknown command "${first}"\n\n${helpText()}`);
		return EXIT_USAGE;
	}

	if (rest.includes("--help") || rest.includes("-h")) {
		io.out(`${command.summary}\n\n  ${command.usage}\n`);
		return 0;
	}

	io.err(`lore: "${command.name}" is not implemented yet\n`);
	return EXIT_USAGE;
}
