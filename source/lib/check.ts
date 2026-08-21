import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import picomatch from "picomatch";
import { declaredAreas, loadConfig, type Config } from "./config.js";
import { renderIndex } from "./index-file.js";
import { parseDecision } from "./decision.js";
import { GLOBAL_AREA } from "./schema.js";
import { INBOX_DIR, INDEX_FILE, type Store } from "./store.js";
import { inboxIds } from "./write.js";

export type Severity = "error" | "warning" | "info";
export type Finding = { severity: Severity; where: string; message: string };

/** Above this, `global` has stopped being "read every session" and become a dump. */
export const GLOBAL_BUDGET = 10;

/** Name the worst few; summarise the tail. A wall of size notes is read as noise. */
const WORST_SHOWN = 3;

/** Past this the walk has stopped being cheap; what it costs is a truthful answer. */
export const FILE_SCAN_LIMIT = 20000;

export type CheckOptions = {
	/** Files to visit before giving up on the paths check. Lowered by tests. */
	fileScanLimit?: number;
};

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
export function check(store: Store, options: CheckOptions = {}): Finding[] {
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

	findings.push(...checkPaths(store, options.fileScanLimit ?? FILE_SCAN_LIMIT));
	findings.push(...checkBudget(store, config));

	findings.push(...checkInbox(store));

	return findings;
}

/**
 * Count the inbox the way `check` does, and the way `review` does, and make the
 * two numbers meet.
 *
 * They used to be independent measurements of the same fact that never faced each
 * other: `check` globbed the directory, `review` parsed and dropped what it could
 * not read, and both exited 0. An operator saw "4 proposals are waiting", `review`
 * offered 2, and nothing anywhere said the other 2 could never be promoted.
 *
 * A file that cannot be parsed is an error, not a note. It is not "nothing to do"
 * and it is not a style preference — it is a decision someone recorded, sitting in
 * the repo, that no command can act on.
 */
function checkInbox(store: Store): Finding[] {
	const findings: Finding[] = [];
	const pending = inboxIds(store.loreDir);
	if (pending.length === 0) return findings;

	let readable = 0;
	for (const id of pending) {
		const path = join(store.loreDir, INBOX_DIR, `${id}.md`);
		let parsed;
		try {
			parsed = parseDecision(readFileSync(path, "utf8"));
		} catch {
			parsed = undefined;
		}
		if (parsed?.ok) {
			readable += 1;
			continue;
		}
		findings.push({
			severity: "error",
			where: `${INBOX_DIR}/${id}.md`,
			message: `cannot be parsed, so \`lore review\` skips it and it can never be approved — ${
				parsed && !parsed.ok
					? `${parsed.issues[0]?.field}: ${parsed.issues[0]?.message}`
					: "unreadable"
			}`,
		});
	}

	if (readable > 0) {
		findings.push({
			severity: "info",
			where: `${INBOX_DIR}/`,
			message: `${readable} ${readable === 1 ? "proposal is" : "proposals are"} waiting for \`lore review\``,
		});
	}
	return findings;
}

/**
 * Report what the lore costs to read.
 *
 * **Severity is `info`, on purpose, and never rises to error even under
 * `--strict`.** Everything this tool calls an error makes the lore *wrong*: bad
 * frontmatter, a dangling supersede, a stale index. Size is not wrong — a long
 * record can be entirely justified — so it is a measurement, not a defect.
 *
 * The asymmetry decides it. `lore check --strict` runs in the merge gate of real
 * repos; if it starts failing on prose, the first thing anyone does is take it out
 * of the gate, and that takes the checks that *were* catching real breakage with
 * it. A budget line that gets read and ignored costs nothing. A budget line that
 * blocks a merge costs the whole command.
 *
 * Two different measurements, because they are two different problems:
 *
 * - **Per decision, `## Why` only.** That is where prose inflates. `## Rejected`
 *   is the field that earns lore its keep and routinely runs longer than the why
 *   in a healthy record — charging for it would push people to cut the wrong half.
 * - **Per always-read context, whole files.** `INDEX.md` plus `global/` is what
 *   every session pays regardless of the ticket, and when an agent opens a
 *   decision it reads all of it, rejected options included.
 */
function checkBudget(store: Store, config: Config): Finding[] {
	const findings: Finding[] = [];
	const active = store.decisions.filter((l) => l.decision.frontmatter.status === "active");

	// Ordered by how far over they are, and only the worst few by name. A list
	// where almost everything appears reads as noise even when every line is true,
	// and the records that are 6 characters over drown the ones that are 1,600
	// over. Measured on a real repo: 10 of 11 decisions flagged, undifferentiated.
	const over = active
		.map((loaded) => ({ loaded, size: loaded.decision.why.length }))
		.filter((entry) => entry.size > config.budget.why)
		.sort((a, b) => b.size - a.size);

	for (const entry of over.slice(0, WORST_SHOWN)) {
		findings.push({
			severity: "info",
			where: entry.loaded.file,
			message: `## Why is ${entry.size} chars (budget ${config.budget.why}) — trim it to the decision and its reason; the background belongs behind the \`source\` link`,
		});
	}
	const rest = over.slice(WORST_SHOWN);
	if (rest.length > 0) {
		const smallest = rest[rest.length - 1]!.size;
		const largest = rest[0]!.size;
		findings.push({
			severity: "info",
			where: `${rest.length} more`,
			message: `over the ${config.budget.why} budget by less (${smallest}–${largest} chars) — \`lore check --json\` lists them all`,
		});
	}

	const alwaysRead = active.filter((l) => l.decision.frontmatter.scope.includes(GLOBAL_AREA));
	const indexSize = fileSize(join(store.loreDir, INDEX_FILE));
	const total =
		indexSize + alwaysRead.reduce((sum, l) => sum + fileSize(join(store.loreDir, l.file)), 0);

	if (total > config.budget.always_read) {
		const heaviest = alwaysRead
			.map((l) => ({ id: l.decision.frontmatter.id, size: fileSize(join(store.loreDir, l.file)) }))
			.sort((a, b) => b.size - a.size)
			.slice(0, 3)
			.map((entry) => `${entry.id} (${entry.size})`)
			.join(", ");
		findings.push({
			severity: "info",
			where: `${GLOBAL_AREA}/ + ${INDEX_FILE}`,
			message:
				`${total} chars (~${Math.round(total / 4)} tokens) are read on every session, over the ${config.budget.always_read} budget. ` +
				`Heaviest: ${heaviest}. Move what is not truly global to an area — \`lore area <name> --desc "..."\`, then \`lore amend <id> --scope <name>\`. A long decision in a niche area is only read by whoever touches it`,
		});
	}

	return findings;
}

function fileSize(path: string): number {
	try {
		return statSync(path).size;
	} catch {
		return 0;
	}
}

/**
 * Globs that match nothing usually mean the code moved and the decision did not.
 *
 * The walk is budgeted, so this question has three answers, not two: matched, did not
 * match, and "the scan ran out of budget before it could tell". Collapsing the third
 * into the second is how a partial walk turns into a confident claim about a file that
 * is sitting right there.
 */
function checkPaths(store: Store, limit: number): Finding[] {
	const globs = store.decisions
		.filter((loaded) => loaded.decision.frontmatter.status === "active")
		.flatMap((loaded) =>
			(loaded.decision.frontmatter.paths ?? []).map((glob) => ({
				file: loaded.file,
				glob,
				isMatch: picomatch(glob, { dot: true }),
			})),
		);
	if (globs.length === 0) return [];

	// Stop the moment every glob has matched: the full walk is only needed to prove a
	// negative, which is exactly the case where a truncated answer would be a lie.
	let unmatched = globs;
	const complete = walkRepo(store.root, limit, (file) => {
		unmatched = unmatched.filter((entry) => !entry.isMatch(file));
		return unmatched.length === 0;
	});

	if (unmatched.length === 0) return [];
	if (!complete) {
		const listed = unmatched.map((entry) => `"${entry.glob}"`).join(", ");
		return [
			{
				severity: "warning",
				where: "repo scan",
				message:
					`stopped after ${limit} files with directories left to visit, so ${unmatched.length} paths glob(s) could not be checked: ${listed}. ` +
					`They may well match — this is "not measured", not "not there". A large directory that is not this repo's source is the usual cause`,
			},
		];
	}
	return unmatched.map((entry) => ({
		severity: "warning" as const,
		where: entry.file,
		message: `paths glob "${entry.glob}" matches no file in the repo`,
	}));
}

/**
 * Walk the repo without shelling out to git: one less thing that has to exist for
 * `lore check` to work, and it behaves the same in a tarball as in a clone.
 *
 * A directory carrying its own `.git` is a different repo — a submodule, or a worktree
 * some tool parked inside this one. Its files are not this repo's files, and walking
 * them is how the budget gets spent on someone else's tree. Same boundary the `.lore/`
 * lookup already stops at.
 *
 * `onFile` returns true to stop the walk. Returns false when the budget ran out with
 * directories still unvisited: the caller holds a partial answer and must say so.
 */
function walkRepo(root: string, limit: number, onFile: (file: string) => boolean): boolean {
	const stack: string[] = [""];
	let seen = 0;

	while (stack.length > 0) {
		if (seen >= limit) return false;
		const relative = stack.pop()!;
		let entries;
		try {
			entries = readdirSync(join(root, relative), { withFileTypes: true });
		} catch {
			continue;
		}
		if (relative !== "" && entries.some((entry) => entry.name === ".git")) continue;
		for (const entry of entries) {
			const path = relative ? `${relative}/${entry.name}` : entry.name;
			if (entry.isDirectory()) {
				if (!IGNORED_DIRS.has(entry.name)) stack.push(path);
			} else if (entry.isFile()) {
				seen += 1;
				if (onFile(path)) return true;
			}
		}
	}
	return true;
}
