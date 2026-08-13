import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { parseDecision, type Decision } from "./decision.js";
import { GLOBAL_AREA, RESERVED_AREAS } from "./schema.js";

export const LORE_DIR = ".lore";
export const INBOX_DIR = "inbox";
export const INDEX_FILE = "INDEX.md";

export type LoadedDecision = {
	decision: Decision;
	/** Path relative to the lore directory, e.g. `backend/postgres-over-dynamo.md`. */
	file: string;
	/** The directory it lives in, which must equal `scope[0]`. */
	area: string;
};

export type Problem = { file: string; field: string; message: string };

export type Store = {
	/** Repo root: the directory containing `.lore/`. */
	root: string;
	loreDir: string;
	decisions: LoadedDecision[];
	problems: Problem[];
	/** Area directories that exist on disk, `global` first, then alphabetical. */
	areas: string[];
};

/**
 * Is this directory the root of a git repository?
 *
 * `.git` is a directory in an ordinary clone, but a **file** in a worktree and in
 * a submodule — both of which are everyday setups here — so this checks for
 * existence, not for a directory. Checking `isDirectory` would silently treat
 * every worktree as "not a repo" and walk straight past its root.
 */
function isRepoRoot(dir: string): boolean {
	return existsSync(join(dir, ".git"));
}

/**
 * Walk up from `cwd` looking for `.lore/`, stopping at the repo boundary.
 *
 * Going up is the point: in a monorepo, `packages/api/` must find the `.lore/` at
 * the root. Crossing into a *different* repo is not — a decision recorded while
 * standing in a nested repo would be versioned in a repo that does not govern it
 * and probably is not even cloned alongside it. And some repos are nested inside
 * others precisely to stay separate.
 *
 * So the rule is not "do not go up", it is "do not leave this repo". A directory
 * that is not in a repo at all has no boundary to respect, and walks to the root
 * as before.
 */
export function findLoreDir(cwd: string): string | undefined {
	let current = resolve(cwd);
	for (;;) {
		const candidate = join(current, LORE_DIR);
		try {
			if (statSync(candidate).isDirectory()) return candidate;
		} catch {
			// keep walking
		}
		// Checked after `.lore/`, so a lore at the repo root is still found.
		if (isRepoRoot(current)) return undefined;
		const parent = dirname(current);
		if (parent === current) return undefined;
		current = parent;
	}
}

/**
 * The nearest `.lore/` *outside* this repo, if any.
 *
 * Only for telling the user about it. Nothing reads or writes through this: a
 * command that silently used it would be the bug this boundary exists to stop.
 */
export function findLoreDirOutsideRepo(cwd: string): string | undefined {
	let current = resolve(cwd);
	let left = false;
	for (;;) {
		if (left) {
			const candidate = join(current, LORE_DIR);
			try {
				if (statSync(candidate).isDirectory()) return candidate;
			} catch {
				// keep walking
			}
		}
		if (isRepoRoot(current)) left = true;
		const parent = dirname(current);
		if (parent === current) return undefined;
		current = parent;
	}
}

function listAreas(loreDir: string): string[] {
	const entries = readdirSync(loreDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		// `inbox` is not an area. Excluding it here is the single reason a proposal
		// can never leak into the index, a listing, or a path lookup: the loader
		// simply never sees those files, so no command can forget to filter them.
		.filter((name) => !RESERVED_AREAS.includes(name as (typeof RESERVED_AREAS)[number]))
		.filter((name) => !name.startsWith("."));

	return entries.sort((a, b) => {
		if (a === GLOBAL_AREA) return -1;
		if (b === GLOBAL_AREA) return 1;
		return a.localeCompare(b);
	});
}

/**
 * Load every decision under `.lore/`. Never throws on bad content: problems come
 * back in the result so `check` can report all of them and the read commands can
 * carry on with whatever parsed.
 */
export function loadStore(loreDir: string): Store {
	const decisions: LoadedDecision[] = [];
	const problems: Problem[] = [];
	const areas = listAreas(loreDir);

	for (const area of areas) {
		const dir = join(loreDir, area);
		const files = readdirSync(dir, { withFileTypes: true })
			.filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
			.map((entry) => entry.name)
			.sort();

		for (const name of files) {
			const relativeFile = `${area}/${name}`;
			const raw = readFileSync(join(dir, name), "utf8");
			const result = parseDecision(raw);
			if (!result.ok) {
				for (const issue of result.issues) {
					problems.push({ file: relativeFile, field: issue.field, message: issue.message });
				}
				continue;
			}

			const decision = result.decision;
			const expectedName = `${decision.frontmatter.id}.md`;
			if (name !== expectedName) {
				problems.push({
					file: relativeFile,
					field: "id",
					message: `does not match the filename — expected ${expectedName}`,
				});
			}
			if (decision.frontmatter.scope[0] !== area) {
				problems.push({
					file: relativeFile,
					field: "scope",
					message: `first area is "${decision.frontmatter.scope[0]}" but the file lives in "${area}/" — the first scope decides the directory`,
				});
			}
			decisions.push({ decision, file: relativeFile, area });
		}
	}

	const byId = new Map<string, string>();
	for (const loaded of decisions) {
		const id = loaded.decision.frontmatter.id;
		const seen = byId.get(id);
		if (seen) {
			problems.push({
				file: loaded.file,
				field: "id",
				message: `is already used by ${seen} — ids are unique across the whole repo`,
			});
		} else {
			byId.set(id, loaded.file);
		}
	}

	for (const loaded of decisions) {
		const target = loaded.decision.frontmatter.superseded_by;
		if (target && !byId.has(target)) {
			problems.push({
				file: loaded.file,
				field: "superseded_by",
				message: `points at "${target}", which does not exist`,
			});
		}
	}

	return { root: dirname(loreDir), loreDir, decisions, problems, areas };
}

export function activeDecisions(store: Store): LoadedDecision[] {
	return store.decisions.filter((loaded) => loaded.decision.frontmatter.status === "active");
}

/** Sort by id, so inserting a decision does not reshuffle the file around it. */
export function byId(a: LoadedDecision, b: LoadedDecision): number {
	return a.decision.frontmatter.id.localeCompare(b.decision.frontmatter.id);
}

export function findById(store: Store, id: string): LoadedDecision | undefined {
	return store.decisions.find((loaded) => loaded.decision.frontmatter.id === id);
}

/** Ids that start with, or contain, a mistyped one — for "did you mean". */
export function suggestIds(store: Store, id: string, limit = 3): string[] {
	const needle = id.toLowerCase();
	return store.decisions
		.map((loaded) => loaded.decision.frontmatter.id)
		.filter((candidate) => candidate.includes(needle) || needle.includes(candidate))
		.slice(0, limit);
}

/** Normalise a user-supplied path to repo-relative POSIX form for glob matching. */
export function toRepoRelative(root: string, input: string): string {
	const absolute = resolve(root, input);
	return relative(root, absolute).split(sep).join("/");
}
