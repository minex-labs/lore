import { execFile } from "node:child_process";
import { sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
	EXIT_ERROR,
	EXIT_NO_MATCH,
	EXIT_OK,
	parseCommandArgs,
	type CommandContext,
} from "./context.js";
import { getVersion } from "../lib/version.js";

const execFileAsync = promisify(execFile);

export const PACKAGE_NAME = "@minex-labs/lore";

/** Long enough for a cold global install, short enough to not look hung. */
const INSTALL_TIMEOUT_MS = 120_000;
/** The registry probe is best-effort: an offline user gets an answer, not a hang. */
const REGISTRY_TIMEOUT_MS = 3_000;

/**
 * Update the globally installed lore.
 *
 * The network lives here and nowhere else. There is no version check on startup,
 * and there must not be one: `lore for` runs on every edit a hook sees, and a
 * registry probe on that path would cost more than the command does. This module
 * is loaded through `registry.load()`, so nothing pays for `child_process` unless
 * someone actually types `lore update`.
 *
 * Installing shells out to npm rather than doing it by hand, because npm owns the
 * global prefix, the permissions and the bin linking, and none of that is worth
 * reimplementing badly. It does not get to pick the prefix, though: see
 * `installPrefix`.
 */
export default async function update(ctx: CommandContext): Promise<number> {
	const args = parseCommandArgs(ctx.argv, { check: { type: "boolean", default: false } });
	if (!args.ok) {
		ctx.io.err(`lore update: ${args.message}\n`);
		return EXIT_ERROR;
	}

	const current = getVersion();
	const latest = await getLatestVersion(PACKAGE_NAME);

	if (!latest) {
		ctx.io.err(
			`lore update: could not reach the npm registry. You are on ${current}.\n` +
				`Install manually with: npm install -g ${PACKAGE_NAME}@latest\n`,
		);
		return EXIT_ERROR;
	}

	if (!isNewerVersion(current, latest)) {
		// Running from a clone puts you ahead of what is published. Saying "you are
		// on the latest" there is true and misleading at once, and this tool spends
		// a lot of effort not doing that.
		ctx.io.out(
			isNewerVersion(latest, current)
				? `lore ${current} is ahead of the published ${latest} — nothing to update.\n`
				: `lore ${current} is the latest version.\n`,
		);
		return EXIT_OK;
	}

	ctx.io.out(`lore ${current} → ${latest} available.\n`);
	if (args.parsed.values["check"] === true) {
		// grep's convention, so a script can branch on it: 1 means "found something".
		return EXIT_NO_MATCH;
	}

	const prefix = installPrefix(import.meta.url);
	ctx.io.out(`Running ${["npm", ...installArgs(prefix)].join(" ")}…\n`);
	const result = await installLatest(prefix);
	if (!result.ok) {
		ctx.io.err(`lore update: ${result.message}\n`);
		if (result.hint) ctx.io.err(`${result.hint}\n`);
		return EXIT_ERROR;
	}

	// npm exiting 0 only means npm wrote something somewhere. Ask the copy that is
	// actually on the PATH what it is now, because that is the claim being made.
	const installed = getVersion();
	if (installed !== latest) {
		ctx.io.err(
			`lore update: npm reported success, but the lore this command runs from is still ${installed}.\n` +
				`It installed ${latest} into a prefix that is not the one on your PATH — usually two node installs, ` +
				`each with its own global prefix. Run \`npm install -g --prefix <the prefix holding lore> ${PACKAGE_NAME}@latest\`, ` +
				`or reinstall lore with the npm you want to keep.\n`,
		);
		return EXIT_ERROR;
	}

	ctx.io.out(`Updated to ${latest}.\n`);
	return EXIT_OK;
}

/**
 * The prefix this binary was installed into, derived from where this file sits.
 *
 * `npm install -g` writes to the prefix the npm on the PATH is configured with,
 * which is not necessarily the one holding the lore that is running: a package
 * manager's node next to an installer's node is enough to split them. Installing
 * into the other one succeeds, changes nothing the PATH resolves, and leaves this
 * command reporting an update that never took effect — the same lie on every run.
 *
 * Undefined when the path holds no `node_modules`: running from a clone, where
 * there is no prefix to name and nothing to update in place.
 */
export function installPrefix(moduleUrl: string): string | undefined {
	const parts = fileURLToPath(moduleUrl).split(sep);
	const index = parts.lastIndexOf("node_modules");
	if (index < 1) return undefined;
	const prefix = parts.slice(0, index);
	// Posix keeps globals in <prefix>/lib/node_modules, Windows in <prefix>/node_modules.
	if (prefix[prefix.length - 1] === "lib") prefix.pop();
	return prefix.join(sep) || sep;
}

/** Named so the command can print the exact line it is about to run. */
export function installArgs(prefix: string | undefined): string[] {
	return ["install", "-g", ...(prefix ? ["--prefix", prefix] : []), `${PACKAGE_NAME}@latest`];
}

/** Ask npm what the latest published version is. Any failure answers null. */
export async function getLatestVersion(pkg: string): Promise<string | undefined> {
	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), REGISTRY_TIMEOUT_MS);
		const response = await fetch(`https://registry.npmjs.org/${pkg}/latest`, {
			signal: controller.signal,
			headers: { accept: "application/json" },
		});
		clearTimeout(timer);
		if (!response.ok) return undefined;
		const data = (await response.json()) as { version?: unknown };
		return typeof data.version === "string" ? data.version : undefined;
	} catch {
		return undefined;
	}
}

/** True when `latest` is strictly newer. Anything unparseable answers false, so we never nag wrongly. */
export function isNewerVersion(current: string, latest: string): boolean {
	const parse = (value: string) =>
		value
			.trim()
			.split("-")[0]!
			.split(".")
			.map((part) => Number.parseInt(part, 10));
	const a = parse(current);
	const b = parse(latest);
	for (let index = 0; index < 3; index += 1) {
		const left = a[index] ?? 0;
		const right = b[index] ?? 0;
		if (Number.isNaN(left) || Number.isNaN(right)) return false;
		if (right > left) return true;
		if (right < left) return false;
	}
	return false;
}

export type InstallResult = { ok: true } | { ok: false; message: string; hint?: string };

async function installLatest(prefix: string | undefined): Promise<InstallResult> {
	try {
		await execFileAsync("npm", installArgs(prefix), { timeout: INSTALL_TIMEOUT_MS });
		return { ok: true };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const hint = hintFor(message, prefix);
		return { ok: false, message, ...(hint ? { hint } : {}) };
	}
}

/** The three failures people actually hit, each with the fix rather than a stack trace. */
function hintFor(message: string, prefix: string | undefined): string | undefined {
	const lower = message.toLowerCase();
	if (lower.includes("eacces") || lower.includes("permission denied")) {
		const where = prefix ? `${prefix}` : "its global prefix";
		return `npm could not write to ${where}. Fix the ownership of that directory (npm docs: 'resolving EACCES permissions errors'), or re-run with sudo.`;
	}
	if (lower.includes("command not found") || lower.includes("enoent")) {
		return "npm was not found on your PATH. Install Node.js, which bundles it.";
	}
	if (lower.includes("etimedout") || lower.includes("network") || lower.includes("enotfound")) {
		return "That looks like a network problem reaching the registry. Check your connection and retry.";
	}
	return undefined;
}
