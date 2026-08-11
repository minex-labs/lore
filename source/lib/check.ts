import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import picomatch from "picomatch";
import { declaredAreas, loadConfig } from "./config.js";
import { renderIndex } from "./index-file.js";
import { GLOBAL_AREA } from "./schema.js";
import { INDEX_FILE, type Store } from "./store.js";
import { inboxIds } from "./write.js";

export type Severity = "error" | "warning" | "info";
export type Finding = { severity: Severity; where: string; message: string };

/** Above this, `global` has stopped being "read every session" and become a dump. */
export const GLOBAL_BUDGET = 10;

const IGNORED_DIRS = new Set([
	".git",
	"node_modules",
	"dist",
	"build",
	".next",
	"coverage",
	".lore",
]);

/**
 * Validate the lore.
 *
 * The split between error and warning is deliberate. Errors are things that make
 * the lore wrong or unreadable — bad frontmatter, a dangling supersede, a stale
 * index. Warnings are things that are probably rot but might just be a refactor in
 * flight: a glob that no longer matches anything would block every legitimate
 * file move if it failed the build, so it takes `--strict` to make it fatal.
 */
export function check(store: Store): Finding[] {
	const findings: Finding[] = [];

	for (const problem of store.problems) {
		findings.push({
			severity: "error",
			where: problem.file,
			message: `${problem.field} ${problem.message}`,
		});
	}

	const { config, problem: configProblem } = loadConfig(store.loreDir);
	if (configProblem) {
		findings.push({ severity: "error", where: "config.yml", message: configProblem });
	}

	const areas = new Set(declaredAreas(config));
	if (areas.size > 0) {
		for (const loaded of store.decisions) {
			for (const area of loaded.decision.frontmatter.scope) {
				if (!areas.has(area)) {
					findings.push({
						severity: "error",
						where: loaded.file,
						message: `scope "${area}" is not declared in config.yml`,
					});
				}
			}
		}
	}

	const indexPath = join(store.loreDir, INDEX_FILE);
	const expected = renderIndex(store);
	const actual = (() => {
		try {
			return readFileSync(indexPath, "utf8");
		} catch {
			return undefined;
		}
	})();
	if (actual === undefined) {
		findings.push({
			severity: "error",
			where: INDEX_FILE,
			message: "is missing — run `lore index`",
		});
	} else if (actual !== expected) {
		findings.push({
			severity: "error",
			where: INDEX_FILE,
			message: "is out of date — run `lore index`",
		});
	}

	const globalCount = store.decisions.filter(
		(loaded) =>
			loaded.decision.frontmatter.status === "active" &&
			loaded.decision.frontmatter.scope.includes(GLOBAL_AREA),
	).length;
	if (globalCount > GLOBAL_BUDGET) {
		findings.push({
			severity: "warning",
			where: `${GLOBAL_AREA}/`,
			message: `${globalCount} active decisions are read on every session (budget ${GLOBAL_BUDGET}) — scope some of them to an area`,
		});
	}

	findings.push(...checkPaths(store));

	const pending = inboxIds(store.loreDir);
	if (pending.length > 0) {
		findings.push({
			severity: "info",
			where: "inbox/",
			message: `${pending.length} ${pending.length === 1 ? "proposal is" : "proposals are"} waiting for \`lore review\``,
		});
	}

	return findings;
}

/** Globs that match nothing usually mean the code moved and the decision did not. */
function checkPaths(store: Store): Finding[] {
	const withPaths = store.decisions.filter(
		(loaded) =>
			loaded.decision.frontmatter.status === "active" && loaded.decision.frontmatter.paths?.length,
	);
	if (withPaths.length === 0) return [];

	const files = listRepoFiles(store.root);
	const findings: Finding[] = [];
	for (const loaded of withPaths) {
		for (const glob of loaded.decision.frontmatter.paths ?? []) {
			const matches = picomatch(glob, { dot: true });
			if (!files.some((file) => matches(file))) {
				findings.push({
					severity: "warning",
					where: loaded.file,
					message: `paths glob "${glob}" matches no file in the repo`,
				});
			}
		}
	}
	return findings;
}

/**
 * Walk the repo without shelling out to git: one less thing that has to exist for
 * `lore check` to work, and it behaves the same in a tarball as in a clone.
 */
function listRepoFiles(root: string, limit = 20000): string[] {
	const files: string[] = [];
	const stack: string[] = [""];

	while (stack.length > 0 && files.length < limit) {
		const relative = stack.pop()!;
		let entries;
		try {
			entries = readdirSync(join(root, relative), { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			const path = relative ? `${relative}/${entry.name}` : entry.name;
			if (entry.isDirectory()) {
				if (!IGNORED_DIRS.has(entry.name)) stack.push(path);
			} else if (entry.isFile()) {
				files.push(path);
			}
		}
	}
	return files;
}
