import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import {
	installArgs,
	installPrefix,
	isNewerVersion,
	PACKAGE_NAME,
} from "../source/commands/update.js";

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

test("the prefix comes from where this binary lives, not from whichever npm is on the PATH", () => {
	const posix = pathToFileURL(
		join(sep, "opt", "homebrew", "lib", "node_modules", "@minex-labs", "lore", "dist", "update.js"),
	).href;
	assert.equal(installPrefix(posix), join(sep, "opt", "homebrew"));

	// Windows puts globals straight under the prefix, with no `lib` in between.
	const flat = pathToFileURL(
		join(sep, "npm-global", "node_modules", "@minex-labs", "lore", "dist", "update.js"),
	).href;
	assert.equal(installPrefix(flat), join(sep, "npm-global"));
});

test("running from a clone names no prefix, rather than guessing one", () => {
	const clone = pathToFileURL(join(sep, "home", "me", "lore", "source", "update.ts")).href;
	assert.equal(installPrefix(clone), undefined);
});

test("the install targets that prefix explicitly", () => {
	assert.deepEqual(installArgs("/opt/homebrew"), [
		"install",
		"-g",
		"--prefix",
		"/opt/homebrew",
		`${PACKAGE_NAME}@latest`,
	]);
	assert.deepEqual(installArgs(undefined), ["install", "-g", `${PACKAGE_NAME}@latest`]);
});

test("npm exiting 0 is not an update: the version that answers is the one on the PATH", async () => {
	const { default: update } = await import("../source/commands/update.js");
	const out: string[] = [];
	const io = { out: (t: string) => out.push(t), err: (t: string) => out.push(t) };

	// An npm that succeeds and installs nothing here — the split-prefix case, where
	// the write lands in a tree this process will never load from.
	const fake = mkdtempSync(join(tmpdir(), "lore-npm-"));
	writeFileSync(join(fake, "npm"), "#!/bin/sh\nexit 0\n", "utf8");
	chmodSync(join(fake, "npm"), 0o755);

	const originalFetch = globalThis.fetch;
	const originalPath = process.env["PATH"];
	globalThis.fetch = (async () =>
		new Response(JSON.stringify({ version: "999.0.0" }), {
			headers: { "content-type": "application/json" },
		})) as typeof fetch;
	process.env["PATH"] = `${fake}:${originalPath ?? ""}`;
	try {
		const code = await update({ argv: [], io, cwd: process.cwd() });
		assert.equal(code, 2, "nothing was updated, so this is not a success");
		assert.match(
			out.join(""),
			/npm reported success, but the lore this command runs from is still/,
		);
		assert.doesNotMatch(out.join(""), /Updated to 999\.0\.0/);
	} finally {
		globalThis.fetch = originalFetch;
		process.env["PATH"] = originalPath ?? "";
	}
});
