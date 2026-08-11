/**
 * The command surface of the CLI, declared in one place so `lore help` and the
 * router can never drift apart. Handlers land here step by step; anything still
 * unimplemented exits with code 2 rather than pretending to work.
 */
export type CommandName =
	| "init"
	| "add"
	| "list"
	| "show"
	| "for"
	| "index"
	| "supersede"
	| "revoke"
	| "check"
	| "harvest"
	| "review";

export type Command = {
	name: CommandName;
	summary: string;
	usage: string;
	/**
	 * Loaded on demand, so running one command never pays to import the others.
	 * Missing means "declared but not built yet", which exits non-zero.
	 */
	load?: () => Promise<{ default: Handler }>;
};

export type Handler = (ctx: import("./context.js").CommandContext) => Promise<number>;

export const COMMANDS: Command[] = [
	{
		name: "init",
		summary: "Set up .lore/ in this repo and wire the block into CLAUDE.md",
		usage: "lore init [--no-claude-md]",
		load: () => import("./init.js"),
	},
	{
		name: "add",
		summary: "Record a decision, interactively or from JSON on stdin",
		usage: "lore add [--json]",
	},
	{
		name: "list",
		summary: "List decisions, optionally filtered by scope or status",
		usage: "lore list [--scope <area>] [--status <status>] [--json]",
		load: () => import("./list.js"),
	},
	{
		name: "show",
		summary: "Print a single decision",
		usage: "lore show <id> [--json]",
		load: () => import("./show.js"),
	},
	{
		name: "for",
		summary: "Show the decisions governing a file path",
		usage: "lore for <path> [--json]",
		load: () => import("./for.js"),
	},
	{
		name: "index",
		summary: "Regenerate .lore/INDEX.md",
		usage: "lore index [--check] [--quiet]",
		load: () => import("./index-command.js"),
	},
	{
		name: "supersede",
		summary: "Mark a decision as replaced by a newer one",
		usage: "lore supersede <old-id> --by <new-id>",
	},
	{
		name: "revoke",
		summary: "Retire a decision by recording the decision that undoes it",
		usage: "lore revoke <id>",
	},
	{
		name: "check",
		summary: "Validate the lore and the index; non-zero exit on problems",
		usage: "lore check [--strict]",
	},
	{
		name: "harvest",
		summary: "Turn past discussions into proposed decisions in the inbox",
		usage: "lore harvest <file...> [--run]",
	},
	{
		name: "review",
		summary: "Approve or discard proposed decisions, one by one",
		usage: "lore review [--all]",
	},
];

export function findCommand(name: string): Command | undefined {
	return COMMANDS.find((command) => command.name === name);
}
