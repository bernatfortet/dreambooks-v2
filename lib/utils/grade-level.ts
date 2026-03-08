export type ParsedGradeLevel = {
  min: number
  max: number
}

export function parseGradeLevel(value: string | null | undefined): ParsedGradeLevel | null {
  if (!value) return null

  const normalizedValue = value.trim().toLowerCase()
  if (!normalizedValue) return null

  const parsedValues = extractGradeValues(normalizedValue)

  if (parsedValues.length >= 2) {
    return {
      min: parsedValues[0],
      max: parsedValues[1],
    }
  }

  if (parsedValues.length === 1) {
    const singleValue = parsedValues[0]

    if (normalizedValue.includes('up to') || normalizedValue.includes('under')) {
      return { min: 0, max: singleValue }
    }

    return { min: singleValue, max: singleValue }
  }

  return null
}

function extractGradeValues(value: string): number[] {
  const matches = value.match(/preschool|pre-?k|kindergarten|k|\d+/g)
  if (!matches) return []

  return matches
    .map(convertGradeTokenToNumber)
    .filter((match): match is number => match !== null)
}

function convertGradeTokenToNumber(token: string): number | null {
  if (token === 'preschool' || token === 'pre-k' || token === 'prek' || token === 'kindergarten' || token === 'k') {
    return 0
  }

  const parsedValue = Number.parseInt(token, 10)
  if (!Number.isFinite(parsedValue)) return null

  return parsedValue
}
