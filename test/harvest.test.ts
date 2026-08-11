import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { buildPackage, chunk, flatten } from "../source/lib/harvest.js";
import { invoke, makeRepo, type Fixture } from "./helpers.js";

const REPO: Record<string, Fixture> = {
	"trpc-over-rest": { what: "Expose the API over tRPC, not REST", scope: ["api"] },
};

const CONFIG = "areas:\n  global: Everywhere\n  api: The HTTP surface\n  backend: Workers\n";

async function setup(inbox: string[] = []): Promise<string> {
	const root = makeRepo(REPO, { inbox });
	await invoke(root, ["init"]);
	writeFileSync(join(root, ".lore/config.yml"), CONFIG, "utf8");
	await invoke(root, ["index"]);
	return root;
}

test("flatten keeps the conversation and drops the tool traffic", () => {
	const transcript = [
		JSON.stringify({ role: "user", content: "¿Postgres o Dynamo?" }),
		JSON.stringify({
			message: {
				role: "assistant",
				content: [
					{ type: "text", text: "Postgres: las queries son relacionales." },
					{ type: "tool_use", name: "Read", input: { file: "a".repeat(4000) } },
				],
			},
		}),
		JSON.stringify({ type: "tool_result", content: "b".repeat(6000) }),
		"{ not json at all",
	].join("\n");

	const material = flatten("session.jsonl", transcript);

	assert.match(material.text, /¿Postgres o Dynamo\?/);
	assert.match(material.text, /las queries son relacionales/);
	assert.doesNotMatch(material.text, /aaaa/, "tool input must not survive");
	assert.doesNotMatch(material.text, /bbbb/, "tool results must not survive");
	assert.match(material.dropped ?? "", /chars of tool calls/);
});

test("a non-jsonl file is passed through untouched", () => {
	const material = flatten("notes.md", "# Notas\n\nDecidimos X.\n");
	assert.equal(material.text, "# Notas\n\nDecidimos X.\n");
	assert.equal(material.dropped, undefined);
});

test("material larger than the budget becomes several packages", () => {
	const long = Array.from({ length: 500 }, (_, n) => `línea ${n} con bastante texto`).join("\n");
	const pieces = chunk([{ label: "big.md", text: long }], 2000);

	assert.ok(pieces.length > 1, "one file must not mean one pass");
	assert.ok(pieces.every((piece) => piece.chars <= 2000));
	assert.ok(
		pieces.every((piece) => piece.text.includes("big.md")),
		"every piece names its source",
	);
	assert.equal(pieces[0]?.total, pieces.length);
});

test("no line is lost when it is longer than the whole budget", () => {
	const pieces = chunk([{ label: "x.md", text: "z".repeat(5000) }], 1000);
	const recovered = pieces.map((piece) => piece.text.replace(/### Source: x\.md\n\n/, "")).join("");
	assert.equal((recovered.match(/z/g) ?? []).length, 5000);
});

test("the package tells the model the rules that matter", () => {
	const [piece] = chunk([{ label: "a.md", text: "hola" }]);
	const text = buildPackage(piece!);

	assert.match(text, /Return ONLY a JSON\s+array/);
	assert.match(text, /Never invent a reason/);
	assert.match(text, /empty array is a perfectly\s+good answer/);
	assert.match(text, /must quote or point at the\s+specific place/);
	assert.match(text, /hola$/m);
});

test("harvest reports how much it read and how it was cut", async () => {
	const root = await setup();
	const file = join(root, "thread.md");
	writeFileSync(file, "Hablamos de Postgres contra Dynamo.\n".repeat(40), "utf8");

	const result = await invoke(root, ["harvest", file]);
	assert.equal(result.code, 0);
	assert.match(result.err, /1 file\(s\), ~\d+ tokens, 1 package\(s\)/);
	assert.match(result.out, /Return ONLY a JSON array/);
});

test("harvest says out loud when it split the material", async () => {
	const root = await setup();
	const file = join(root, "long.md");
	writeFileSync(file, Array.from({ length: 400 }, (_, n) => `renglón ${n}`).join("\n"), "utf8");

	const result = await invoke(root, ["harvest", file, "--chunk", "1000"]);
	assert.match(result.err, /\d+ package\(s\)/);
	assert.match(result.err, /separate prompts — run them one at a time/);
});

test("review --list names what is waiting without touching anything", async () => {
	const root = await setup(["some-proposal"]);
	const result = await invoke(root, ["review", "--list"]);

	assert.equal(result.code, 0);
	assert.match(result.out, /some-proposal/);
	assert.ok(existsSync(join(root, ".lore/inbox/some-proposal.md")), "nothing moved");
});

test("review --all moves proposals into their area and rebuilds the index", async () => {
	const root = await setup(["some-proposal"]);
	const result = await invoke(root, ["review", "--all"]);

	assert.equal(result.code, 0);
	assert.equal(existsSync(join(root, ".lore/inbox/some-proposal.md")), false);
	assert.ok(existsSync(join(root, ".lore/backend/some-proposal.md")));
	assert.match(readFileSync(join(root, ".lore/INDEX.md"), "utf8"), /some-proposal/);
});

test("an approved proposal keeps its bytes — it is moved, not rewritten", async () => {
	const root = await setup(["some-proposal"]);
	const before = readFileSync(join(root, ".lore/inbox/some-proposal.md"), "utf8");

	await invoke(root, ["review", "--all"]);
	assert.equal(readFileSync(join(root, ".lore/backend/some-proposal.md"), "utf8"), before);
});

test("review says so when the inbox is empty", async () => {
	const root = await setup();
	const result = await invoke(root, ["review"]);
	assert.equal(result.code, 0);
	assert.match(result.out, /Nothing waiting for review/);
});

test("review without a terminal refuses rather than guessing", async () => {
	const root = await setup(["some-proposal"]);
	const result = await invoke(root, ["review"]);

	assert.equal(result.code, 1);
	assert.match(result.err, /1 proposal\(s\) waiting/);
	assert.ok(existsSync(join(root, ".lore/inbox/some-proposal.md")), "nothing was decided for me");
});

test("a proposal is invisible to the lore until it is approved", async () => {
	const root = await setup(["some-proposal"]);

	assert.doesNotMatch(readFileSync(join(root, ".lore/INDEX.md"), "utf8"), /some-proposal/);
	assert.doesNotMatch((await invoke(root, ["list", "--status", "any"])).out, /some-proposal/);
	assert.equal((await invoke(root, ["check"])).code, 0, "a pending proposal is not a problem");

	await invoke(root, ["review", "--all"]);
	assert.match((await invoke(root, ["list"])).out, /some-proposal/);
});

test("harvest and review meet: a proposed batch survives the round trip", async () => {
	const root = await setup();
	mkdirSync(join(root, ".lore/inbox"), { recursive: true });

	const batch = [
		{
			id: "postgres-over-dynamo",
			what: "Use Postgres as the primary store, not DynamoDB",
			scope: ["backend"],
			why: "Las queries del dashboard son relacionales.",
			rejected: [{ option: "DynamoDB", reason: "cada vista pedía un GSI nuevo" }],
			source: "claude-session:abc — 'con Dynamo eran tres round-trips'",
		},
	];
	const { addFromJson } = await import("../source/commands/add-json.js");
	const { loadStore } = await import("../source/lib/store.js");
	const { result } = addFromJson(JSON.stringify(batch), loadStore(join(root, ".lore")), {
		approved: false,
		today: "2026-08-11",
	});

	assert.equal(result.ok, true);
	assert.match(result.created[0]!.path, /inbox/);

	await invoke(root, ["review", "--all"]);
	assert.ok(existsSync(join(root, ".lore/backend/postgres-over-dynamo.md")));
	assert.equal((await invoke(root, ["check"])).code, 0);
});
