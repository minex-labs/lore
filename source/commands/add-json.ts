import { fromInput, type Issue } from "../lib/decision.js";
import { declaredAreas, loadConfig } from "../lib/config.js";
import { takenIds, todayISO, writeDecision, type Written } from "../lib/write.js";
import type { Store } from "../lib/store.js";
import { EXIT_ERROR, EXIT_OK, type IO } from "./context.js";

export type JsonError = { index: number; field: string; message: string };
export type JsonResult = { ok: boolean; created: Written[]; errors: JsonError[] };

export type AddJsonOptions = {
	/** `--approved` skips the inbox. Off by default: whatever an agent sends is a proposal. */
	approved: boolean;
	today?: string;
};

/**
 * Ingest decisions from a JSON object or array.
 *
 * Everything is validated before anything is written. A batch that half-lands is
 * worse than one that fails cleanly: the caller is usually an agent that will fix
 * the reported fields and resend the whole thing, and it cannot do that if some
 * of the ids are already taken by its own previous attempt.
 *
 * Errors come back as JSON on stdout, not prose on stderr, for the same reason.
 */
export function addFromJson(
	raw: string,
	store: Store,
	options: AddJsonOptions,
): { result: JsonResult; code: number } {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw) as unknown;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			result: { ok: false, created: [], errors: [{ index: 0, field: "stdin", message }] },
			code: EXIT_ERROR,
		};
	}

	const inputs = Array.isArray(parsed) ? parsed : [parsed];
	if (inputs.length === 0) {
		return {
			result: {
				ok: false,
				created: [],
				errors: [{ index: 0, field: "stdin", message: "no decisions" }],
			},
			code: EXIT_ERROR,
		};
	}

	const today = options.today ?? todayISO();
	const taken = takenIds(store.loreDir);
	const areas = new Set(declaredAreas(loadConfig(store.loreDir).config));
	const errors: JsonError[] = [];
	const pending: ReturnType<typeof fromInput>[] = [];

	for (const [index, input] of inputs.entries()) {
		const built = fromInput(input, today);
		pending.push(built);
		if (!built.ok) {
			errors.push(...built.issues.map((issue: Issue) => ({ index, ...issue })));
			continue;
		}

		const id = built.decision.frontmatter.id;
		if (taken.has(id)) {
			errors.push({
				index,
				field: "id",
				message: `"${id}" already exists — pick a different slug, or supersede the existing decision`,
			});
		}
		taken.add(id);

		if (options.approved) {
			// Undeclared areas are fine for a proposal — review decides — but not for
			// something going straight into the lore.
			for (const area of built.decision.frontmatter.scope) {
				if (!areas.has(area)) {
					errors.push({
						index,
						field: "scope",
						message: `"${area}" is not declared in .lore/config.yml (declared: ${[...areas].join(", ") || "none"})`,
					});
				}
			}
		}
	}

	if (errors.length > 0) {
		return { result: { ok: false, created: [], errors }, code: EXIT_ERROR };
	}

	const created: Written[] = [];
	for (const built of pending) {
		if (!built.ok) continue;
		created.push(writeDecision(store.loreDir, built.decision, options.approved ? "area" : "inbox"));
	}

	return { result: { ok: true, created, errors: [] }, code: EXIT_OK };
}

export function emitJson(io: IO, result: JsonResult): void {
	io.out(`${JSON.stringify(result, null, 2)}\n`);
}
