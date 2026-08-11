import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../source/app.js";

export type Fixture = {
	what: string;
	scope: string[];
	status?: "active" | "superseded";
	superseded_by?: string;
	paths?: string[];
	id?: string;
};

/** Build a throwaway repo with a `.lore/` in it and return its root. */
export function makeRepo(fixtures: Record<string, Fixture>, extra?: { inbox?: string[] }): string {
	const root = mkdtempSync(join(tmpdir(), "lore-test-"));
	mkdirSync(join(root, ".lore"), { recursive: true });

	for (const [id, fixture] of Object.entries(fixtures)) {
		const area = fixture.scope[0]!;
		mkdirSync(join(root, ".lore", area), { recursive: true });
		writeFileSync(join(root, ".lore", area, `${fixture.id ?? id}.md`), render(id, fixture), "utf8");
	}

	for (const id of extra?.inbox ?? []) {
		mkdirSync(join(root, ".lore", "inbox"), { recursive: true });
		writeFileSync(
			join(root, ".lore", "inbox", `${id}.md`),
			render(id, { what: `Proposed ${id}`, scope: ["backend"] }),
			"utf8",
		);
	}

	return root;
}

function render(id: string, fixture: Fixture): string {
	const lines = [
		"---",
		`id: ${id}`,
		`what: ${fixture.what}`,
		`scope: [${fixture.scope.join(", ")}]`,
		`status: ${fixture.status ?? "active"}`,
	];
	if (fixture.superseded_by) lines.push(`superseded_by: ${fixture.superseded_by}`);
	lines.push("date: 2026-08-11");
	if (fixture.paths) lines.push(`paths: [${fixture.paths.join(", ")}]`);
	lines.push(
		"---",
		"",
		"## Why",
		"",
		"Porque sí, y por eso.",
		"",
		"## Rejected",
		"",
		"- **La otra opción** — no servía para nuestro caso.",
		"",
	);
	return lines.join("\n");
}

export type Invocation = { code: number; out: string; err: string };

export async function invoke(root: string, argv: string[]): Promise<Invocation> {
	const out: string[] = [];
	const err: string[] = [];
	const code = await run(argv, { out: (t) => out.push(t), err: (t) => err.push(t) }, root);
	return { code, out: out.join(""), err: err.join("") };
}
