/**
 * Turning past discussions into proposals.
 *
 * lore does not call a model. It never has credentials, never opens a socket, and
 * that is not a limitation to route around: the agent running this already has
 * the Notion, Slack and filesystem access, so the division of labour is that lore
 * supplies the prompt and the schema, and the agent supplies the reading.
 *
 * What lore does own is the part that is easy to get wrong by hand: pulling the
 * prose out of a transcript, cutting it into pieces a model can actually hold,
 * and saying out loud how many pieces there were.
 */

/** Rough, and deliberately so — it only has to be right enough to pick a cut point. */
const CHARS_PER_TOKEN = 4;
export const DEFAULT_CHUNK_CHARS = 48_000;

export type Chunk = { index: number; total: number; text: string; chars: number };

export type Material = {
	label: string;
	text: string;
	/** How many characters were dropped when flattening, and why. */
	dropped?: string;
};

/**
 * Pull readable prose out of a file.
 *
 * A Claude session transcript is JSONL where most of the bytes are tool calls,
 * file contents and results — noise that would crowd out the discussion, which is
 * the only part worth harvesting. Anything else is passed through untouched.
 */
export function flatten(label: string, raw: string): Material {
	if (!label.endsWith(".jsonl")) return { label, text: raw };

	const kept: string[] = [];
	let dropped = 0;

	for (const line of raw.split("\n")) {
		if (!line.trim()) continue;
		let record: unknown;
		try {
			record = JSON.parse(line) as unknown;
		} catch {
			dropped += line.length;
			continue;
		}
		const text = textOf(record);
		if (text) kept.push(text);
		else dropped += line.length;
	}

	return {
		label,
		text: kept.join("\n\n"),
		...(dropped > 0
			? { dropped: `${dropped} chars of tool calls, results and metadata skipped` }
			: {}),
	};
}

function textOf(record: unknown): string | undefined {
	if (typeof record !== "object" || record === null) return undefined;
	const node = record as Record<string, unknown>;

	const role = typeof node["role"] === "string" ? node["role"] : roleOf(node["message"]);
	// No role means this is not something anyone said — a tool_result carries a
	// `content` string too, and letting it through would drown the discussion in
	// exactly the bytes this function exists to remove.
	if (role !== "user" && role !== "assistant") return undefined;

	const text = collectText(node["content"] ?? contentOf(node["message"]));
	if (!text.trim()) return undefined;
	return `${role}: ${text}`;
}

function roleOf(message: unknown): string | undefined {
	if (typeof message !== "object" || message === null) return undefined;
	const role = (message as Record<string, unknown>)["role"];
	return typeof role === "string" ? role : undefined;
}

function contentOf(message: unknown): unknown {
	if (typeof message !== "object" || message === null) return undefined;
	return (message as Record<string, unknown>)["content"];
}

/** Text blocks only: tool_use and tool_result carry bytes, not reasoning. */
function collectText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((block) => {
			if (typeof block === "string") return block;
			if (typeof block !== "object" || block === null) return "";
			const node = block as Record<string, unknown>;
			return node["type"] === "text" && typeof node["text"] === "string" ? node["text"] : "";
		})
		.filter(Boolean)
		.join("\n");
}

/**
 * Cut material into model-sized pieces, on line boundaries.
 *
 * One file does not reliably mean one pass — a long session is far past what fits
 * in a single request — so the unit of work here is the chunk, and the caller is
 * told how many there are rather than silently getting the first one.
 */
export function chunk(material: Material[], budget = DEFAULT_CHUNK_CHARS): Chunk[] {
	const pieces: string[] = [];

	for (const item of material) {
		const header = `### Source: ${item.label}\n\n`;
		let current = header;

		for (const line of item.text.split("\n")) {
			if (current.length + line.length + 1 > budget && current !== header) {
				pieces.push(current);
				current = `${header}(continued)\n\n`;
			}
			// A single line longer than the budget is cut rather than dropped.
			if (line.length + header.length > budget) {
				for (let at = 0; at < line.length; at += budget - header.length) {
					pieces.push(`${header}${line.slice(at, at + budget - header.length)}`);
				}
				continue;
			}
			current += `${line}\n`;
		}
		if (current.trim() !== header.trim()) pieces.push(current);
	}

	return pieces.map((text, index) => ({
		index: index + 1,
		total: pieces.length,
		text,
		chars: text.length,
	}));
}

export function estimateTokens(chars: number): number {
	return Math.round(chars / CHARS_PER_TOKEN);
}

export const HARVEST_PROMPT = `You are reading a past discussion — a chat transcript, a PR description, a
Notion page, a Slack thread — to recover decisions that were made in it, so a
coding agent stops re-litigating them.

Return ONLY a JSON array. No prose, no code fence. An empty array is a perfectly
good answer, and a much better one than a padded list.

Each element:

  {
    "id": "short-slug",                  // appears on every line of the index
    "what": "One line, imperative, English, <=100 chars",
    "scope": ["area"],                   // areas of the codebase it applies to
    "why": "In the language of the source. Three sentences or fewer.",
    "rejected": [{"option": "Named alternative", "reason": "why it was dropped"}],
    "source": "quoted line, URL, or PR number from THIS material"
  }

Record something only if ALL FOUR hold:

- There was a real alternative — something a competent person could have picked
  instead, and might propose again next month. No alternative, no decision.
- The reason is not readable from the code. If someone could open the repo and
  work it out, do not repeat it here.
- It outlives the ticket being discussed. It governs code not yet written.
- It was chosen, not discovered. "The library doesn't support X" is a fact;
  "we're dropping the library because of it" is a decision.

Do NOT record: how the code turned out, naming, file layout, anything a linter
enforces, or an implementation detail a refactor could change without asking.

Hard rules, because a wrong entry here misleads every agent that comes later:

- Never invent a reason. If the material says what was chosen but not why, skip
  it — "what" without "why" is exactly the part that has no value.
- "rejected" must name the alternative as it was actually discussed. If you
  cannot name what was almost chosen instead, this is a description, not a
  decision.
- "source" must quote or point at the specific place in THIS material. It is what
  makes a proposal checkable instead of something the reviewer takes on faith.
- Prefer three solid decisions to twelve shaky ones. Everything you return will
  be read one by one by a human.

The material follows.
`;

export function buildPackage(piece: Chunk): string {
	const counter =
		piece.total > 1 ? `\n(Part ${piece.index} of ${piece.total} of the material.)\n` : "";
	return `${HARVEST_PROMPT}${counter}\n---\n\n${piece.text}\n`;
}
