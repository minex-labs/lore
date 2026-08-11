import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { addFromJson, type JsonResult } from "../source/commands/add-json.js";
import { loadStore } from "../source/lib/store.js";
import { parseDecision } from "../source/lib/decision.js";
import { invoke, makeRepo, type Fixture } from "./helpers.js";

const REPO: Record<string, Fixture> = {
	"raw-sql-no-orm": { what: "Write SQL by hand, no ORM", scope: ["backend"] },
};

const VALID = {
	what: "Use Postgres as the primary store, not DynamoDB",
	scope: ["backend", "data"],
	why: "Las queries del dashboard son relacionales.",
	rejected: [{ option: "DynamoDB", reason: "cada vista nueva pedía un GSI nuevo" }],
	source: "https://notion.so/abc",
};

async function setup(fixtures = REPO): Promise<string> {
	const root = makeRepo(fixtures);
	await invoke(root, ["init"]);
	writeFileSync(
		join(root, ".lore/config.yml"),
		"areas:\n  global: Everywhere\n  backend: API and workers\n  data: Schema and pipeline\n  api: The HTTP surface\n",
		"utf8",
	);
	return root;
}

function send(root: string, payload: unknown, approved = false): JsonResult {
	const store = loadStore(join(root, ".lore"));
	return addFromJson(JSON.stringify(payload), store, { approved, today: "2026-08-11" }).result;
}

test("a proposal lands in the inbox, not in an area", async () => {
	const root = await setup();
	const result = send(root, VALID);

	assert.equal(result.ok, true);
	assert.deepEqual(
		result.created.map((entry) => entry.path),
		[".lore/inbox/use-postgres-as-the-primary-store-not-dynamodb.md"],
	);
	assert.ok(existsSync(join(root, result.created[0]!.path)));
});

test("writing to the inbox leaves INDEX.md untouched", async () => {
	const root = await setup();
	const before = readFileSync(join(root, ".lore/INDEX.md"), "utf8");
	send(root, VALID);
	assert.equal(readFileSync(join(root, ".lore/INDEX.md"), "utf8"), before);
});

test("--approved writes into the area and refreshes the index", async () => {
	const root = await setup();
	const result = send(root, { ...VALID, scope: ["backend"] }, true);

	assert.equal(result.ok, true);
	assert.match(result.created[0]!.path, /^\.lore\/backend\//);
	assert.match(readFileSync(join(root, ".lore/INDEX.md"), "utf8"), /Use Postgres/);
});

test("what lands on disk parses back as a decision", async () => {
	const root = await setup();
	const result = send(root, VALID);
	const raw = readFileSync(join(root, result.created[0]!.path), "utf8");

	const parsed = parseDecision(raw);
	assert.ok(parsed.ok);
	assert.equal(parsed.decision.frontmatter.status, "active");
	assert.equal(parsed.decision.frontmatter.date, "2026-08-11");
	assert.equal(parsed.decision.rejected[0]?.option, "DynamoDB");
});

test("an array is accepted, so a harvest can send a batch", async () => {
	const root = await setup();
	const result = send(root, [
		VALID,
		{ ...VALID, what: "Expose the API over tRPC, not REST", scope: ["api"] },
	]);
	assert.equal(result.created.length, 2);
});

test("a batch with one bad entry writes nothing at all", async () => {
	const root = await setup();
	const result = send(root, [VALID, { ...VALID, what: "Broken", rejected: [] }]);

	assert.equal(result.ok, false);
	assert.deepEqual(result.created, []);
	assert.equal(result.errors[0]?.index, 1, "the error points at the offending entry");
	assert.equal(
		existsSync(join(root, ".lore/inbox/use-postgres-as-the-primary-store-not-dynamodb.md")),
		false,
		"the valid entry must not land either",
	);
});

test("errors name the field and the entry, so an agent can fix and resend", async () => {
	const root = await setup();
	const result = send(root, { what: "Something", scope: [] });

	assert.equal(result.ok, false);
	const fields = result.errors.map((error) => error.field);
	assert.ok(fields.includes("scope"), `expected a scope error, got ${fields.join(", ")}`);
	assert.ok(fields.includes("why") && fields.includes("rejected"));
	assert.ok(result.errors.every((error) => typeof error.index === "number"));
});

test("a decision with nothing rejected is refused with the reason why", async () => {
	const root = await setup();
	const result = send(root, { ...VALID, rejected: [] });
	assert.match(result.errors[0]?.message ?? "", /name at least one option you turned down/);
});

test("a colliding id is refused instead of overwriting", async () => {
	const root = await setup();
	const result = send(root, { ...VALID, id: "raw-sql-no-orm" });

	assert.equal(result.ok, false);
	assert.match(result.errors[0]?.message ?? "", /already exists/);
	assert.match(
		readFileSync(join(root, ".lore/backend/raw-sql-no-orm.md"), "utf8"),
		/Write SQL by hand/,
	);
});

test("a collision with a pending proposal is caught too", async () => {
	const root = await setup();
	assert.equal(send(root, VALID).ok, true);
	const second = send(root, VALID);
	assert.equal(second.ok, false);
	assert.match(second.errors[0]?.message ?? "", /already exists/);
});

test("two entries in one batch cannot claim the same id", async () => {
	const root = await setup();
	const result = send(root, [VALID, VALID]);
	assert.equal(result.ok, false);
	assert.equal(result.errors[0]?.index, 1);
});

test("an undeclared area is fine for a proposal but not for --approved", async () => {
	const root = await setup();
	assert.equal(
		send(root, { ...VALID, scope: ["quantum"] }).ok,
		true,
		"review decides on new areas",
	);

	const approved = send(root, { ...VALID, id: "other", scope: ["quantum"] }, true);
	assert.equal(approved.ok, false);
	assert.match(approved.errors[0]?.message ?? "", /not declared in \.lore\/config\.yml/);
});

test("malformed JSON is reported as such, not as a crash", async () => {
	const root = await setup();
	const store = loadStore(join(root, ".lore"));
	const { result, code } = addFromJson("{not json", store, { approved: false });

	assert.equal(result.ok, false);
	assert.equal(code, 2);
	assert.equal(result.errors[0]?.field, "stdin");
});

test("unknown fields are refused rather than silently dropped", async () => {
	const root = await setup();
	const result = send(root, { ...VALID, priority: "high" });
	assert.equal(result.ok, false);
});

test("lore add --schema documents the payload without needing a lore repo", async () => {
	const root = await setup();
	const result = await invoke(root, ["add", "--schema"]);
	assert.equal(result.code, 0);
	assert.match(result.out, /"rejected"/);
	assert.match(result.out, /inbox/);
});
