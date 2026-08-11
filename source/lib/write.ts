import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { serializeDecision, type Decision } from "./decision.js";
import { renderIndex } from "./index-file.js";
import { INBOX_DIR, INDEX_FILE, loadStore } from "./store.js";

export type Destination = "inbox" | "area";

export type Written = { id: string; path: string };

/**
 * Every id in the repo, including the inbox.
 *
 * The loader deliberately cannot see `inbox/`, which is what keeps proposals out
 * of the index — but uniqueness is the one question that has to look there too,
 * or approving a proposal would silently overwrite a decision that already exists.
 */
export function takenIds(loreDir: string): Set<string> {
	const ids = new Set<string>();
	for (const loaded of loadStore(loreDir).decisions) {
		ids.add(loaded.decision.frontmatter.id);
	}
	for (const id of inboxIds(loreDir)) ids.add(id);
	return ids;
}

export function inboxIds(loreDir: string): string[] {
	const dir = join(loreDir, INBOX_DIR);
	if (!existsSync(dir)) return [];
	return readdirSync(dir, { withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
		.map((entry) => entry.name.replace(/\.md$/, ""))
		.sort();
}

/** Append `-2`, `-3`… until the id is free. Used by prompts, never silently. */
export function nextFreeId(taken: Set<string>, base: string): string {
	if (!taken.has(base)) return base;
	for (let n = 2; n < 1000; n += 1) {
		const candidate = `${base}-${n}`;
		if (!taken.has(candidate)) return candidate;
	}
	return `${base}-${Date.now()}`;
}

/**
 * Write a decision to disk and return where it landed.
 *
 * Writing to the inbox does not touch `INDEX.md`, and that is not an
 * optimisation: a proposal that moved the index would be lore already.
 */
export function writeDecision(loreDir: string, decision: Decision, to: Destination): Written {
	const area = to === "inbox" ? INBOX_DIR : decision.frontmatter.scope[0]!;
	const dir = join(loreDir, area);
	mkdirSync(dir, { recursive: true });

	const path = join(dir, `${decision.frontmatter.id}.md`);
	if (existsSync(path)) {
		throw new Error(`${area}/${decision.frontmatter.id}.md already exists`);
	}
	writeFileSync(path, serializeDecision(decision), "utf8");

	if (to === "area") refreshIndex(loreDir);
	return { id: decision.frontmatter.id, path: `.lore/${area}/${decision.frontmatter.id}.md` };
}

export function refreshIndex(loreDir: string): void {
	writeFileSync(join(loreDir, INDEX_FILE), renderIndex(loadStore(loreDir)), "utf8");
}

export function todayISO(now = new Date()): string {
	return now.toISOString().slice(0, 10);
}
