import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { BLOCK_END, BLOCK_START, injectBlock } from "../source/lib/claude-block.js";
import { invoke } from "./helpers.js";

function emptyRepo(): string {
	return mkdtempSync(join(tmpdir(), "lore-init-"));
}

test("init creates the structure and reports what it wrote", async () => {
	const root = emptyRepo();
	const result = await invoke(root, ["init"]);

	assert.equal(result.code, 0);
	for (const path of [
		".lore/config.yml",
		".lore/README.md",
		".lore/INDEX.md",
		".lore/inbox/.gitkeep",
		"CLAUDE.md",
	]) {
		assert.ok(existsSync(join(root, path)), `missing ${path}`);
	}
	assert.match(result.out, /wrote {2}\.lore\/config\.yml/);
	assert.match(result.out, /Record the first decision with `lore add`/);
});

test("the inbox ships with a .gitkeep so it survives a clone", async () => {
	const root = emptyRepo();
	await invoke(root, ["init"]);
	assert.ok(existsSync(join(root, ".lore/inbox/.gitkeep")));
});

test("init writes the block into a CLAUDE.md that did not exist", async () => {
	const root = emptyRepo();
	await invoke(root, ["init"]);
	const claudeMd = readFileSync(join(root, "CLAUDE.md"), "utf8");
	assert.ok(claudeMd.includes(BLOCK_START) && claudeMd.includes(BLOCK_END));
	assert.match(claudeMd, /Read `\.lore\/INDEX\.md`/);
});

test("init appends to an existing CLAUDE.md without disturbing it", async () => {
	const root = emptyRepo();
	writeFileSync(join(root, "CLAUDE.md"), "# CLAUDE.md\n\nMis reglas de siempre.\n", "utf8");
	await invoke(root, ["init"]);

	const claudeMd = readFileSync(join(root, "CLAUDE.md"), "utf8");
	assert.match(claudeMd, /Mis reglas de siempre\./);
	assert.ok(claudeMd.indexOf("Mis reglas") < claudeMd.indexOf(BLOCK_START));
});

test("running init twice changes nothing the second time", async () => {
	const root = emptyRepo();
	await invoke(root, ["init"]);
	const snapshot = ["CLAUDE.md", ".lore/config.yml", ".lore/INDEX.md", ".lore/README.md"].map(
		(path) => readFileSync(join(root, path), "utf8"),
	);

	const second = await invoke(root, ["init"]);
	assert.equal(second.code, 0);
	assert.match(second.out, /already set up here/);
	assert.match(second.out, /kept {2}\.lore\/config\.yml/);
	assert.doesNotMatch(second.out, /wrote/, "a no-op run must not claim it wrote anything");

	const after = ["CLAUDE.md", ".lore/config.yml", ".lore/INDEX.md", ".lore/README.md"].map((path) =>
		readFileSync(join(root, path), "utf8"),
	);
	assert.deepEqual(after, snapshot);
});

test("init never overwrites an edited config", async () => {
	const root = emptyRepo();
	await invoke(root, ["init"]);
	writeFileSync(join(root, ".lore/config.yml"), "areas:\n  backend: My own words\n", "utf8");

	await invoke(root, ["init"]);
	assert.match(readFileSync(join(root, ".lore/config.yml"), "utf8"), /My own words/);
});

test("re-running init refreshes the index instead of blanking it", async () => {
	const root = emptyRepo();
	await invoke(root, ["init"]);

	mkdirSync(join(root, ".lore/backend"), { recursive: true });
	writeFileSync(
		join(root, ".lore/backend/raw-sql-no-orm.md"),
		[
			"---",
			"id: raw-sql-no-orm",
			"what: Write SQL by hand, no ORM",
			"scope: [backend]",
			"status: active",
			"date: 2026-08-11",
			"---",
			"",
			"## Why",
			"",
			"Las queries que importan son cinco.",
			"",
			"## Rejected",
			"",
			"- **Prisma** — el generated client se desincronizaba.",
			"",
		].join("\n"),
		"utf8",
	);

	await invoke(root, ["init"]);
	const index = readFileSync(join(root, ".lore/INDEX.md"), "utf8");
	assert.match(index, /raw-sql-no-orm/);
	assert.doesNotMatch(index, /No decisions recorded yet/);
});

test("init from a subdirectory finds the existing lore instead of nesting a new one", async () => {
	const root = emptyRepo();
	await invoke(root, ["init"]);
	const nested = join(root, "packages", "api");
	mkdirSync(nested, { recursive: true });

	await invoke(nested, ["init"]);
	assert.ok(!existsSync(join(nested, ".lore")), "must not create a second .lore/");
});

test("--no-claude-md leaves the file alone", async () => {
	const root = emptyRepo();
	await invoke(root, ["init", "--no-claude-md"]);
	assert.ok(existsSync(join(root, ".lore/config.yml")));
	assert.ok(!existsSync(join(root, "CLAUDE.md")));
});

test("injectBlock replaces an old block in place rather than stacking copies", () => {
	const stale = `# CLAUDE.md\n\n${BLOCK_START}\nold instructions\n${BLOCK_END}\n\nMás reglas.\n`;
	const result = injectBlock(stale);

	assert.equal(result.action, "replaced");
	assert.equal(result.text.match(new RegExp(BLOCK_START, "g"))?.length, 1);
	assert.doesNotMatch(result.text, /old instructions/);
	assert.match(result.text, /Más reglas\./, "content after the block must survive");
	assert.equal(injectBlock(result.text).action, "unchanged");
});
