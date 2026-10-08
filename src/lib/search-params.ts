export type RawSearchParams = Record<string, string | string[] | undefined>;

export const firstParam = (
  value: string | string[] | undefined,
): string | undefined => (Array.isArray(value) ? value[0] : value);

/** Collapse repeated params to their first value so they are safe to pass around. */
export const flattenParams = (
  raw: RawSearchParams,
): Record<string, string | undefined> =>
  Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, firstParam(value)]),
  );
