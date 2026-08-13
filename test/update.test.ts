import assert from "node:assert/strict";
import { test } from "node:test";
import { isNewerVersion, PACKAGE_NAME } from "../source/commands/update.js";

test("version comparison only reports genuinely newer releases", () => {
	assert.equal(isNewerVersion("0.4.0", "0.5.0"), true);
	assert.equal(isNewerVersion("0.4.0", "0.4.1"), true);
	assert.equal(isNewerVersion("0.4.0", "1.0.0"), true);

	assert.equal(isNewerVersion("0.4.0", "0.4.0"), false);
	assert.equal(isNewerVersion("0.5.0", "0.4.9"), false, "never nag someone onto an older build");
	assert.equal(isNewerVersion("1.0.0", "0.9.9"), false);
});

test("an unparseable version never nags", () => {
	assert.equal(isNewerVersion("0.4.0", "not-a-version"), false);
	assert.equal(isNewerVersion("", "0.5.0"), false);
});

test("a prerelease suffix does not confuse the comparison", () => {
	assert.equal(isNewerVersion("0.4.0-beta.1", "0.4.0"), false);
	assert.equal(isNewerVersion("0.4.0", "0.5.0-rc.1"), true);
});

test("it updates the scoped package, not a guess at the bare name", () => {
	assert.equal(PACKAGE_NAME, "@minex-labs/lore");
});

test("running ahead of the published version says so, instead of 'you are up to date'", async () => {
	const { default: update } = await import("../source/commands/update.js");
	const out: string[] = [];
	const io = { out: (t: string) => out.push(t), err: (t: string) => out.push(t) };

	// The registry is stubbed: this asserts the wording, not the network.
	const original = globalThis.fetch;
	globalThis.fetch = (async () =>
		new Response(JSON.stringify({ version: "0.0.1" }), {
			headers: { "content-type": "application/json" },
		})) as typeof fetch;
	try {
		const code = await update({ argv: ["--check"], io, cwd: process.cwd() });
		assert.equal(code, 0, "being ahead is not an update being available");
		assert.match(out.join(""), /ahead of the published 0\.0\.1/);
	} finally {
		globalThis.fetch = original;
	}
});
