import assert from "node:assert/strict";
import { test } from "node:test";
import { run } from "../source/app.js";
import { COMMANDS } from "../source/commands/registry.js";
import { getVersion } from "../source/lib/version.js";

function capture() {
	const out: string[] = [];
	const err: string[] = [];
	return {
		io: { out: (t: string) => out.push(t), err: (t: string) => err.push(t) },
		out: () => out.join(""),
		err: () => err.join(""),
	};
}

test("no arguments prints help and exits 0", async () => {
	const c = capture();
	assert.equal(await run([], c.io), 0);
	assert.match(c.out(), /Usage: lore <command>/);
});

test("help lists every registered command", async () => {
	const c = capture();
	await run(["--help"], c.io);
	for (const command of COMMANDS) {
		assert.match(c.out(), new RegExp(`\\b${command.name}\\b`), `missing ${command.name}`);
	}
});

test("--version prints the package version", async () => {
	const c = capture();
	assert.equal(await run(["--version"], c.io), 0);
	assert.equal(c.out().trim(), getVersion());
});

test("unknown command exits 2 and says so on stderr", async () => {
	const c = capture();
	assert.equal(await run(["nope"], c.io), 2);
	assert.match(c.err(), /unknown command "nope"/);
	assert.equal(c.out(), "");
});

test("a known but unimplemented command exits 2, never 0", async () => {
	const c = capture();
	assert.equal(await run(["add"], c.io), 2);
	assert.match(c.err(), /not implemented yet/);
});

test("per-command help exits 0 and shows its usage line", async () => {
	const c = capture();
	assert.equal(await run(["supersede", "--help"], c.io), 0);
	assert.match(c.out(), /lore supersede <old-id> --by <new-id>/);
});
