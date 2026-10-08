/**
 * Canonical form for master names (categories, person types): trims,
 * collapses repeated whitespace, and capitalises each word.
 * "  fly   ASH " -> "Fly Ash", "pvc-pipe" -> "Pvc-Pipe"
 */
export function normalizeName(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(
      /(^|[\s\-/(])(\p{L})/gu,
      (_, sep: string, ch: string) => sep + ch.toUpperCase(),
    );
}
