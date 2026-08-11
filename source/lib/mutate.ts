import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { serializeDecision, type Decision } from "./decision.js";
import type { LoadedDecision } from "./store.js";

/** Overwrite a decision that already exists, in canonical form. */
export function rewriteDecision(loreDir: string, loaded: LoadedDecision, next: Decision): void {
	writeFileSync(join(loreDir, loaded.file), serializeDecision(next), "utf8");
}

export function markSuperseded(decision: Decision, by: string): Decision {
	return {
		...decision,
		frontmatter: { ...decision.frontmatter, status: "superseded", superseded_by: by },
	};
}

/** Loose comparison so "DynamoDB" and "dynamodb" count as the same option. */
function normalise(text: string): string {
	return text
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

export function alreadyRejects(decision: Decision, option: string): boolean {
	const needle = normalise(option);
	return decision.rejected.some((entry) => normalise(entry.option) === needle);
}

/**
 * Record the superseded decision as a rejected option on the one replacing it.
 *
 * This is the whole point of `supersede`. Nobody opens a superseded file, so
 * flipping its status protects nobody; what stops an agent proposing the old
 * approach again is finding it in the `## Rejected` list of a decision that is
 * still active.
 */
export function withRejectedOption(decision: Decision, option: string, reason: string): Decision {
	if (alreadyRejects(decision, option)) return decision;
	return { ...decision, rejected: [...decision.rejected, { option, reason }] };
}
