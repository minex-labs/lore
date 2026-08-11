import YAML from "yaml";
import {
	decisionInputSchema,
	frontmatterSchema,
	type DecisionInput,
	type Frontmatter,
	type Rejected,
} from "./schema.js";

/**
 * A decision record: typed frontmatter plus a body of exactly two sections.
 *
 * `why` is kept verbatim — it may hold paragraphs, lists or code, and rewriting
 * it would be a good way to corrupt someone's prose. `rejected` is structured,
 * because `lore supersede` and `lore review` need to read the individual options
 * back out.
 */
export type Decision = {
	frontmatter: Frontmatter;
	why: string;
	rejected: Rejected[];
};

export type Issue = { field: string; message: string };
export type ParseResult = { ok: true; decision: Decision } | { ok: false; issues: Issue[] };

const WHY_HEADING = /^##\s+Why\s*$/i;
const REJECTED_HEADING = /^##\s+Rejected\s*$/i;
const ANY_HEADING = /^#{1,2}\s+\S/;
/** Accepts an em dash, en dash or plain hyphen as the separator; we always write "—". */
const BULLET = /^-\s+\*\*(.+?)\*\*\s*(?:—|–|-)\s*(.*)$/;
const WRAP_WIDTH = 96;

/** Parse a decision file. Never throws: `check` needs every problem at once. */
export function parseDecision(raw: string): ParseResult {
	const text = raw.replace(/\r\n/g, "\n");
	const issues: Issue[] = [];

	if (!text.startsWith("---\n")) {
		return {
			ok: false,
			issues: [{ field: "frontmatter", message: "file must open with a --- line" }],
		};
	}
	const end = text.indexOf("\n---", 3);
	if (end === -1) {
		return {
			ok: false,
			issues: [{ field: "frontmatter", message: "frontmatter is never closed with ---" }],
		};
	}

	const frontmatterText = text.slice(4, end + 1);
	const body = text.slice(text.indexOf("\n", end + 1) + 1);

	let rawFrontmatter: unknown;
	try {
		rawFrontmatter = YAML.parse(frontmatterText) as unknown;
	} catch (error) {
		const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
		return {
			ok: false,
			issues: [{ field: "frontmatter", message: `is not valid YAML: ${message}` }],
		};
	}

	const parsed = frontmatterSchema.safeParse(rawFrontmatter);
	if (!parsed.success) {
		for (const issue of parsed.error.issues) {
			issues.push({ field: issue.path.join(".") || "frontmatter", message: issue.message });
		}
	}

	const sections = splitBody(body, issues);

	if (issues.length > 0 || !parsed.success || !sections) {
		return { ok: false, issues };
	}

	return {
		ok: true,
		decision: { frontmatter: parsed.data, why: sections.why, rejected: sections.rejected },
	};
}

type Sections = { why: string; rejected: Rejected[] };

function splitBody(body: string, issues: Issue[]): Sections | undefined {
	const lines = body.split("\n");
	let whyAt = -1;
	let rejectedAt = -1;

	for (const [index, line] of lines.entries()) {
		if (line === undefined) continue;
		if (WHY_HEADING.test(line)) {
			if (whyAt !== -1) issues.push({ field: "## Why", message: "appears more than once" });
			whyAt = index;
		} else if (REJECTED_HEADING.test(line)) {
			if (rejectedAt !== -1)
				issues.push({ field: "## Rejected", message: "appears more than once" });
			rejectedAt = index;
		} else if (ANY_HEADING.test(line)) {
			issues.push({
				field: line.trim(),
				message:
					"is not allowed — a decision has exactly two sections, ## Why and ## Rejected. Fold this into one of them",
			});
		}
	}

	if (whyAt === -1) issues.push({ field: "## Why", message: "section is missing" });
	if (rejectedAt === -1) issues.push({ field: "## Rejected", message: "section is missing" });
	if (whyAt === -1 || rejectedAt === -1) return undefined;
	if (rejectedAt < whyAt) {
		issues.push({ field: "## Rejected", message: "must come after ## Why" });
		return undefined;
	}

	const why = lines
		.slice(whyAt + 1, rejectedAt)
		.join("\n")
		.trim();
	if (!why) issues.push({ field: "## Why", message: "section is empty" });

	const rejected = parseRejected(lines.slice(rejectedAt + 1), issues);
	if (rejected.length === 0) {
		issues.push({
			field: "## Rejected",
			message:
				"section has no entries — if nothing was turned down, this is a description of the code, not a decision",
		});
	}

	return { why, rejected };
}

function parseRejected(lines: string[], issues: Issue[]): Rejected[] {
	const rejected: Rejected[] = [];
	let open: Rejected | undefined;

	for (const line of lines) {
		if (line === undefined) continue;
		const match = BULLET.exec(line);
		if (match) {
			open = { option: match[1]!.trim(), reason: (match[2] ?? "").trim() };
			rejected.push(open);
			continue;
		}
		if (line.trim() === "") {
			open = undefined;
			continue;
		}
		if (line.trimStart().startsWith("- ")) {
			issues.push({
				field: "## Rejected",
				message: `entry "${line.trim().slice(0, 40)}" must name the option in bold: - **Option** — reason`,
			});
			open = undefined;
			continue;
		}
		if (open) {
			open.reason = `${open.reason} ${line.trim()}`.trim();
			continue;
		}
		issues.push({
			field: "## Rejected",
			message: `stray text "${line.trim().slice(0, 40)}" — the section is a bullet list and nothing else`,
		});
	}

	for (const entry of rejected) {
		if (!entry.reason) {
			issues.push({
				field: "## Rejected",
				message: `"${entry.option}" has no reason — the reason is the part that stops it being proposed again`,
			});
		}
	}

	return rejected;
}

/** Render a decision in canonical form. Stable output: same input, same bytes. */
export function serializeDecision(decision: Decision): string {
	const { frontmatter, why, rejected } = decision;

	// Insertion order below is the on-disk field order.
	const ordered: Record<string, unknown> = {
		id: frontmatter.id,
		what: frontmatter.what,
		scope: frontmatter.scope,
		status: frontmatter.status,
	};
	if (frontmatter.superseded_by) ordered["superseded_by"] = frontmatter.superseded_by;
	ordered["date"] = frontmatter.date;
	if (frontmatter.source) ordered["source"] = frontmatter.source;
	if (frontmatter.paths) ordered["paths"] = frontmatter.paths;

	const doc = new YAML.Document(ordered);
	for (const key of ["scope", "paths"]) {
		const node = doc.get(key, true);
		if (YAML.isSeq(node)) node.flow = true;
	}

	const bullets = rejected.map((entry) => wrapBullet(`- **${entry.option}** — ${entry.reason}`));

	return [
		"---",
		doc.toString({ lineWidth: 0, flowCollectionPadding: false }).trimEnd(),
		"---",
		"",
		"## Why",
		"",
		wrapProse(why.trim()),
		"",
		"## Rejected",
		"",
		...bullets,
		"",
	].join("\n");
}

/**
 * Reflow plain paragraphs to WRAP_WIDTH, leaving anything structured alone.
 *
 * A `why` typed at the prompt arrives pre-wrapped, but one sent by an agent over
 * `--json` is a single 300-character line, and the PR diff is where lore is
 * actually reviewed. Lists, quotes, headings and fenced code are passed through
 * untouched — reflowing those would corrupt them.
 */
function wrapProse(text: string): string {
	const out: string[] = [];
	let paragraph: string[] = [];
	let inFence = false;

	const flush = () => {
		if (paragraph.length === 0) return;
		out.push(wrapWords(paragraph.join(" "), WRAP_WIDTH, ""));
		paragraph = [];
	};

	for (const line of text.split("\n")) {
		if (line.trimStart().startsWith("```")) {
			flush();
			inFence = !inFence;
			out.push(line);
			continue;
		}
		if (inFence || /^\s*(?:[-*+>#]|\d+\.)\s/.test(line) || /^\s{4,}\S/.test(line)) {
			flush();
			out.push(line);
			continue;
		}
		if (line.trim() === "") {
			flush();
			out.push("");
			continue;
		}
		paragraph.push(line.trim());
	}
	flush();
	return out.join("\n");
}

/** Wrap a bullet at WRAP_WIDTH with a two-space hang, so PR diffs stay readable. */
function wrapBullet(text: string): string {
	return wrapWords(text, WRAP_WIDTH, "  ");
}

/** Greedy wrap with a hanging indent. Idempotent, so serializing stays a fixed point. */
function wrapWords(text: string, width: number, hang: string): string {
	const words = text.split(/\s+/).filter(Boolean);
	const lines: string[] = [];
	let current = "";
	for (const word of words) {
		const candidate = current ? `${current} ${word}` : word;
		const limit = lines.length === 0 ? width : width - hang.length;
		if (current && candidate.length > limit) {
			lines.push(current);
			current = word;
		} else {
			current = candidate;
		}
	}
	if (current) lines.push(current);
	return lines.map((line, index) => (index === 0 ? line : `${hang}${line}`)).join("\n");
}

/** Turn a `what` line into a candidate id. Callers still check it is unique. */
export function slugify(what: string): string {
	const base = what
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	if (base.length <= 60) return base;
	const cut = base.slice(0, 60);
	const lastHyphen = cut.lastIndexOf("-");
	return (lastHyphen > 20 ? cut.slice(0, lastHyphen) : cut).replace(/-+$/, "");
}

/** Build a decision from the shape `lore add` accepts, in either mode. */
export function fromInput(
	input: unknown,
	today: string,
): { ok: true; decision: Decision } | { ok: false; issues: Issue[] } {
	const parsed = decisionInputSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			issues: parsed.error.issues.map((issue) => ({
				field: issue.path.join(".") || "input",
				message: issue.message,
			})),
		};
	}
	const value: DecisionInput = parsed.data;
	const id = value.id ?? slugify(value.what);
	const frontmatter = frontmatterSchema.safeParse({
		id,
		what: value.what,
		scope: value.scope,
		status: "active",
		date: value.date ?? today,
		...(value.source ? { source: value.source } : {}),
		...(value.paths ? { paths: value.paths } : {}),
	});
	if (!frontmatter.success) {
		return {
			ok: false,
			issues: frontmatter.error.issues.map((issue) => ({
				field: issue.path.join(".") || "input",
				message: issue.message,
			})),
		};
	}
	return {
		ok: true,
		decision: { frontmatter: frontmatter.data, why: value.why, rejected: value.rejected },
	};
}
