import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { parseDecision, serializeDecision } from "../source/lib/decision.js";
import { CLAUDE_BLOCK } from "../source/lib/claude-block.js";
import { COMMANDS } from "../source/commands/registry.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(...parts: string[]): string {
	return readFileSync(join(ROOT, ...parts), "utf8");
}

/** The first fenced markdown block of a document. */
function fencedMarkdown(text: string): string {
	const start = text.indexOf("```markdown\n");
	assert.notEqual(start, -1, "expected a ```markdown block");
	const from = start + "```markdown\n".length;
	const end = text.indexOf("\n```", from);
	assert.notEqual(end, -1, "unterminated ```markdown block");
	return `${text.slice(from, end)}\n`;
}

/**
 * `docs/format.md` claims its example is "the canonical output of the serializer,
 * byte for byte". This is the test that makes the claim true.
 *
 * It was missing for several releases while CLAUDE.md asserted it existed, and in
 * that window the example drifted: adding paragraph reflow to `## Why` rewrapped
 * every record on disk and left the document describing the old shape.
 */
test("the example in docs/format.md is what the serializer actually writes", () => {
	const example = fencedMarkdown(read("docs", "format.md"));

	const parsed = parseDecision(example);
	assert.ok(parsed.ok, `the documented example does not parse: ${JSON.stringify(parsed, null, 2)}`);
	assert.equal(
		serializeDecision(parsed.decision),
		example,
		"docs/format.md has drifted — re-sync it from the serializer, not the other way round",
	);
});

test("the block in docs/claude-block.md is the one the code ships", () => {
	assert.ok(
		read("docs", "claude-block.md").includes(CLAUDE_BLOCK),
		"docs/claude-block.md has drifted from CLAUDE_BLOCK in source/lib/claude-block.ts",
	);
});

test("every command in the registry is listed in the README", () => {
	const readme = read("README.md");
	for (const command of COMMANDS) {
		assert.match(
			readme,
			new RegExp(`lore ${command.name}\\b`),
			`README does not mention \`lore ${command.name}\``,
		);
	}
});
