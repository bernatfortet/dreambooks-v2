import type { BookData } from './types'

export type BookReviewMetadata = {
  needsReview: boolean
  reason?: string
  signalKey?: string
}

const TITLE_SIGNAL_PATTERNS: Array<{ pattern: RegExp; signalKey: string; reason: string }> = [
  {
    pattern: /\bcomplete\s+collection\b/i,
    signalKey: 'title-complete-collection',
    reason: 'Title suggests a complete collection of multiple books.',
  },
  {
    pattern: /\bboxed?\s+set\b/i,
    signalKey: 'title-box-set',
    reason: 'Title suggests a boxed set of multiple books.',
  },
  {
    pattern: /\bomnibus\b/i,
    signalKey: 'title-omnibus',
    reason: 'Title suggests an omnibus edition containing multiple books.',
  },
  {
    pattern: /\b\d+\s*-\s*\d+\b/i,
    signalKey: 'title-book-range',
    reason: 'Title includes a book-number range, which often indicates a bundle.',
  },
  {
    pattern: /\b\d+\s+in\s+1\b/i,
    signalKey: 'title-in-one',
    reason: 'Title suggests multiple books combined into one volume.',
  },
  {
    pattern: /\btreasury\b/i,
    signalKey: 'title-treasury',
    reason: 'Title suggests a treasury or bundled edition.',
  },
]

const DESCRIPTION_SIGNAL_PATTERNS: Array<{ pattern: RegExp; signalKey: string; reason: string }> = [
  {
    pattern: /\bincludes\s+[^.]{0,160}(?:book|novel|story|stories)\b/i,
    signalKey: 'description-includes-books',
    reason: 'Description says the volume includes multiple books or stories.',
  },
  {
    pattern: /\bcollects?\b/i,
    signalKey: 'description-collects',
    reason: 'Description says the volume collects previously separate works.',
  },
  {
    pattern: /\bcontains\s+[^.]{0,160}(?:book|novel|story|stories)\b/i,
    signalKey: 'description-contains-books',
    reason: 'Description says the volume contains multiple books or stories.',
  },
]

const BENIGN_COLLECTION_PATTERNS = [/\bfolk\s*tale\s+collection/i, /\bstory\s+collection/i, /\bpoetry\s+collection/i]

export function classifyBookForReview(bookData: Pick<BookData, 'title' | 'description' | 'pageCount'>): BookReviewMetadata {
  const title = bookData.title?.trim()
  if (!title) return { needsReview: false }

  if (matchesAnyPattern(title, BENIGN_COLLECTION_PATTERNS)) {
    return { needsReview: false }
  }

  const titleSignal = findSignal(title, TITLE_SIGNAL_PATTERNS)
  if (titleSignal) {
    return {
      needsReview: true,
      reason: buildReason({ primaryReason: titleSignal.reason, pageCount: bookData.pageCount }),
      signalKey: titleSignal.signalKey,
    }
  }

  const description = bookData.description?.trim()
  if (description) {
    const descriptionSignal = findSignal(description, DESCRIPTION_SIGNAL_PATTERNS)
    if (descriptionSignal && hasLargePageCount(bookData.pageCount)) {
      return {
        needsReview: true,
        reason: buildReason({ primaryReason: descriptionSignal.reason, pageCount: bookData.pageCount }),
        signalKey: descriptionSignal.signalKey,
      }
    }
  }

  return { needsReview: false }
}

function findSignal(
  text: string,
  signals: Array<{ pattern: RegExp; signalKey: string; reason: string }>,
): { signalKey: string; reason: string } | null {
  for (const signal of signals) {
    if (signal.pattern.test(text)) {
      return {
        signalKey: signal.signalKey,
        reason: signal.reason,
      }
    }
  }

  return null
}

function matchesAnyPattern(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text))
}

function hasLargePageCount(pageCount: number | null | undefined): boolean {
  if (!pageCount) return false
  return pageCount >= 160
}

function buildReason(params: { primaryReason: string; pageCount: number | null | undefined }): string {
  const { primaryReason, pageCount } = params
  if (!hasLargePageCount(pageCount)) return primaryReason

  return `${primaryReason} Page count (${pageCount}) also looks unusually high for a single children's title.`
}
