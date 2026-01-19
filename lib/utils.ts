import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Clean book title by removing series names in parentheses.
 * Example: "We Found a Hat (The Hat Trilogy)" → "We Found a Hat"
 */
export function cleanBookTitle(title: string | null | undefined): string | null {
  if (!title) return null

  // Remove series names in parentheses at the end
  // Pattern: "Title (Series Name)" → "Title"
  const cleaned = title
    .replace(/\s*\([^)]+\)\s*$/, '') // Remove trailing parentheses content
    .trim()

  return cleaned || null
}
