import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { invoke, makeRepo, type Fixture } from "./helpers.js";

/**
 * Both polarities for every case. A budget check that only proves "it warns on a
 * fat lore" passes just as well when it fires on everything, and the version that
 * fires on everything is the one that gets taken out of the merge gate.
 */

const CONFIG = "areas:\n  global: Everywhere\n  backend: API and workers\n";

/** Roughly the shape of a healthy record: `why` around the measured median. */
function record(id: string, area: string, whyChars: number): string {
	return [
		"---",
		`id: ${id}`,
		`what: A decision about ${id}`,
		`scope: [${area}]`,
		"status: active",
		"date: 2026-08-13",
		"---",
		"",
		"## Why",
		"",
		"x".repeat(whyChars),
		"",
		"## Rejected",
		"",
		"- **The other option** — no servía para nuestro caso.",
		"",
	].join("\n");
}

async function repo(files: { id: string; area: string; why: number }[], budget?: string) {
	const fixtures: Record<string, Fixture> = {};
	for (const f of files) fixtures[f.id] = { what: `A decision about ${f.id}`, scope: [f.area] };
	const root = makeRepo(fixtures);
	await invoke(root, ["init"]);
	writeFileSync(join(root, ".lore/config.yml"), CONFIG + (budget ?? ""), "utf8");
	for (const f of files) {
		writeFileSync(join(root, `.lore/${f.area}/${f.id}.md`), record(f.id, f.area, f.why), "utf8");
	}
	await invoke(root, ["index"]);
	return root;
}

test("a lore of short decisions says nothing about size", async () => {
	const root = await repo([
		{ id: "one", area: "global", why: 242 },
		{ id: "two", area: "backend", why: 200 },
	]);
	const result = await invoke(root, ["check"]);

	assert.equal(result.code, 0);
	assert.match(result.out, /^ok — 2 decisions/);
	assert.doesNotMatch(result.out + result.err, /budget/i, "a healthy lore must stay quiet");
});

test("an oversized why is reported, and says what to do with the overflow", async () => {
	const root = await repo([{ id: "fat", area: "backend", why: 2243 }]);
	const result = await invoke(root, ["check"]);

	assert.match(result.out, /## Why is 2243 chars \(budget 600\)/);
	assert.match(result.out, /behind the `source` link/, "a bare number does not help anyone");
});

test("the always-read budget names the area and the heaviest records", async () => {
	const root = await repo(
		Array.from({ length: 6 }, (_, n) => ({ id: `global-${n}`, area: "global", why: 1800 })),
	);
	const result = await invoke(root, ["check"]);

	assert.match(result.out, /global\/ \+ INDEX\.md/);
	assert.match(result.out, /read on every session/);
	assert.match(result.out, /~\d+ tokens/, "tokens are the unit the cost is felt in");
	assert.match(result.out, /Heaviest: global-\d+ \(\d+\)/);
	assert.match(result.out, /Move what is not truly global to an area/);
});

test("the same weight in a niche area does not trip the always-read budget", async () => {
	const fat = Array.from({ length: 6 }, (_, n) => ({
		id: `backend-${n}`,
		area: "backend",
		why: 1800,
	}));
	const result = await invoke(await repo(fat), ["check"]);

	assert.doesNotMatch(result.out, /read on every session/, "only global is a fixed cost");
	assert.match(result.out, /## Why is 1800 chars/, "but the per-decision note still fires");
});

test("size never fails the build, not even with --strict", async () => {
	const root = await repo(
		Array.from({ length: 8 }, (_, n) => ({ id: `global-${n}`, area: "global", why: 2200 })),
	);

	const lenient = await invoke(root, ["check"]);
	assert.equal(lenient.code, 0);

	const strict = await invoke(root, ["check", "--strict"]);
	assert.equal(
		strict.code,
		0,
		"a merge gate that fails on prose gets removed, taking the real checks with it",
	);
});

test("--strict still fails on things that make the lore actually wrong", async () => {
	const root = await repo([{ id: "one", area: "backend", why: 200 }]);
	writeFileSync(join(root, ".lore/INDEX.md"), "# stale\n", "utf8");

	assert.equal((await invoke(root, ["check", "--strict"])).code, 1, "the instrument still bites");
});

test("the budget is configurable, in both directions", async () => {
	const files = [{ id: "one", area: "backend", why: 800 }];

	const lax = await invoke(await repo(files, "budget:\n  why: 1000\n"), ["check"]);
	assert.doesNotMatch(lax.out, /## Why is/, "raising the budget silences it");

	const tight = await invoke(await repo(files, "budget:\n  why: 300\n"), ["check"]);
	assert.match(tight.out, /## Why is 800 chars \(budget 300\)/);
});

test("size findings go to stdout, so a gate that only watches stderr stays quiet", async () => {
	const root = await repo([{ id: "fat", area: "backend", why: 2243 }]);
	const result = await invoke(root, ["check"]);

	assert.match(result.out, /## Why is 2243/);
	assert.equal(result.err, "", "nothing on stderr for a lore that is merely wordy");
});

test("--approved says out loud that it skipped the gate, without disturbing the JSON", async () => {
	const root = await repo([{ id: "one", area: "backend", why: 200 }]);
	const payload = {
		id: "migrated",
		what: "A decision migrated from CLAUDE.md",
		scope: ["backend"],
		why: "Estaba en prosa en el CLAUDE.md y la migramos.",
		rejected: [{ option: "Dejarla en prosa", reason: "nadie la encontraba" }],
	};

	const { addFromJson } = await import("../source/commands/add-json.js");
	const { loadStore } = await import("../source/lib/store.js");
	const { result } = addFromJson(JSON.stringify(payload), loadStore(join(root, ".lore")), {
		approved: true,
		today: "2026-08-13",
	});
	assert.equal(result.ok, true, "the note must not change what the command does");
	assert.match(result.created[0]!.path, /^\.lore\/backend\//);
});
