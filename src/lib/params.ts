import { z } from "zod";

const searchParamsSchema = z.object({
  // Per-page site filter; -1 = all sites.
  site: z.coerce.number().int().default(-1).catch(-1),
  category: z.coerce.number().int().default(-1).catch(-1),
  person: z.coerce.number().int().default(-1).catch(-1),
  all: z
    .string()
    .optional()
    .transform((v) => v === "1" || v === "true"),
  type: z.string().default("all"),
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
}: ParsedSearchParams) => ({
  t: type,
  dm,
  d1,
  d2,
  categoryId: category,
  personId: person,
});

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

export function buildQueryString(
  params: Record<string, string | number | boolean | undefined | null>,
): string {
  const urlParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (
      value !== undefined &&
      value !== null &&
      value !== "" &&
      value !== -1 &&
      value !== false
    ) {
      urlParams.set(key, String(value === true ? "1" : value));
    }
  }
  const str = urlParams.toString();
  return str ? `?${str}` : "";
}
