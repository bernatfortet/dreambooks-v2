import type { BookData, EditionData } from './types'
import { COVER_FORMAT_PRIORITY } from './types'

type ScrapedCoverInput = Pick<
  BookData,
  'coverImageUrl' | 'coverWidth' | 'coverHeight' | 'coverSourceFormat' | 'coverSourceAsin' | 'editions'
>

type PreferredCoverSelection = {
  coverImageUrl: string | null
  coverWidth: number | null
  coverHeight: number | null
  coverSourceFormat: string | null
  coverSourceAsin: string | null
}

export function getCoverFormatPriority(format: string | null | undefined): number {
  if (!format) return COVER_FORMAT_PRIORITY.unknown
  return COVER_FORMAT_PRIORITY[format] ?? COVER_FORMAT_PRIORITY.unknown
}

export function pickBestEditionCover(editions: EditionData[]): EditionData | null {
  const editionsWithCovers = editions.filter((edition) => edition.mainCoverUrl)
  if (editionsWithCovers.length === 0) return null

  editionsWithCovers.sort((left, right) => {
    const leftPortrait = isLikelyPortraitCover(left) ? 1 : 0
    const rightPortrait = isLikelyPortraitCover(right) ? 1 : 0
    if (leftPortrait !== rightPortrait) return rightPortrait - leftPortrait

    const leftPriority = getCoverFormatPriority(left.format)
    const rightPriority = getCoverFormatPriority(right.format)
    return rightPriority - leftPriority
  })

  return editionsWithCovers[0]
}

export function pickPreferredCoverFromScrapedData(scrapedData: ScrapedCoverInput): PreferredCoverSelection {
  const bestEditionCover = pickBestEditionCover(scrapedData.editions)
  if (!bestEditionCover?.mainCoverUrl) {
    return {
      coverImageUrl: scrapedData.coverImageUrl,
      coverWidth: scrapedData.coverWidth,
      coverHeight: scrapedData.coverHeight,
      coverSourceFormat: scrapedData.coverSourceFormat,
      coverSourceAsin: scrapedData.coverSourceAsin,
    }
  }

  const currentPriority = getCoverFormatPriority(scrapedData.coverSourceFormat)
  const bestEditionPriority = getCoverFormatPriority(bestEditionCover.format)

  if (scrapedData.coverImageUrl && currentPriority >= bestEditionPriority) {
    return {
      coverImageUrl: scrapedData.coverImageUrl,
      coverWidth: scrapedData.coverWidth,
      coverHeight: scrapedData.coverHeight,
      coverSourceFormat: scrapedData.coverSourceFormat,
      coverSourceAsin: scrapedData.coverSourceAsin,
    }
  }

  return {
    coverImageUrl: bestEditionCover.mainCoverUrl,
    coverWidth: bestEditionCover.coverWidth,
    coverHeight: bestEditionCover.coverHeight,
    coverSourceFormat: bestEditionCover.format,
    coverSourceAsin: bestEditionCover.asin,
  }
}

export function shouldReplaceStoredCover(params: {
  existingCoverSourceUrl: string | undefined
  existingCoverSourceFormat: string | undefined
  incomingCoverSourceUrl: string | undefined
  incomingCoverSourceFormat: string | undefined
}): boolean {
  if (!params.incomingCoverSourceUrl) return false
  if (!params.existingCoverSourceUrl) return true

  const existingPriority = getCoverFormatPriority(params.existingCoverSourceFormat)
  const incomingPriority = getCoverFormatPriority(params.incomingCoverSourceFormat)

  return incomingPriority >= existingPriority
}

function isLikelyPortraitCover(edition: Pick<EditionData, 'coverWidth' | 'coverHeight'>): boolean {
  const { coverWidth, coverHeight } = edition

  if (!coverWidth || !coverHeight) return true
  if (coverWidth <= 0 || coverHeight <= 0) return true

  const landscapeThreshold = 1.05
  return coverWidth / coverHeight <= landscapeThreshold
}
