/**
 * Convert a string to a URL-friendly slug.
 *
 * Examples:
 * - "Arnold Lobel" → "arnold-lobel"
 * - "Dr. Seuss" → "dr-seuss"
 * - "Frog & Toad Are Friends" → "frog-and-toad-are-friends"
 */
export function toSlug(text: string): string {
  return text
    .trim()
    .replace(/[&]/g, 'and')
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}
