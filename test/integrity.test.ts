import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { invoke, makeRepo, type Fixture } from "./helpers.js";

const REPO: Record<string, Fixture> = {
	"rest-with-openapi": { what: "Expose the API as REST with an OpenAPI spec", scope: ["api"] },
	"trpc-over-rest": { what: "Expose the API over tRPC, not REST", scope: ["api"] },
	"raw-sql-no-orm": { what: "Write SQL by hand, no ORM", scope: ["backend"] },
};

const CONFIG =
	"areas:\n  global: Everywhere\n  api: The HTTP surface\n  backend: API and workers\n";

async function setup(fixtures = REPO): Promise<string> {
	const root = makeRepo(fixtures);
	await invoke(root, ["init"]);
	writeFileSync(join(root, ".lore/config.yml"), CONFIG, "utf8");
	await invoke(root, ["index"]);
	return root;
}

function read(root: string, file: string): string {
	return readFileSync(join(root, ".lore", file), "utf8");
}

test("supersede refuses to run without saying why", async () => {
	const root = await setup();
	const result = await invoke(root, ["supersede", "rest-with-openapi", "--by", "trpc-over-rest"]);

	assert.equal(result.code, 2);
	assert.match(result.err, /does not say why it replaced/);
	assert.match(read(root, "api/rest-with-openapi.md"), /status: active/, "nothing changed");
});

test("supersede with a reason flips the old one and records it on the new one", async () => {
	const root = await setup();
	const result = await invoke(root, [
		"supersede",
		"rest-with-openapi",
		"--by",
		"trpc-over-rest",
		"--reason",
		"el codegen se desincronizaba en cada release",
	]);

	assert.equal(result.code, 0);

	const older = read(root, "api/rest-with-openapi.md");
	assert.match(older, /status: superseded/);
	assert.match(older, /superseded_by: trpc-over-rest/);

	const newer = read(root, "api/trpc-over-rest.md");
	assert.match(newer, /- \*\*Expose the API as REST with an OpenAPI spec\*\* — el codegen/);
	assert.match(result.out, /Added "Expose the API as REST with an OpenAPI spec"/);
});

test("the superseded decision leaves the index but stays on disk", async () => {
	const root = await setup();
	await invoke(root, ["supersede", "rest-with-openapi", "--by", "trpc-over-rest", "--reason", "x"]);

	const index = read(root, "INDEX.md");
	assert.doesNotMatch(index, /rest-with-openapi/);
	assert.match(index, /trpc-over-rest/);
	assert.match(read(root, "api/rest-with-openapi.md"), /Expose the API as REST/);

	const listed = await invoke(root, ["list", "--status", "superseded"]);
	assert.match(listed.out, /rest-with-openapi/);
});

test("--no-reason is allowed when the new decision already rejects the old one", async () => {
	const root = await setup();
	await invoke(root, ["supersede", "rest-with-openapi", "--by", "trpc-over-rest", "--no-reason"]);
	assert.match(read(root, "api/rest-with-openapi.md"), /status: superseded/);
});

test("supersede does not duplicate a rejected option that is already there", async () => {
	const root = await setup();
	const args = [
		"supersede",
		"rest-with-openapi",
		"--by",
		"trpc-over-rest",
		"--reason",
		"porque sí",
	];
	await invoke(root, args);

	const newer = read(root, "api/trpc-over-rest.md");
	assert.equal(newer.match(/Expose the API as REST with an OpenAPI spec/g)?.length, 1);
});

test("supersede refuses self-reference, missing ids and double retirement", async () => {
	const root = await setup();

	const self = await invoke(root, ["supersede", "trpc-over-rest", "--by", "trpc-over-rest"]);
	assert.match(self.err, /cannot supersede itself/);

	const missing = await invoke(root, ["supersede", "nope", "--by", "trpc-over-rest"]);
	assert.match(missing.err, /no decision with id "nope"/);

	await invoke(root, ["supersede", "rest-with-openapi", "--by", "trpc-over-rest", "--reason", "x"]);
	const again = await invoke(root, ["supersede", "rest-with-openapi", "--by", "raw-sql-no-orm"]);
	assert.match(again.err, /already superseded/);
});

test("check is clean on a healthy repo", async () => {
	const root = await setup();
	const result = await invoke(root, ["check"]);
	assert.equal(result.code, 0, result.err);
	assert.match(result.out, /^ok — 3 decisions/);
});

test("check catches a stale index", async () => {
	const root = await setup();
	writeFileSync(join(root, ".lore/INDEX.md"), "# stale\n", "utf8");

	const result = await invoke(root, ["check"]);
	assert.equal(result.code, 1);
	assert.match(result.err, /INDEX\.md.*out of date/);
});

test("check catches a scope that is not declared in config.yml", async () => {
	const root = await setup();
	writeFileSync(join(root, ".lore/config.yml"), "areas:\n  global: Everywhere\n", "utf8");

	const result = await invoke(root, ["check"]);
	assert.equal(result.code, 1);
	assert.match(result.err, /scope "api" is not declared/);
});

test("check reports a dangling supersede target", async () => {
	const root = await setup();
	writeFileSync(
		join(root, ".lore/api/rest-with-openapi.md"),
		read(root, "api/rest-with-openapi.md")
			.replace("status: active", "status: superseded")
			.replace("date:", "superseded_by: ghost\ndate:"),
		"utf8",
	);

	const result = await invoke(root, ["check"]);
	assert.match(result.err, /points at "ghost", which does not exist/);
});

test("a dead paths glob is a warning, not an error, unless --strict", async () => {
	const root = await setup({
		...REPO,
		"raw-sql-no-orm": { what: "Write SQL by hand, no ORM", scope: ["backend"], paths: ["gone/**"] },
	});

	const lenient = await invoke(root, ["check"]);
	assert.equal(lenient.code, 0, "a moved file must not break the build");
	assert.match(lenient.err, /matches no file in the repo/);
	assert.match(lenient.err, /use --strict in CI/);

	const strict = await invoke(root, ["check", "--strict"]);
	assert.equal(strict.code, 1);
});

test("check warns when global stops being small", async () => {
	const fixtures: Record<string, Fixture> = {};
	for (let n = 0; n < 12; n += 1) {
		fixtures[`rule-${n}`] = { what: `Global rule number ${n}`, scope: ["global"] };
	}
	const root = await setup(fixtures);

	const result = await invoke(root, ["check"]);
	assert.match(result.err, /12 active decisions are read on every session/);
	assert.equal(result.code, 0, "a budget nudge is not a failure");
});

test("pending proposals are reported as info, not as a problem", async () => {
	const root = makeRepo(REPO, { inbox: ["some-proposal"] });
	await invoke(root, ["init"]);
	writeFileSync(join(root, ".lore/config.yml"), CONFIG, "utf8");
	await invoke(root, ["index"]);

	const result = await invoke(root, ["check"]);
	assert.equal(result.code, 0);
	assert.match(result.out, /1 proposal is waiting for `lore review`/);
});

test("check --json is machine readable and agrees with the exit code", async () => {
	const root = await setup();
	writeFileSync(join(root, ".lore/INDEX.md"), "# stale\n", "utf8");

	const result = await invoke(root, ["check", "--json"]);
	const parsed = JSON.parse(result.out) as { ok: boolean; findings: { severity: string }[] };
	assert.equal(parsed.ok, false);
	assert.equal(result.code, 1);
	assert.ok(parsed.findings.some((finding) => finding.severity === "error"));
});

test("revoke --json writes the replacement and retires the old decision", async () => {
	const root = await setup();
	const payload = {
		what: "Stop writing SQL by hand; use the query builder",
		scope: ["backend"],
		why: "El equipo creció y las queries a mano se volvieron el cuello de botella del review.",
		id: "query-builder-over-raw-sql",
	};

	const result = await invokeWithStdin(root, ["revoke", "raw-sql-no-orm", "--json"], payload);
	assert.equal(result.code, 0, result.err);

	const replacement = read(root, "backend/query-builder-over-raw-sql.md");
	assert.match(
		replacement,
		/- \*\*Write SQL by hand, no ORM\*\* —/,
		"the retired decision must be rejected here",
	);

	const older = read(root, "backend/raw-sql-no-orm.md");
	assert.match(older, /status: superseded/);
	assert.match(older, /superseded_by: query-builder-over-raw-sql/);

	assert.equal((await invoke(root, ["check"])).code, 0, "the repo stays valid after a revoke");
});

async function invokeWithStdin(root: string, argv: string[], payload: unknown) {
	const original = Object.getOwnPropertyDescriptor(process, "stdin");
	const { Readable } = await import("node:stream");
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
