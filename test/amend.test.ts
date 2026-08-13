import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { test } from "node:test";
import { invoke, makeRepo, type Fixture } from "./helpers.js";

const REPO: Record<string, Fixture> = {
	"keep-counts-out-of-prose": { what: "Keep measured counts out of prose", scope: ["global"] },
	"other-decision": { what: "Something else entirely", scope: ["guards"] },
};

const CONFIG = "areas:\n  global: Everywhere\n  guards: Los guards\n  backend: API\n";

async function setup(): Promise<string> {
	const root = makeRepo(REPO);
	await invoke(root, ["init"]);
	writeFileSync(join(root, ".lore/config.yml"), CONFIG, "utf8");
	await invoke(root, ["index"]);
	return root;
}

async function withStdin(root: string, argv: string[], payload: unknown) {
	const original = Object.getOwnPropertyDescriptor(process, "stdin");
	Object.defineProperty(process, "stdin", {
		value: Readable.from([Buffer.from(JSON.stringify(payload))]),
		configurable: true,
	});
	try {
		return await invoke(root, argv);
	} finally {
		if (original) Object.defineProperty(process, "stdin", original);
	}
}

test("amending the why keeps the id and leaves check green", async () => {
	const root = await setup();
	const result = await withStdin(root, ["amend", "keep-counts-out-of-prose", "--json"], {
		why: "Los conteos caducan; los identificadores no. Dejá los identificadores.",
	});

	assert.equal(result.code, 0, result.err);
	assert.match(result.out, /Amended keep-counts-out-of-prose: ## Why/);

	const file = readFileSync(join(root, ".lore/global/keep-counts-out-of-prose.md"), "utf8");
	assert.match(file, /id: keep-counts-out-of-prose/, "the id must survive");
	assert.match(file, /Los conteos caducan/);
	assert.equal((await invoke(root, ["check"])).code, 0);
});

test("moving to another area moves the file and rebuilds the index", async () => {
	const root = await setup();
	const before = readFileSync(join(root, ".lore/global/keep-counts-out-of-prose.md"), "utf8");

	const result = await invoke(root, ["amend", "keep-counts-out-of-prose", "--scope", "guards"]);
	assert.equal(result.code, 0, result.err);

	assert.equal(existsSync(join(root, ".lore/global/keep-counts-out-of-prose.md")), false);
	const moved = readFileSync(join(root, ".lore/guards/keep-counts-out-of-prose.md"), "utf8");
	assert.match(moved, /scope: \[guards\]/);

	// The point of the whole exercise: moving must not touch the rejected list.
	const rejectedBefore = before.slice(before.indexOf("## Rejected"));
	assert.equal(moved.slice(moved.indexOf("## Rejected")), rejectedBefore);

	const index = readFileSync(join(root, ".lore/INDEX.md"), "utf8");
	assert.match(index, /## guards\n- `keep-counts-out-of-prose`/);
	assert.equal((await invoke(root, ["check"])).code, 0);
});

test("what, id, date and status cannot be amended", async () => {
	const root = await setup();
	for (const frozen of [
		{ what: "Something new" },
		{ id: "other" },
		{ date: "2020-01-01" },
		{ status: "superseded" },
	]) {
		const result = await withStdin(root, ["amend", "keep-counts-out-of-prose", "--json"], frozen);
		assert.equal(result.code, 2, `${Object.keys(frozen)[0]} should be refused`);
		assert.match(result.err, /cannot be amended/);
		assert.match(result.err, /`lore supersede`/, "the error must point at the right tool");
	}
	assert.match(
		readFileSync(join(root, ".lore/global/keep-counts-out-of-prose.md"), "utf8"),
		/what: Keep measured counts out of prose/,
	);
});

test("rejected options may be added but never removed", async () => {
	const root = await setup();

	const added = await withStdin(root, ["amend", "keep-counts-out-of-prose", "--json"], {
		rejected: [
			{ option: "La otra opción", reason: "no servía para nuestro caso." },
			{ option: "Actualizar el número", reason: "vuelve a caducar la semana que viene" },
		],
	});
	assert.equal(added.code, 0, added.err);
	assert.match(added.out, /## Rejected \(\+1\)/);

	const removed = await withStdin(root, ["amend", "keep-counts-out-of-prose", "--json"], {
		rejected: [{ option: "Actualizar el número", reason: "vuelve a caducar" }],
	});
	assert.equal(removed.code, 2);
	assert.match(removed.err, /removing "La otra opción" from ## Rejected/);
	assert.match(removed.err, /use `lore supersede`/);
});

test("amend refuses a no-op instead of pretending it did something", async () => {
	const root = await setup();
	const result = await invoke(root, ["amend", "keep-counts-out-of-prose", "--scope", "global"]);
	assert.equal(result.code, 2);
	assert.match(result.err, /nothing to change/);
});

test("amend on a missing id suggests near matches", async () => {
	const root = await setup();
	const result = await invoke(root, ["amend", "keep-counts", "--source", "x"]);
	assert.equal(result.code, 2);
	assert.match(result.err, /did you mean: keep-counts-out-of-prose/);
});

test("superseding a decision that says the same thing is refused, and points at amend", async () => {
	const root = makeRepo({
		...REPO,
		twin: { what: "Keep measured counts out of prose", scope: ["guards"] },
	});
	await invoke(root, ["init"]);
	writeFileSync(join(root, ".lore/config.yml"), CONFIG, "utf8");
	await invoke(root, ["index"]);

	const result = await invoke(root, [
		"supersede",
		"keep-counts-out-of-prose",
		"--by",
		"twin",
		"--reason",
		"sólo cambia de área",
	]);

	assert.equal(result.code, 2);
	assert.match(result.err, /say the same thing/);
	assert.match(result.err, /lore amend keep-counts-out-of-prose --scope/);

	const twin = readFileSync(join(root, ".lore/guards/twin.md"), "utf8");
	assert.doesNotMatch(
		twin.slice(twin.indexOf("## Rejected")),
		/Keep measured counts out of prose/,
		"a decision must never list itself as a rejected option",
	);
	assert.match(
		readFileSync(join(root, ".lore/global/keep-counts-out-of-prose.md"), "utf8"),
		/status: active/,
		"and nothing may have been retired",
	);
});

test("supersede still works for what it is actually for", async () => {
	const root = await setup();
	const result = await invoke(root, [
		"supersede",
		"other-decision",
		"--by",
		"keep-counts-out-of-prose",
		"--reason",
		"lo reemplazamos por esto",
	]);

	assert.equal(result.code, 0, result.err);
	assert.match(
		readFileSync(join(root, ".lore/guards/other-decision.md"), "utf8"),
		/status: superseded/,
	);
	assert.match(
		readFileSync(join(root, ".lore/global/keep-counts-out-of-prose.md"), "utf8"),
		/- \*\*Something else entirely\*\* — lo reemplazamos por esto/,
	);
});
