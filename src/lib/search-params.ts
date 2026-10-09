export type RawSearchParams = Record<string, string | string[] | undefined>;

export const firstParam = (
  value: string | string[] | undefined,
): string | undefined => (Array.isArray(value) ? value[0] : value);
