import type { Id } from '@/convex/_generated/dataModel'

export type AwardResultType = 'winner' | 'honor' | 'finalist' | 'other'

export type AwardSourceRow = {
  sourceName: string
  sourcePath: string
  sourcePage?: number
  rawText: string
}

export type NormalizedAwardEntry = AwardSourceRow & {
  awardName: string
  year: number
  resultType: AwardResultType
  categoryLabel: string
  title: string
  author?: string
  illustrator?: string
}

export type AwardImportBookCandidate = {
  bookId: Id<'books'>
  title: string
  authors: string[]
  slug: string | null
  asin?: string
  amazonUrl?: string
  publishedDate?: string
}

export type AwardImportAmazonCandidate = {
  asin: string
  amazonUrl: string
  title: string
  byline?: string
  rank: number
}

export type AwardExistingMatch = {
  status: 'matched_existing'
  entry: NormalizedAwardEntry
  matchedBy: 'search'
  confidence: number
  candidates: AwardImportBookCandidate[]
  book: AwardImportBookCandidate
}

export type AwardAmazonMatch = {
  status: 'resolved_amazon'
  entry: NormalizedAwardEntry
  confidence: number
  candidates: AwardImportAmazonCandidate[]
  amazon: AwardImportAmazonCandidate
}

export type AwardAmbiguousMatch = {
  status: 'ambiguous'
  entry: NormalizedAwardEntry
  confidence: number
  existingCandidates: AwardImportBookCandidate[]
  amazonCandidates: AwardImportAmazonCandidate[]
  reason: string
}

export type AwardUnmatched = {
  status: 'unmatched'
  entry: NormalizedAwardEntry
  existingCandidates: AwardImportBookCandidate[]
  amazonCandidates: AwardImportAmazonCandidate[]
  reason: string
}

export type AwardEntryResolution = AwardExistingMatch | AwardAmazonMatch | AwardAmbiguousMatch | AwardUnmatched

export type AwardSourceParser = {
  parse(params: { sourcePath: string }): Promise<NormalizedAwardEntry[]>
}
