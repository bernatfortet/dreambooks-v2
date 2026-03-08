export type ParsedAgeRange = {
  min: number
  max: number
}

export function parseAgeRange(value: string | null | undefined): ParsedAgeRange | null {
  if (!value) return null

  const normalizedValue = value.trim().toLowerCase()
  if (!normalizedValue) return null

  const numericValues = extractNumericValues(normalizedValue)

  if (numericValues.length >= 2) {
    return {
      min: numericValues[0],
      max: numericValues[1],
    }
  }

  if (numericValues.length === 1) {
    const singleValue = numericValues[0]

    if (normalizedValue.includes('baby') || normalizedValue.includes('newborn') || normalizedValue.includes('birth')) {
      return { min: 0, max: singleValue }
    }

    if (normalizedValue.includes('under') || normalizedValue.includes('up to')) {
      return { min: 0, max: singleValue }
    }

    return { min: singleValue, max: singleValue }
  }

  return null
}

function extractNumericValues(value: string): number[] {
  const matches = value.match(/\d+(?:\.\d+)?/g)
  if (!matches) return []

  return matches
    .map((match) => Number.parseFloat(match))
    .filter((match) => Number.isFinite(match))
}
