import {
	EXIT_ERROR,
	EXIT_NO_MATCH,
	EXIT_OK,
	parseCommandArgs,
	type CommandContext,
} from "./context.js";
import { requireStore } from "./store-access.js";
import { check, type Finding } from "../lib/check.js";

const MARK: Record<Finding["severity"], string> = { error: "✗", warning: "!", info: "·" };

export default async function checkCommand(ctx: CommandContext): Promise<number> {
	const args = parseCommandArgs(ctx.argv, {
		strict: { type: "boolean", default: false },
		json: { type: "boolean", default: false },
	});
	if (!args.ok) {
		ctx.io.err(`lore check: ${args.message}\n`);
		return EXIT_ERROR;
	}

	const loaded = requireStore(ctx);
	if (!loaded.ok) return EXIT_ERROR;

	const findings = check(loaded.store);
	const strict = args.parsed.values["strict"] === true;
	const fatal = findings.filter(
		(finding) => finding.severity === "error" || (strict && finding.severity === "warning"),
	);

	if (args.parsed.values["json"] === true) {
		ctx.io.out(`${JSON.stringify({ ok: fatal.length === 0, findings }, null, 2)}\n`);
		return fatal.length === 0 ? EXIT_OK : EXIT_NO_MATCH;
	}

	if (findings.length === 0) {
		const count = loaded.store.decisions.length;
		ctx.io.out(`ok — ${count} ${count === 1 ? "decision" : "decisions"}, nothing to fix\n`);
		return EXIT_OK;
	}

	const width = Math.max(...findings.map((finding) => finding.where.length));
	for (const finding of findings) {
		const line = `${MARK[finding.severity]} ${finding.where.padEnd(width)}  ${finding.message}\n`;
		if (finding.severity === "info") ctx.io.out(line);
		else ctx.io.err(line);
	}

	const errors = findings.filter((finding) => finding.severity === "error").length;
	const warnings = findings.filter((finding) => finding.severity === "warning").length;
	if (fatal.length > 0) {
		ctx.io.err(`\n${errors} error(s), ${warnings} warning(s)${strict ? " — --strict" : ""}\n`);
		return EXIT_NO_MATCH;
	}
	if (warnings > 0)
		ctx.io.err(`\n${warnings} warning(s), none fatal — use --strict in CI to fail on these\n`);
	return EXIT_OK;
}
