import { describe, expect, test } from 'bun:test'
import { getTopAwardResultType } from '@/convex/lib/bookAwards'

describe('getTopAwardResultType', () => {
  test('prefers winner when any award result is a winner', () => {
    expect(getTopAwardResultType(['other', 'honor', 'winner'])).toBe('winner')
  })

  test('returns honor when honor is the strongest result', () => {
    expect(getTopAwardResultType(['other', 'finalist', 'honor'])).toBe('honor')
  })

  test('returns null when there is no winner or honor result', () => {
    expect(getTopAwardResultType(['other', 'finalist'])).toBeNull()
  })

  test('returns null for empty inputs', () => {
    expect(getTopAwardResultType([])).toBeNull()
  })
})
