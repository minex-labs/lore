import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { invoke, makeRepo, type Fixture } from "./helpers.js";

const REPO: Record<string, Fixture> = {
	one: { what: "A global decision", scope: ["global"] },
	two: { what: "A backend decision", scope: ["backend"] },
};

const CONFIG =
	"areas:\n  global: Everywhere\n  backend: API and workers\n  empty: Declared but unused\n";

async function setup(): Promise<string> {
	const root = makeRepo(REPO);
	await invoke(root, ["init"]);
	writeFileSync(join(root, ".lore/config.yml"), CONFIG, "utf8");
	await invoke(root, ["index"]);
	return root;
}

test("lore area lists what is declared, with how much each holds", async () => {
	const result = await invoke(await setup(), ["area"]);

	assert.equal(result.code, 0);
	assert.match(result.out, /global\s+1 decision\s+Everywhere/);
	assert.match(result.out, /empty\s+0 decisions\s+Declared but unused/);
});

test("declaring an area writes it and says what to do next", async () => {
	const root = await setup();
	const result = await invoke(root, ["area", "guards", "--desc", "Los guards de lint"]);

	assert.equal(result.code, 0, result.err);
	assert.match(readFileSync(join(root, ".lore/config.yml"), "utf8"), /guards: Los guards de lint/);
	assert.match(result.out, /lore amend <id> --scope guards/);
});

test("declaring keeps the comments in config.yml intact", async () => {
	const root = makeRepo(REPO);
	await invoke(root, ["init"]);
	const before = readFileSync(join(root, ".lore/config.yml"), "utf8");
	assert.match(before, /^# lore configuration\./, "the shipped config is commented");

	await invoke(root, ["area", "guards", "--desc", "Los guards"]);
	const after = readFileSync(join(root, ".lore/config.yml"), "utf8");
	assert.match(after, /^# lore configuration\./);
	assert.match(after, /Areas are for deciding what to read, not for filing/);
	assert.match(after, /guards: Los guards/);
});

test("an area needs a description, because that is what makes it useful", async () => {
	const root = await setup();
	const result = await invoke(root, ["area", "guards"]);

	assert.equal(result.code, 2);
	assert.match(result.err, /needs a description/);
	assert.doesNotMatch(readFileSync(join(root, ".lore/config.yml"), "utf8"), /guards/);
});

test("a name that is not a slug, or one already taken, is refused", async () => {
	const root = await setup();

	const bad = await invoke(root, ["area", "Not A Slug", "--desc", "x"]);
	assert.equal(bad.code, 2);
	assert.match(bad.err, /lowercase words joined by single hyphens/);

	const taken = await invoke(root, ["area", "backend", "--desc", "x"]);
	assert.equal(taken.code, 2);
	assert.match(taken.err, /already declared — API and workers/);
});

test("listing a declared but empty area answers with nothing, and exits 0", async () => {
	const result = await invoke(await setup(), ["list", "--scope", "empty"]);

	assert.equal(result.code, 0, "an empty area is a real answer");
	assert.match(result.out, /No decisions match/);
});

test("listing an area nobody declared is an error, not an empty list", async () => {
	const result = await invoke(await setup(), ["list", "--scope", "backendd"]);

	assert.equal(result.code, 2, "a typo must not look like an empty area");
	assert.match(result.err, /no area called "backendd"/);
	assert.match(result.err, /known areas: backend, empty, global/);
});

test("an area that holds decisions without being declared still answers", async () => {
	const root = makeRepo(REPO);
	await invoke(root, ["init"]);
	writeFileSync(join(root, ".lore/config.yml"), "areas:\n  global: Everywhere\n", "utf8");
	await invoke(root, ["index"]);

	const result = await invoke(root, ["list", "--scope", "backend"]);
	assert.equal(result.code, 0, "a hand-assembled lore should answer, not argue");
	assert.match(result.out, /two/);
});

test("the budget notice names both steps, not just the goal", async () => {
	const root = makeRepo(
		Object.fromEntries(
			Array.from({ length: 6 }, (_, n) => [
				`g${n}`,
				{ what: `Global decision ${n}`, scope: ["global"] },
			]),
		),
	);
	await invoke(root, ["init"]);
	for (let n = 0; n < 6; n += 1) {
		const file = join(root, `.lore/global/g${n}.md`);
		writeFileSync(
			file,
			readFileSync(file, "utf8").replace("Porque sí, y por eso.", "y".repeat(1800)),
		);
	}
	await invoke(root, ["index"]);

	const result = await invoke(root, ["check"]);
	assert.match(result.out, /lore area <name> --desc/);
	assert.match(result.out, /lore amend <id> --scope <name>/);
});
