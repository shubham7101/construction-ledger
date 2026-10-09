import { z } from "zod";

/** A whole-rupee amount bound; absent, empty or invalid = no bound. */
const amountBound = z
  .preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    z.coerce.number().int().min(0).optional(),
  )
  .catch(undefined);

const searchParamsSchema = z.object({
  // Per-page site filter; -1 = all sites.
  site: z.coerce.number().int().default(-1).catch(-1),
  category: z.coerce.number().int().default(-1).catch(-1),
  person: z.coerce.number().int().default(-1).catch(-1),
  // Admins: only entries logged by this user id (-1 = per `all`).
  by: z.coerce.number().int().default(-1).catch(-1),
  all: z
    .string()
    .optional()
    .transform((v) => v === "1" || v === "true"),
  type: z.string().default("all"),
  // Ledger payment mode; absent = any.
  // Amount range, whole rupees, inclusive; either end optional.
  amin: amountBound,
  amax: amountBound,
  mode: z
    .enum(["cash", "upi", "bank_transfer", "cheque"])
    .optional()
    .catch(undefined),
  // Sites list: project stage (sites.status); absent = any. Not `status`,
  // which is the admin lists' active / inactive (soft delete) filter.
  stage: z.enum(["active", "completed", "on_hold"]).optional().catch(undefined),
  dm: z.enum(["any", "day", "range"]).default("any"),
  d1: z.string().default(""),
  d2: z.string().default(""),
  q: z.string().default(""),
  sort: z
    .enum(["az", "za", "high", "low", "newest", "oldest"])
    .default("az")
    .catch("az"),
  // Admin lists: soft-deleted rows are hidden unless asked for.
  status: z
    .enum(["active", "inactive", "all"])
    .default("active")
    .catch("active"),
  // Person type name; "" = every type ("all" in any case is accepted too).
  ptype: z
    .string()
    .default("")
    .transform((v) => (v.toLowerCase() === "all" ? "" : v)),
});

export type ParsedSearchParams = z.infer<typeof searchParamsSchema>;

/** The type/date filter slice the list queries take. */
export const toFilter = ({
  type,
  dm,
  d1,
  d2,
  category,
  person,
  by,
  mode,
  amin,
  amax,
}: ParsedSearchParams) => {
  // A reversed range is read the way it was meant.
  const [minAmount, maxAmount] =
    amin !== undefined && amax !== undefined && amin > amax
      ? [amax, amin]
      : [amin, amax];
  return {
    t: type,
    dm,
    d1,
    d2,
    categoryId: category,
    personId: person,
    createdBy: by,
    mode,
    minAmount,
    maxAmount,
  };
};

export function parseSearchParams(
  params: Record<string, string | string[] | undefined>,
): ParsedSearchParams {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
      normalized[key] = value;
    } else if (Array.isArray(value) && value.length > 0) {
      normalized[key] = value[0];
    }
  }
  return searchParamsSchema.parse(normalized);
}
