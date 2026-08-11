import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Read the version off package.json at runtime.
 *
 * Importing the JSON would drag package.json into `rootDir` and change the
 * shape of `dist/`, so we resolve it relative to the compiled file instead.
 */
export function getVersion(): string {
	const here = dirname(fileURLToPath(import.meta.url));
	for (const candidate of [
		join(here, "..", "..", "package.json"),
		join(here, "..", "package.json"),
	]) {
		try {
			const raw = readFileSync(candidate, "utf8");
			const parsed = JSON.parse(raw) as { version?: string };
			if (parsed.version) return parsed.version;
		} catch {
			// try the next candidate
		}
	}
	return "0.0.0";
}
