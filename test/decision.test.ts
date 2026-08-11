import assert from "node:assert/strict";
import { test } from "node:test";
import { fromInput, parseDecision, serializeDecision, slugify } from "../source/lib/decision.js";

const SAMPLE = `---
id: postgres-over-dynamo
what: Use Postgres as the primary store, not DynamoDB
scope: [backend, data]
status: active
date: 2026-08-11
source: https://www.notion.so/minex/store-decision-abc123
paths: [packages/api/**, packages/ingest/**]
---

## Why

Las queries del dashboard son inherentemente relacionales (joins entre tenant,
sitio y evento). Con Postgres son una query; con Dynamo eran tres round-trips
más una tabla de índice mantenida a mano.

## Rejected

- **DynamoDB** — access patterns rígidos: cada vista nueva del dashboard pedía un GSI nuevo.
  Lo modelamos en el spike de julio y a la tercera vista ya no cerraba.
- **SQLite + Litestream** — alcanzaba para el volumen actual, pero no soporta los writes
  concurrentes que ya tenemos en ingest.
`;

function expectOk(raw: string) {
	const result = parseDecision(raw);
	assert.equal(result.ok, true, result.ok ? "" : JSON.stringify(result.issues, null, 2));
	assert.ok(result.ok);
	return result.decision;
}

function expectIssues(raw: string): string[] {
	const result = parseDecision(raw);
	assert.equal(result.ok, false, "expected this to fail parsing");
	assert.ok(!result.ok);
	return result.issues.map((issue) => `${issue.field}: ${issue.message}`);
}

test("parses frontmatter, why and rejected options", () => {
	const decision = expectOk(SAMPLE);
	assert.equal(decision.frontmatter.id, "postgres-over-dynamo");
	assert.deepEqual(decision.frontmatter.scope, ["backend", "data"]);
	assert.equal(decision.frontmatter.status, "active");
	assert.deepEqual(decision.frontmatter.paths, ["packages/api/**", "packages/ingest/**"]);
	assert.match(decision.why, /^Las queries del dashboard/);
	assert.equal(decision.rejected.length, 2);
	assert.equal(decision.rejected[0]?.option, "DynamoDB");
	assert.match(decision.rejected[0]?.reason ?? "", /a la tercera vista ya no cerraba\.$/);
	assert.equal(decision.rejected[1]?.option, "SQLite + Litestream");
});

test("serialize then parse is a fixed point", () => {
	const once = serializeDecision(expectOk(SAMPLE));
	const twice = serializeDecision(expectOk(once));
	assert.equal(twice, once, "second pass changed the bytes");
	assert.deepEqual(expectOk(once), expectOk(twice));
});

test("canonical output keeps scope inline and the sections in order", () => {
	const text = serializeDecision(expectOk(SAMPLE));
	assert.match(text, /^---\nid: postgres-over-dynamo\n/);
	assert.match(text, /^scope: \[backend, data\]$/m);
	assert.ok(text.indexOf("## Why") < text.indexOf("## Rejected"));
	assert.ok(text.endsWith("\n") && !text.endsWith("\n\n"));
});

test("long rejected reasons wrap with a hanging indent", () => {
	const decision = expectOk(SAMPLE);
	const text = serializeDecision(decision);
	for (const line of text.split("\n")) {
		assert.ok(line.length <= 100, `line too long for a readable diff: ${line}`);
	}
	assert.match(text, /\n {2}\S/, "expected a wrapped continuation line");
});

test("a decision with nothing rejected is refused", () => {
	const issues = expectIssues(SAMPLE.replace(/- \*\*[\s\S]*$/, ""));
	assert.ok(issues.some((issue) => issue.includes("description of the code, not a decision")));
});

test("a rejected option with no reason is refused", () => {
	const issues = expectIssues(
		SAMPLE.replace(/## Rejected[\s\S]*$/, "## Rejected\n\n- **DynamoDB** —\n"),
	);
	assert.ok(issues.some((issue) => issue.includes("stops it being proposed again")));
});

test("an indented line continues the reason of the bullet above it", () => {
	const decision = expectOk(SAMPLE);
	assert.equal(decision.rejected[0]?.reason.includes("\n"), false, "continuation should be folded");
	assert.match(decision.rejected[0]?.reason ?? "", /GSI nuevo\. Lo modelamos/);
});

test("extra headings are refused rather than silently dropped", () => {
	const issues = expectIssues(`${SAMPLE}\n## Notes\n\nsomething\n`);
	assert.ok(issues.some((issue) => issue.includes("exactly two sections")));
});

test("superseded without a target is refused, and vice versa", () => {
	const orphan = SAMPLE.replace("status: active", "status: superseded");
	assert.ok(
		expectIssues(orphan).some((i) => i.includes("every retired decision points at a live one")),
	);

	const contradictory = SAMPLE.replace(
		"status: active",
		"status: active\nsuperseded_by: something-else",
	);
	assert.ok(
		expectIssues(contradictory).some((i) => i.includes("cannot be set while status is active")),
	);
});

test("unknown frontmatter keys are refused", () => {
	assert.equal(parseDecision(SAMPLE.replace("date:", "owner: martin\ndate:")).ok, false);
});

test("a what line longer than the index budget is refused", () => {
	const long = `what: ${"x".repeat(101)}`;
	const issues = expectIssues(SAMPLE.replace(/what: .*/, long));
	assert.ok(issues.some((issue) => issue.includes("one line in the index")));
});

test("reports every problem at once, not just the first", () => {
	const broken = SAMPLE.replace("id: postgres-over-dynamo", "id: Not A Slug").replace(
		/## Rejected[\s\S]*$/,
		"## Rejected\n",
	);
	const issues = expectIssues(broken);
	assert.ok(
		issues.some((i) => i.startsWith("id:")) && issues.some((i) => i.startsWith("## Rejected:")),
		`expected both the id and the body problem, got: ${issues.join(" | ")}`,
	);
});

test("inbox cannot be used as an area", () => {
	const issues = expectIssues(SAMPLE.replace("scope: [backend, data]", "scope: [inbox]"));
	assert.ok(issues.some((issue) => issue.includes("reserved")));
});

test("slugify produces ids the schema accepts", () => {
	assert.equal(
		slugify("Use Postgres as the primary store, not DynamoDB"),
		"use-postgres-as-the-primary-store-not-dynamodb",
	);
	assert.equal(slugify("Migrar a  tRPC — sin REST"), "migrar-a-trpc-sin-rest");
	assert.ok(slugify("x".repeat(120)).length <= 60);
	assert.doesNotMatch(slugify("Trailing punctuation!!!"), /-$/);
});

test("fromInput builds an active decision and derives the id", () => {
	const result = fromInput(
		{
			what: "Expose the API over tRPC, not REST",
			scope: ["api", "frontend"],
			why: "Compartimos tipos entre cliente y servidor sin generar nada.",
			rejected: [
				{ option: "REST + OpenAPI", reason: "el codegen se desincronizaba en cada release." },
			],
		},
		"2026-08-11",
	);
	assert.ok(result.ok);
	assert.equal(result.decision.frontmatter.id, "expose-the-api-over-trpc-not-rest");
	assert.equal(result.decision.frontmatter.status, "active");
	assert.equal(result.decision.frontmatter.date, "2026-08-11");
	assert.equal(parseDecision(serializeDecision(result.decision)).ok, true);
});

test("fromInput refuses input with no rejected options", () => {
	const result = fromInput(
		{ what: "Use tabs", scope: ["global"], why: "porque sí", rejected: [] },
		"2026-08-11",
	);
	assert.ok(!result.ok);
	assert.ok(result.issues.some((issue) => issue.message.includes("name at least one option")));
});
