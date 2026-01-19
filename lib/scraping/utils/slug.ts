/**
 * Convert a string to a URL-friendly slug.
 *
 * Examples:
 * - "Arnold Lobel" → "Arnold-Lobel"
 * - "Dr. Seuss" → "Dr-Seuss"
 * - "Frog & Toad Are Friends" → "Frog-Toad-Are-Friends"
 */
export function toSlug(text: string): string {
  return text
    .trim()
    .replace(/[&]/g, 'and') // Replace & with 'and'
    .replace(/[^a-zA-Z0-9\s-]/g, '') // Remove special characters except spaces and hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
}
