import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const SOURCE = resolve(dirname(fileURLToPath(import.meta.url)), "..", "source");

/** Static imports only. `import("./x.js")` inside a function is deliberately not matched. */
const STATIC_IMPORT = /^\s*import\s+(?:type\s+)?[\s\S]*?from\s+"([^"]+)";/gm;

function reachableFrom(entry: string): Set<string> {
	const seen = new Set<string>();
	const queue = [entry];
	while (queue.length > 0) {
		const file = queue.pop()!;
		if (seen.has(file)) continue;
		seen.add(file);
		const text = readFileSync(file, "utf8");
		for (const match of text.matchAll(STATIC_IMPORT)) {
			const specifier = match[1]!;
			if (!specifier.startsWith(".")) continue;
			queue.push(join(dirname(file), specifier.replace(/\.js$/, ".ts")));
		}
	}
	return seen;
}

/**
 * The startup path is a budget, not a preference: `lore for` runs on every file a
 * PreToolUse hook touches, so anything imported eagerly is paid thousands of times
 * a day. This test caught a real regression once — `app.ts` pulled in the store
 * through a shared context module and startup went from 50ms to 170ms.
 */
test("the router never eagerly imports the store, the schema, or their dependencies", () => {
	const reachable = [...reachableFrom(join(SOURCE, "cli.ts"))].map((file) =>
		file.slice(SOURCE.length + 1),
	);

	for (const forbidden of [
		"lib/store.ts",
		"lib/schema.ts",
		"lib/decision.ts",
		"lib/index-file.ts",
	]) {
		assert.ok(
			!reachable.includes(forbidden),
			`${forbidden} is reachable from cli.ts without a dynamic import: ${reachable.join(", ")}`,
		);
	}
});

test("no command module is imported eagerly by the router", () => {
	const reachable = [...reachableFrom(join(SOURCE, "cli.ts"))].map((file) =>
		file.slice(SOURCE.length + 1),
	);
	const handlers = reachable.filter(
		(file) =>
			file.startsWith("commands/") &&
			!["commands/registry.ts", "commands/context.ts"].includes(file),
	);
	assert.deepEqual(handlers, [], "handlers must load through registry `load()`");
});
