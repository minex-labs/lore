import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { addFromJson } from "../source/commands/add-json.js";
import { loadStore } from "../source/lib/store.js";
import { invoke, makeRepo } from "./helpers.js";

/**
 * The writer and the reader of the same tool, in one test.
 *
 * The bug this pins was not that a file failed to parse — it was that `lore add`
 * returned `{"ok": true}`, `lore check --strict` counted the file and exited 0,
 * and `lore review` silently offered fewer proposals than existed. Every
 * individual assertion anyone would have written passed. The assertion that
 * matters is the one nobody had: **what `add` wrote, `review` can see.**
 */

const WHY = "Porque si, y este why es suficientemente largo para pasar cualquier minimo razonable.";

async function repo(): Promise<string> {
	const root = makeRepo({});
	await invoke(root, ["init"]);
	return root;
}

function propose(root: string, id: string, option: string, reason = "R."): boolean {
	const { result } = addFromJson(
		JSON.stringify({ id, what: "W", why: WHY, scope: ["global"], rejected: [{ option, reason }] }),
		loadStore(join(root, ".lore")),
		{ approved: false, today: "2026-08-15" },
	);
	return result.ok;
}

/** Long enough that the writer used to wrap mid-bullet: the measured threshold is ~88. */
const LONG =
	"Una opcion deliberadamente larga que supera los noventa caracteres para forzar el wrap del escritor";

test("every option shape lore accepts survives the trip back through review", async () => {
	const shapes: [string, string][] = [
		["short", "Corta"],
		["long-with-spaces", LONG],
		["long-without-spaces", LONG.replace(/ /g, "-")],
		[
			"backticks",
			"El flag `--no-verify` de git, que es bastante largo para forzar el wrap igual que el resto",
		],
		[
			"em-dash-inside",
			"Postgres — con read replicas, y una coletilla larga para empujar el ancho de la linea",
		],
		[
			"asterisks-inside",
			"El glob **/*.ts junto con una explicacion larga que empuja la linea mas alla del ancho",
		],
		[
			"quotes",
			'El modo "estricto" del linter, con una coletilla larga que empuja mas alla del ancho',
		],
		[
			"brackets",
			"El array [1,2,3] literal, con una coletilla larga que empuja mas alla del ancho maximo",
		],
		["at-the-boundary", "x".repeat(40) + " " + "y".repeat(48)],
	];

	const root = await repo();
	for (const [id, option] of shapes) {
		assert.equal(propose(root, id, option), true, `add refused ${id}`);
	}

	const listed = await invoke(root, ["review", "--list"]);
	for (const [id] of shapes) {
		assert.match(
			listed.out,
			new RegExp(`^${id}\\b`, "m"),
			`review cannot see ${id}, which add wrote`,
		);
	}
	assert.equal(listed.err, "", "nothing should have been skipped");
});

test("a long option is written so it can be read back, and check agrees with review", async () => {
	const root = await repo();
	propose(root, "long", LONG);

	const file = readFileSync(join(root, ".lore/inbox/long.md"), "utf8");
	const bullet = file.slice(file.indexOf("- **")).split("\n")[0]!;
	assert.match(bullet, /^- \*\*.+\*\* —/, "the head must stay whole on one line");

	const checked = await invoke(root, ["check", "--strict"]);
	assert.equal(checked.code, 0, checked.err);
	assert.match(checked.out, /1 proposal is waiting/);

	const listed = await invoke(root, ["review", "--list"]);
	assert.match(listed.out, /^long\b/m, "check and review must count the same thing");
});

test("a file review cannot read is an error in check, not a silent skip", async () => {
	const root = await repo();
	propose(root, "readable", "Corta");

	// Hand-write the shape older versions produced: the bold split across lines.
	writeFileSync(
		join(root, ".lore/inbox/broken.md"),
		[
			"---",
			"id: broken",
			"what: W",
			"scope: [global]",
			"status: active",
			"date: 2026-08-15",
			"---",
			"",
			"## Why",
			"",
			WHY,
			"",
			"## Rejected",
			"",
			"- **Una opcion",
			"",
			"  partida por la mitad** — R.",
			"",
		].join("\n"),
		"utf8",
	);

	const checked = await invoke(root, ["check"]);
	assert.equal(checked.code, 1, "an unpromotable proposal must not pass as a note");
	assert.match(checked.err, /inbox\/broken\.md/);
	assert.match(checked.err, /can never be approved/);
	assert.match(checked.out, /1 proposal is waiting/, "and the readable one is still counted");

	const listed = await invoke(root, ["review", "--list"]);
	assert.match(listed.err, /1 proposal in the inbox cannot be read/);
	assert.match(listed.err, /broken:/);
	assert.match(listed.out, /^readable\b/m);
});

test("an inbox of only unreadable files does not exit like an empty one", async () => {
	const root = await repo();
	writeFileSync(join(root, ".lore/inbox/junk.md"), "not a decision at all\n", "utf8");

	const result = await invoke(root, ["review"]);
	assert.notEqual(result.code, 0, "three states, not two: empty is not the same as unreadable");
	assert.doesNotMatch(result.out, /Nothing waiting for review/);
	assert.match(result.err, /cannot be read/);
});

test("bold split across lines is still readable, so files written by older versions recover", async () => {
	const { parseDecision } = await import("../source/lib/decision.js");
	const parsed = parseDecision(
		[
			"---",
			"id: legacy",
			"what: W",
			"scope: [global]",
			"status: active",
			"date: 2026-08-15",
			"---",
			"",
			"## Why",
			"",
			WHY,
			"",
			"## Rejected",
			"",
			"- **Una opcion deliberadamente larga que supera los noventa caracteres para forzar el wrap del",
			"  escritor** — R.",
			"",
		].join("\n"),
	);

	assert.ok(parsed.ok, `a file an older lore wrote must still parse: ${JSON.stringify(parsed)}`);
	assert.equal(
		parsed.decision.rejected[0]?.option,
		"Una opcion deliberadamente larga que supera los noventa caracteres para forzar el wrap del escritor",
	);
	assert.equal(parsed.decision.rejected[0]?.reason, "R.");
});
