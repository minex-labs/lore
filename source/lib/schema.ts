import { z } from "zod";

/**
 * The one schema. Both `lore add` modes — interactive prompts and `--json` on
 * stdin — build a plain object and hand it to the same validators here. There is
 * no second validation path, and there must never be one.
 */

/** `inbox` is the review gate's directory, so it can never be an area name. */
export const RESERVED_AREAS = ["inbox"] as const;

/** Read on every session, regardless of the ticket. Keep it small. */
export const GLOBAL_AREA = "global";

export const MAX_WHAT_LENGTH = 100;
export const MAX_ID_LENGTH = 60;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const slugSchema = z
	.string()
	.min(1)
	.max(MAX_ID_LENGTH)
	.regex(SLUG, "must be lowercase words joined by single hyphens");

export const areaSchema = slugSchema.refine(
	(value) => !RESERVED_AREAS.includes(value as (typeof RESERVED_AREAS)[number]),
	{ message: `"${RESERVED_AREAS.join('", "')}" is reserved and cannot be an area` },
);

export const dateSchema = z
	.string()
	.regex(ISO_DATE, "must be YYYY-MM-DD")
	.refine((value) => {
		const parsed = new Date(`${value}T00:00:00Z`);
		return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
	}, "is not a real date");

export const whatSchema = z
	.string()
	.trim()
	.min(1)
	.max(
		MAX_WHAT_LENGTH,
		`must be at most ${MAX_WHAT_LENGTH} characters — it is one line in the index`,
	)
	.refine((value) => !value.includes("\n"), "must be a single line");

export const scopeSchema = z
	.array(areaSchema)
	.min(1, "needs at least one area")
	.refine((areas) => new Set(areas).size === areas.length, "cannot repeat an area");

export const statusSchema = z.enum(["active", "superseded"]);
export type Status = z.infer<typeof statusSchema>;

/**
 * Frontmatter as it appears on disk. Key order here is the order we serialize
 * in, so diffs stay stable across rewrites.
 */
export const frontmatterSchema = z
	.object({
		id: slugSchema,
		what: whatSchema,
		scope: scopeSchema,
		status: statusSchema,
		superseded_by: slugSchema.optional(),
		date: dateSchema,
		source: z.string().trim().min(1).optional(),
		paths: z.array(z.string().trim().min(1)).min(1).optional(),
	})
	.strict()
	.superRefine((value, ctx) => {
		if (value.status === "superseded" && !value.superseded_by) {
			ctx.addIssue({
				code: "custom",
				path: ["superseded_by"],
				message:
					"is required when status is superseded — every retired decision points at a live one",
			});
		}
		if (value.status === "active" && value.superseded_by) {
			ctx.addIssue({
				code: "custom",
				path: ["superseded_by"],
				message: "cannot be set while status is active",
			});
		}
		if (value.superseded_by && value.superseded_by === value.id) {
			ctx.addIssue({
				code: "custom",
				path: ["superseded_by"],
				message: "cannot point at itself",
			});
		}
	});

export type Frontmatter = z.infer<typeof frontmatterSchema>;

/** One discarded option, and why. This is the field that earns lore its keep. */
export const rejectedSchema = z.object({
	option: z.string().trim().min(1),
	reason: z.string().trim().min(1),
});
export type Rejected = z.infer<typeof rejectedSchema>;

/**
 * What callers hand to `lore add`: no id (derived from `what`), no status,
 * and the body as fields rather than markdown. Same shape from the prompts and
 * from stdin.
 */
export const decisionInputSchema = z
	.object({
		what: whatSchema,
		scope: scopeSchema,
		why: z.string().trim().min(1, "a decision without a reason is just a note"),
		rejected: z
			.array(rejectedSchema)
			.min(
				1,
				"name at least one option you turned down, and why — this is the point of the record",
			),
		id: slugSchema.optional(),
		date: dateSchema.optional(),
		source: z.string().trim().min(1).optional(),
		paths: z.array(z.string().trim().min(1)).min(1).optional(),
	})
	.strict();

export type DecisionInput = z.infer<typeof decisionInputSchema>;
