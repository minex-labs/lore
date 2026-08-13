import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { findLoreDir, findLoreDirOutsideRepo } from "../source/lib/store.js";
import { invoke } from "./helpers.js";

/**
 * The rule under test is not "do not walk up" — it is "do not leave this repo".
 *
 * Every negative case below has a positive twin. A test that only checks "the
 * nested repo does not see the outer lore" passes just as well against a CLI that
 * is broken and sees nothing at all, so each one is paired with a case proving the
 * instrument still discriminates.
 */

function git(cwd: string, ...args: string[]): string {
	return execFileSync("git", args, {
		cwd,
		encoding: "utf8",
		env: {
			...process.env,
			GIT_AUTHOR_NAME: "t",
			GIT_AUTHOR_EMAIL: "t@t",
			GIT_COMMITTER_NAME: "t",
			GIT_COMMITTER_EMAIL: "t@t",
		},
	});
}

function sandbox(): string {
	return mkdtempSync(join(tmpdir(), "lore-boundary-"));
}

const DECISION = {
	id: "outer-decision",
	what: "A decision that belongs to the outer repo",
	scope: ["global"],
	why: "Es del repo de afuera.",
	rejected: [{ option: "Otra cosa", reason: "no servía" }],
};

async function seed(root: string): Promise<void> {
	await invoke(root, ["init"]);
	const { addFromJson } = await import("../source/commands/add-json.js");
	const { loadStore } = await import("../source/lib/store.js");
	addFromJson(JSON.stringify(DECISION), loadStore(join(root, ".lore")), {
		approved: true,
		today: "2026-08-13",
	});
}

test("a monorepo package still finds the lore at the repo root", async () => {
	const root = sandbox();
	git(root, "init", "-q", ".");
	await seed(root);
	const pkg = join(root, "packages", "api");
	mkdirSync(pkg, { recursive: true });

	assert.equal(findLoreDir(pkg), join(root, ".lore"));
	assert.match((await invoke(pkg, ["list"])).out, /outer-decision/, "walking up must still work");
});

test("a nested git repo does not see the outer repo's lore", async () => {
	const root = sandbox();
	git(root, "init", "-q", ".");
	await seed(root);
	const inner = join(root, "inner");
	mkdirSync(inner, { recursive: true });
	git(inner, "init", "-q", ".");

	assert.equal(findLoreDir(inner), undefined);
	const result = await invoke(inner, ["list"]);
	assert.equal(result.code, 2);
	assert.match(result.err, /no \.lore\/ directory in this repo/);
	assert.match(result.err, /different git repo — lore does not read across that boundary/);
});

test("a nested repo with its own lore sees only its own", async () => {
	const root = sandbox();
	git(root, "init", "-q", ".");
	await seed(root);
	const inner = join(root, "inner");
	mkdirSync(inner, { recursive: true });
	git(inner, "init", "-q", ".");
	await invoke(inner, ["init"]);

	assert.equal(findLoreDir(inner), join(inner, ".lore"));
	const listed = await invoke(inner, ["list"]);
	assert.doesNotMatch(listed.out, /outer-decision/);
});

test("writing from a nested repo never lands in the outer repo", async () => {
	const root = sandbox();
	git(root, "init", "-q", ".");
	await seed(root);
	const inner = join(root, "inner");
	mkdirSync(inner, { recursive: true });
	git(inner, "init", "-q", ".");
	await invoke(inner, ["init"]);

	const { addFromJson } = await import("../source/commands/add-json.js");
	const { loadStore } = await import("../source/lib/store.js");
	const dir = findLoreDir(inner)!;
	addFromJson(JSON.stringify({ ...DECISION, id: "written-inside" }), loadStore(dir), {
		approved: true,
		today: "2026-08-13",
	});

	assert.ok(existsSync(join(inner, ".lore/global/written-inside.md")));
	assert.equal(
		existsSync(join(root, ".lore/global/written-inside.md")),
		false,
		"a decision recorded inside must never be versioned in the outer repo",
	);
});

test("a git worktree behaves like its repo, even though .git is a file", async () => {
	const root = sandbox();
	git(root, "init", "-q", ".");
	await seed(root);
	git(root, "add", "-A");
	git(root, "commit", "-qm", "seed");

	const worktree = join(root, "..", `wt-${Date.now().toString(36)}`);
	git(root, "worktree", "add", "-q", worktree, "-b", "branch");

	// The trap: in a worktree `.git` is a file, so an isDirectory check would miss
	// the repo root entirely and keep walking into whatever is above it.
	assert.ok(readFileSync(join(worktree, ".git"), "utf8").startsWith("gitdir:"));

	const nested = join(worktree, "packages");
	mkdirSync(nested, { recursive: true });
	assert.equal(findLoreDir(nested), join(worktree, ".lore"), "must find the worktree's own lore");
	assert.match((await invoke(nested, ["list"])).out, /outer-decision/);
});

test("a worktree does not reach past its own root into a parent repo", async () => {
	const outer = sandbox();
	git(outer, "init", "-q", ".");
	await seed(outer);

	const inner = join(outer, "inner");
	mkdirSync(inner, { recursive: true });
	git(inner, "init", "-q", ".");
	writeFileSync(join(inner, "f.txt"), "x", "utf8");
	git(inner, "add", "-A");
	git(inner, "commit", "-qm", "x");

	const worktree = join(outer, "wt");
	git(inner, "worktree", "add", "-q", worktree, "-b", "b");

	assert.equal(findLoreDir(worktree), undefined, "the worktree of the inner repo has no lore");
});

/**
 * A submodule's `.git` is a file too, so it is treated as its own repo. Whether
 * that is the policy we want is a question for the tool's owner — this test exists
 * so the behaviour is written down rather than left undefined.
 */
test("a submodule is treated as its own repo, so it does not see the parent's lore", async () => {
	const root = sandbox();
	git(root, "init", "-q", ".");
	await seed(root);

	const donor = sandbox();
	git(donor, "init", "-q", ".");
	writeFileSync(join(donor, "f.txt"), "x", "utf8");
	git(donor, "add", "-A");
	git(donor, "commit", "-qm", "x");

	git(root, "-c", "protocol.file.allow=always", "submodule", "add", "-q", donor, "sub");
	const sub = join(root, "sub");
	assert.ok(existsSync(join(sub, ".git")));
	assert.equal(findLoreDir(sub), undefined);
});

test("findLoreDirOutsideRepo reports the outer lore without ever reading it", async () => {
	const root = sandbox();
	git(root, "init", "-q", ".");
	await seed(root);
	const inner = join(root, "inner");
	mkdirSync(inner, { recursive: true });
	git(inner, "init", "-q", ".");

	assert.equal(findLoreDirOutsideRepo(inner), join(root, ".lore"));
	assert.equal(findLoreDir(inner), undefined, "reporting it is not reading it");
});

test("init in a nested repo creates a local lore and says the other one is elsewhere", async () => {
	const root = sandbox();
	git(root, "init", "-q", ".");
	await seed(root);
	const inner = join(root, "inner");
	mkdirSync(inner, { recursive: true });
	git(inner, "init", "-q", ".");

	const result = await invoke(inner, ["init"]);
	assert.equal(result.code, 0);
	assert.ok(existsSync(join(inner, ".lore/config.yml")), "must create one here");
	assert.match(result.out, /another \.lore\/ at .*different git repo/);
	assert.match(result.out, /nothing written here goes there/);
});

test("init --local creates a lore even when the repo root already has one", async () => {
	const root = sandbox();
	git(root, "init", "-q", ".");
	await seed(root);
	const pkg = join(root, "packages", "api");
	mkdirSync(pkg, { recursive: true });

	await invoke(pkg, ["init", "--local"]);
	assert.ok(existsSync(join(pkg, ".lore/config.yml")));
	assert.equal(findLoreDir(pkg), join(pkg, ".lore"), "the closer one wins from here on");
	assert.equal(findLoreDir(root), join(root, ".lore"), "the root one is untouched");
});

test("a directory in no repo at all still walks up, as before", async () => {
	const root = sandbox();
	await invoke(root, ["init"]);
	const deep = join(root, "a", "b");
	mkdirSync(deep, { recursive: true });

	assert.equal(findLoreDir(deep), join(root, ".lore"), "no repo means no boundary to respect");
});
