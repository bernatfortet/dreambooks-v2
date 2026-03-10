import { collapseWhitespace } from '@/lib/awards/import/normalize'
import type { AwardResultType, AwardSourceParser, NormalizedAwardEntry } from '@/lib/awards/import/types'
import { extractPdfTextPages } from '../lib/pdf-text'

const AWARD_NAME = 'Caldecott'
const SOURCE_NAME = 'caldecott-pdf'

export const caldecottPdfParser: AwardSourceParser = {
  parse: parseCaldecottPdf,
}

export async function parseCaldecottPdf(params: { sourcePath: string }): Promise<NormalizedAwardEntry[]> {
  const pages = await extractPdfTextPages(params.sourcePath)
  const rows: NormalizedAwardEntry[] = []

  let currentYear: number | null = null
  let currentResultType: AwardResultType | null = null
  let currentCategoryLabel: string | null = null
  let entryBuffer: string[] = []
  let entryPage: number | undefined

  for (const page of pages) {
    const lines = getMeaningfulLines(page.text)

    for (const [index, line] of lines.entries()) {
      const nextLine = lines[index + 1]
      const header = parseAwardHeaderLine(line)

      if (header) {
        flushEntryBuffer()

        if (header.year) {
          currentYear = header.year
        }

        currentResultType = header.resultType
        currentCategoryLabel = header.categoryLabel

        if (!header.inlineEntryText) {
          continue
        }

        entryPage = page.pageNumber
        entryBuffer.push(header.inlineEntryText)

        if (lineLooksTerminal(header.inlineEntryText, nextLine)) {
          flushEntryBuffer()
        }

        continue
      }

      if (!currentYear || !currentResultType || !currentCategoryLabel) continue

      if (entryBuffer.length === 0) {
        entryPage = page.pageNumber
      }

      entryBuffer.push(line)

      if (lineLooksTerminal(line, nextLine)) {
        flushEntryBuffer()
      }
    }
  }

  flushEntryBuffer()

  return rows

  function flushEntryBuffer() {
    if (!currentYear || !currentResultType || !currentCategoryLabel) {
      entryBuffer = []
      entryPage = undefined
      return
    }

    const rawText = collapseWhitespace(entryBuffer.join(' '))
    if (!rawText) {
      entryBuffer = []
      entryPage = undefined
      return
    }

    rows.push(
      normalizeCaldecottEntry({
        rawText,
        year: currentYear,
        resultType: currentResultType,
        categoryLabel: currentCategoryLabel,
        sourcePath: params.sourcePath,
        sourcePage: entryPage,
      }),
    )

    entryBuffer = []
    entryPage = undefined
  }
}

function normalizeCaldecottEntry(params: {
  rawText: string
  year: number
  resultType: AwardResultType
  categoryLabel: string
  sourcePath: string
  sourcePage?: number
}): NormalizedAwardEntry {
  const parsedBibliography = parseCaldecottBibliography(params.rawText)

  return {
    awardName: AWARD_NAME,
    sourceName: SOURCE_NAME,
    sourcePath: params.sourcePath,
    sourcePage: params.sourcePage,
    rawText: params.rawText,
    year: params.year,
    resultType: params.resultType,
    categoryLabel: params.categoryLabel,
    title: parsedBibliography.title,
    author: parsedBibliography.author,
    illustrator: parsedBibliography.illustrator,
  }
}

function parseCaldecottBibliography(rawText: string) {
  const cleanedText = collapseWhitespace(rawText)
  const withoutPublisher = collapseWhitespace(cleanedText.replace(/\s*\([^)]*\)\.?\s*$/, ''))

  const sameCreatorMatch = withoutPublisher.match(
    /^(.*?)(?:,)?\s+(?:illustrated and written|written and illustrated|retold and illustrated|adapted and illustrated|translated and illustrated)\s+by\s+(.+)$/i,
  )
  if (sameCreatorMatch) {
    const creator = cleanupContributorName(sameCreatorMatch[2])
    return {
      title: cleanupTitle(sameCreatorMatch[1]),
      author: creator,
      illustrator: creator,
    }
  }

  const illustratedAndWrittenMatch = withoutPublisher.match(
    /^(.*?)(?:,\s*|\s+)(?:illus\.|illustrated|illustrating)\s+by\s+(.+?)\s+and\s+written by\s+(.+)$/i,
  )
  if (illustratedAndWrittenMatch) {
    return {
      title: cleanupTitle(illustratedAndWrittenMatch[1]),
      illustrator: cleanupContributorName(illustratedAndWrittenMatch[2]),
      author: cleanupContributorName(illustratedAndWrittenMatch[3]),
    }
  }

  const writtenAndIllustratedMatch = withoutPublisher.match(/^(.*?)(?:,\s*|\s+)written by\s+(.+?)\s+and\s+illustrated by\s+(.+)$/i)
  if (writtenAndIllustratedMatch) {
    return {
      title: cleanupTitle(writtenAndIllustratedMatch[1]),
      author: cleanupContributorName(writtenAndIllustratedMatch[2]),
      illustrator: cleanupContributorName(writtenAndIllustratedMatch[3]),
    }
  }

  const illustratedByTextMatch = withoutPublisher.match(
    /^(.*?)(?:,\s*|\s+)(?:illus\.|illustrated|illustrating)\s+by\s+(.+?)(?:,|;|\s+)(?:written by|text:|text by|retold by|adapted by)\s+(.+)$/i,
  )
  if (illustratedByTextMatch) {
    return {
      title: cleanupTitle(illustratedByTextMatch[1]),
      illustrator: cleanupContributorName(illustratedByTextMatch[2]),
      author: cleanupContributorName(illustratedByTextMatch[3]),
    }
  }

  const writtenByIllustratedByMatch = withoutPublisher.match(/^(.*?)(?:,)?\s+written by\s+(.+?),\s+illustrated by\s+(.+)$/i)
  if (writtenByIllustratedByMatch) {
    return {
      title: cleanupTitle(writtenByIllustratedByMatch[1]),
      author: cleanupContributorName(writtenByIllustratedByMatch[2]),
      illustrator: cleanupContributorName(writtenByIllustratedByMatch[3]),
    }
  }

  const illustratedOnlyMatch = withoutPublisher.match(/^(.*?)(?:,\s*|\s+)(?:illus\.|illustrated|illustrating)\s+by\s+(.+)$/i)
  if (illustratedOnlyMatch) {
    const illustrator = cleanupContributorName(illustratedOnlyMatch[2])
    return {
      title: cleanupTitle(illustratedOnlyMatch[1]),
      author: illustrator,
      illustrator,
    }
  }

  const simpleByMatch = withoutPublisher.match(/^(.*?)\s+by\s+(.+)$/i)
  if (simpleByMatch) {
    return {
      title: cleanupTitle(simpleByMatch[1]),
      author: cleanupContributorName(simpleByMatch[2]),
    }
  }

  const trailingCreatorMatch = withoutPublisher.match(
    /^(.*\b(?:a|an|the|of|and|in|to|for|with|on|at|from|my|your|our|their|his|her|its)\b.*)\s+([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,2})$/,
  )
  if (trailingCreatorMatch) {
    const creator = cleanupContributorName(trailingCreatorMatch[2])
    return {
      title: cleanupTitle(trailingCreatorMatch[1]),
      author: creator,
      illustrator: creator,
    }
  }

  return {
    title: cleanupTitle(withoutPublisher),
  }
}

function getMeaningfulLines(pageText: string): string[] {
  return pageText
    .split('\n')
    .map((line) => collapseWhitespace(line))
    .filter((line) => line.length > 0)
    .filter((line) => line !== 'Association for Library Service to Children (ALSC)')
    .filter((line) => line !== 'Caldecott Medal & Honor Books, 1938 to present')
    .filter((line) => !/^--\s+\d+\s+of\s+\d+\s+--$/.test(line))
}

function parseAwardHeaderLine(line: string): {
  year?: number
  resultType: AwardResultType
  categoryLabel: string
  inlineEntryText?: string
} | null {
  const medalWinnerMatch = line.match(/^(\d{4})\s+Medal Winner:?\s*(.*)$/i)
  if (medalWinnerMatch) {
    const inlineEntryText = collapseWhitespace(medalWinnerMatch[2] ?? '')
    return {
      year: Number(medalWinnerMatch[1]),
      resultType: 'winner',
      categoryLabel: 'Winner',
      inlineEntryText: inlineEntryText || undefined,
    }
  }

  const honorBooksMatch = line.match(/^(?:(\d{4})\s+)?Honor Books?::?\s*(.*)$/i)
  if (honorBooksMatch) {
    const inlineEntryText = collapseWhitespace(honorBooksMatch[2] ?? '')
    return {
      year: honorBooksMatch[1] ? Number(honorBooksMatch[1]) : undefined,
      resultType: 'honor',
      categoryLabel: 'Honor Book',
      inlineEntryText: inlineEntryText || undefined,
    }
  }

  return null
}

function lineLooksTerminal(line: string, nextLine?: string): boolean {
  if (/\)\.?$/.test(line)) return true
  if (!/\.$/.test(line)) return false
  if (!nextLine) return true
  if (/^\([^)]*\)\.?$/.test(nextLine)) return false
  return parseAwardHeaderLine(nextLine) !== null
}

function cleanupTitle(value: string): string {
  return collapseWhitespace(value.replace(/[.,;:]$/, ''))
}

function cleanupContributorName(value: string): string {
  return collapseWhitespace(
    value
      .replace(/\s+and published by$/i, '')
      .replace(/\s+Original text.*$/i, '')
      .replace(/^and\s+/i, '')
      .replace(/^text:\s*/i, '')
      .replace(/^written by\s+/i, '')
      .replace(/^illustrated by\s+/i, '')
      .replace(/^illus\.\s+by\s+/i, '')
      .replace(/^retold by\s+/i, '')
      .replace(/^adapted by\s+/i, '')
      .replace(/^published by\s+/i, '')
      .replace(/^(an|a)\s+imprint of\s+/i, '')
      .replace(/[.,;:]$/, ''),
  )
}
