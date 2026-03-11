import type { Id } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'

export type BookAwardResultType = 'winner' | 'honor' | 'finalist' | 'other'
export type TopAwardResultType = 'winner' | 'honor'

export function getTopAwardResultType(resultTypes: Array<BookAwardResultType | null | undefined>): TopAwardResultType | null {
  let hasHonor = false

  for (const resultType of resultTypes) {
    if (resultType === 'winner') return 'winner'
    if (resultType === 'honor') hasHonor = true
  }

  return hasHonor ? 'honor' : null
}

export async function syncTopAwardResultTypeForBook(context: MutationCtx, bookId: Id<'books'>) {
  const book = await context.db.get(bookId)
  if (!book) return null

  const bookAwards = await context.db
    .query('bookAwards')
    .withIndex('by_bookId', (q) => q.eq('bookId', bookId))
    .collect()

  const topAwardResultType = getTopAwardResultType(bookAwards.map((award) => award.resultType))

  await context.db.patch(bookId, {
    topAwardResultType: topAwardResultType ?? undefined,
  })

  return topAwardResultType
}
