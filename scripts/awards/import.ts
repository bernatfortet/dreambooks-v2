#!/usr/bin/env bun

import * as dotenv from 'dotenv'
import { spawn } from 'child_process'
import { ConvexHttpClient } from 'convex/browser'
import type { Id } from '@/convex/_generated/dataModel'
import { api } from '@/convex/_generated/api'
import { scrapeBook } from '@/lib/scraping'
import {
  fetchScoredAmazonBookCandidates,
  fetchScoredExistingBookCandidates,
  getUnresolvedMatchReason,
  shouldAutoSelectAmazonBook,
  shouldAutoSelectExistingBook,
  type ScoredAmazonBookCandidate,
  type ScoredExistingBookCandidate,
} from '@/lib/awards/import/research'
import type {
  AwardEntryResolution,
  AwardImportAmazonCandidate,
  AwardImportBookCandidate,
  AwardSourceParser,
  NormalizedAwardEntry,
} from '@/lib/awards/import/types'
import { importBookToConvex } from '../lib/convex-client'
import { getAwardArtifactPath, readJsonFile, writeJsonFile } from './lib/io'
import { caldecottPdfParser } from './parsers/caldecott'
import { newberyPdfParser } from './parsers/newbery'

dotenv.config({ path: '.env.local' })
dotenv.config()

const scrapeImportKey = process.env.SCRAPE_IMPORT_KEY
if (!scrapeImportKey) {
  throw new Error('SCRAPE_IMPORT_KEY environment variable is not set')
}

type CliCommand = 'extract' | 'enqueue' | 'resolve' | 'import' | 'link' | 'report' | 'run'

type CliOptions = {
  award: string
  command: CliCommand
  sourcePath: string
  extractedPath: string
  resolvedPath: string
  importedPath: string
  headless: boolean
  limit: number
  offset: number
  maxItems?: number
  directImport: boolean
  skipAmazon: boolean
  skipWorker: boolean
}

type ImportedAwardItem = {
  entry: NormalizedAwardEntry
  resolutionStatus: AwardEntryResolution['status']
  confidence: number
  bookId?: string
  existingBook?: AwardImportBookCandidate
  amazonCandidate?: AwardImportAmazonCandidate
  importStatus:
    | 'matched_existing'
    | 'queued'
    | 'already_queued'
    | 'skipped_up_to_date'
    | 'imported'
    | 'unresolved'
    | 'failed'
  error?: string
}

type ArtifactEnvelope<T> = {
  award: string
  sourcePath?: string
  createdAt: string
  itemCount: number
  items: T[]
}

async function main() {
  const options = parseArgs(process.argv.slice(2))

  switch (options.command) {
    case 'extract':
      await runExtractStage(options)
      return
    case 'enqueue':
      await runEnqueueStage(options)
      return
    case 'resolve':
      await runResolveStage(options)
      return
    case 'import':
      await runImportStage(options)
      return
    case 'link':
      await runLinkStage(options)
      return
    case 'report':
      await runReportStage(options)
      return
    case 'run':
      await runExtractStage(options)
      await runEnqueueStage(options)
      return
  }
}

async function runExtractStage(options: CliOptions) {
  const parser = getParser(options.award)
  const entries = await parser.parse({
    sourcePath: options.sourcePath,
  })

  await writeJsonFile(options.extractedPath, createArtifactEnvelope(options.award, entries, options.sourcePath))

  console.log('✅ Extracted award entries')
  console.log(`   Award: ${options.award}`)
  console.log(`   Source: ${options.sourcePath}`)
  console.log(`   Entries: ${entries.length}`)
  console.log(`   Output: ${options.extractedPath}`)
}

async function runEnqueueStage(options: CliOptions) {
  const extractedArtifact = await readJsonFile<ArtifactEnvelope<NormalizedAwardEntry>>(options.extractedPath)
  const client = createConvexClient()
  const entries = applyItemWindow(extractedArtifact.items, options)

  let created = 0
  let skipped = 0

  for (const chunk of chunkArray(entries, 100)) {
    const result = await client.mutation(api.bookIntake.mutations.enqueueManyFromAwardRows, {
      entries: chunk.map((entry) => ({
        awardName: entry.awardName,
        year: entry.year,
        resultType: entry.resultType,
        categoryLabel: entry.categoryLabel,
        title: entry.title,
        author: entry.author,
        illustrator: entry.illustrator,
        sourceName: entry.sourceName,
        sourcePath: entry.sourcePath,
        sourcePage: entry.sourcePage,
        rawText: entry.rawText,
      })),
    })

    created += result.created
    skipped += result.skipped
  }

  console.log('✅ Enqueued award entries into book intake')
  console.log(`   Items considered: ${entries.length}`)
  console.log(`   Created: ${created}`)
  console.log(`   Skipped existing: ${skipped}`)
}

async function runResolveStage(options: CliOptions) {
  const extractedArtifact = await readJsonFile<ArtifactEnvelope<NormalizedAwardEntry>>(options.extractedPath)
  const client = createConvexClient()
  const items: AwardEntryResolution[] = []
  const entries = applyItemWindow(extractedArtifact.items, options)

  for (const entry of entries) {
    const resolvedItem = await resolveAwardEntry({
      client,
      entry,
      headless: options.headless,
      limit: options.limit,
      skipAmazon: options.skipAmazon,
    })

    items.push(resolvedItem)
    console.log(`🌀 Resolved ${entry.year} ${entry.title}: ${resolvedItem.status}`)
  }

  await writeJsonFile(options.resolvedPath, createArtifactEnvelope(options.award, items, options.sourcePath))

  console.log('✅ Resolved award entries')
  console.log(`   Items: ${items.length}`)
  console.log(`   Output: ${options.resolvedPath}`)
}

async function runImportStage(options: CliOptions) {
  const resolvedArtifact = await readJsonFile<ArtifactEnvelope<AwardEntryResolution>>(options.resolvedPath)
  const client = createConvexClient()
  const importedItems: ImportedAwardItem[] = []
  const resolutions = applyItemWindow(resolvedArtifact.items, options)

  let queuedCount = 0

  for (const resolution of resolutions) {
    if (resolution.status === 'matched_existing') {
      importedItems.push({
        entry: resolution.entry,
        resolutionStatus: resolution.status,
        confidence: resolution.confidence,
        bookId: resolution.book.bookId,
        existingBook: resolution.book,
        importStatus: 'matched_existing',
      })
      continue
    }

    if (resolution.status !== 'resolved_amazon') {
      importedItems.push({
        entry: resolution.entry,
        resolutionStatus: resolution.status,
        confidence: resolution.confidence,
        importStatus: 'unresolved',
        error: resolution.reason,
      })
      continue
    }

    try {
      if (options.directImport) {
        const directImportResult = await importAmazonBookDirectly({
          entry: resolution.entry,
          amazonCandidate: resolution.amazon,
          headless: options.headless,
        })

        importedItems.push({
          entry: resolution.entry,
          resolutionStatus: resolution.status,
          confidence: resolution.confidence,
          amazonCandidate: resolution.amazon,
          bookId: directImportResult.bookId,
          importStatus: directImportResult.isNew ? 'imported' : 'skipped_up_to_date',
        })
        continue
      }

      const enqueueResult = await client.mutation(api.scrapeQueue.mutations.enqueue, {
        apiKey: scrapeImportKey,
        url: resolution.amazon.amazonUrl,
        type: 'book',
        displayName: resolution.entry.title,
        scrapeFullSeries: false,
        source: 'user',
        referrerUrl: resolution.entry.sourcePath,
        referrerReason: `award-import:${resolution.entry.awardName.toLowerCase()}`,
        skipAuthorDiscovery: true,
      })

      if (enqueueResult.status === 'blocked') {
        importedItems.push({
          entry: resolution.entry,
          resolutionStatus: resolution.status,
          confidence: resolution.confidence,
          amazonCandidate: resolution.amazon,
          importStatus: 'failed',
          error: 'Queue rejected the Amazon URL as blocked.',
        })
        continue
      }

      if (enqueueResult.status === 'skipped_up_to_date') {
        importedItems.push({
          entry: resolution.entry,
          resolutionStatus: resolution.status,
          confidence: resolution.confidence,
          amazonCandidate: resolution.amazon,
          bookId: enqueueResult.entityId,
          importStatus: 'skipped_up_to_date',
        })
        continue
      }

      queuedCount += 1
      importedItems.push({
        entry: resolution.entry,
        resolutionStatus: resolution.status,
        confidence: resolution.confidence,
        amazonCandidate: resolution.amazon,
        importStatus: enqueueResult.status,
      })
    } catch (error) {
      importedItems.push({
        entry: resolution.entry,
        resolutionStatus: resolution.status,
        confidence: resolution.confidence,
        amazonCandidate: resolution.amazon,
        importStatus: 'failed',
        error: error instanceof Error ? error.message : 'Unknown import error',
      })
    }
  }

  if (queuedCount > 0 && !options.skipWorker) {
    console.log(`🌀 Processing ${queuedCount} queued Amazon imports...`)
    await runWorkerUntilIdle()
  }

  const finalizedItems = await resolveImportedBookIds({
    client,
    importedItems,
  })

  await writeJsonFile(options.importedPath, createArtifactEnvelope(options.award, finalizedItems, options.sourcePath))

  console.log('✅ Imported award entries')
  console.log(`   Items: ${finalizedItems.length}`)
  console.log(`   Output: ${options.importedPath}`)
}

async function runLinkStage(options: CliOptions) {
  const importedArtifact = await readJsonFile<ArtifactEnvelope<ImportedAwardItem>>(options.importedPath)
  const client = createConvexClient()
  const linkableItems = importedArtifact.items.filter((item) => item.bookId)

  if (linkableItems.length === 0) {
    console.log('⚠️ No imported items were ready to link.')
    return
  }

  const importBatchKey = `${options.award}-${new Date().toISOString()}`
  let created = 0
  let updated = 0

  for (const chunk of chunkArray(linkableItems, 25)) {
    const result = await client.mutation(api.awards.mutations.upsertBookAwardResults, {
      entries: chunk.map((item) => ({
        bookId: item.bookId as Id<'books'>,
        awardName: item.entry.awardName,
        year: item.entry.year,
        category: item.entry.categoryLabel,
        resultType: item.entry.resultType,
        sourceName: item.entry.sourceName,
        sourcePage: item.entry.sourcePage,
        sourceText: item.entry.rawText,
        importBatchKey,
      })),
    })

    created += result.created
    updated += result.updated
  }

  console.log('✅ Linked award results')
  console.log(`   Linkable items: ${linkableItems.length}`)
  console.log(`   Created: ${created}`)
  console.log(`   Updated: ${updated}`)
}

async function runReportStage(options: CliOptions) {
  const importedArtifact = await readJsonFile<ArtifactEnvelope<ImportedAwardItem>>(options.importedPath)

  const counts = importedArtifact.items.reduce<Record<string, number>>((accumulator, item) => {
    accumulator[item.importStatus] = (accumulator[item.importStatus] ?? 0) + 1
    return accumulator
  }, {})

  console.log('📊 Award import report')
  console.log(`   Award: ${importedArtifact.award}`)
  console.log(`   Items: ${importedArtifact.itemCount}`)

  for (const [status, count] of Object.entries(counts).sort((left, right) => left[0].localeCompare(right[0]))) {
    console.log(`   ${status}: ${count}`)
  }

  const unresolvedItems = importedArtifact.items.filter((item) => !item.bookId)
  if (unresolvedItems.length === 0) return

  console.log('')
  console.log('Unresolved entries:')
  for (const item of unresolvedItems) {
    console.log(` - ${item.entry.year} ${item.entry.title} (${item.importStatus})`)
  }
}

async function resolveAwardEntry(params: {
  client: ConvexHttpClient
  entry: NormalizedAwardEntry
  headless: boolean
  limit: number
  skipAmazon: boolean
}): Promise<AwardEntryResolution> {
  const { client, entry, headless, limit, skipAmazon } = params

  const existingCandidates = await fetchScoredExistingBookCandidates({
    client,
    entry,
    limit,
  })
  const strongestExistingCandidate = existingCandidates[0]

  if (shouldAutoSelectExistingBook({ entry, candidates: existingCandidates }) && strongestExistingCandidate) {
    return {
      status: 'matched_existing',
      entry,
      matchedBy: 'search',
      confidence: strongestExistingCandidate.score,
      candidates: existingCandidates,
      book: strongestExistingCandidate,
    }
  }

  if (skipAmazon) {
    return buildSkippedAmazonResolution({
      entry,
      existingCandidates,
      strongestExistingCandidateScore: strongestExistingCandidate?.score ?? 0,
    })
  }

  let amazonCandidates: ScoredAmazonBookCandidate[] = []
  try {
    amazonCandidates = await fetchScoredAmazonBookCandidates({
      entry,
      headless,
      limit,
    })
  } catch (error) {
    return {
      status: existingCandidates.length > 0 ? 'ambiguous' : 'unmatched',
      entry,
      confidence: strongestExistingCandidate?.score ?? 0,
      existingCandidates,
      amazonCandidates: [],
      reason: error instanceof Error ? error.message : 'Amazon search failed',
    }
  }

  const strongestAmazonCandidate = amazonCandidates[0]

  if (shouldAutoSelectAmazonBook({ entry, candidates: amazonCandidates }) && strongestAmazonCandidate) {
    return {
      status: 'resolved_amazon',
      entry,
      confidence: strongestAmazonCandidate.score,
      candidates: amazonCandidates,
      amazon: strongestAmazonCandidate,
    }
  }

  return buildUnresolvedResolution({
    entry,
    existingCandidates,
    amazonCandidates,
    confidence: Math.max(strongestExistingCandidate?.score ?? 0, strongestAmazonCandidate?.score ?? 0),
  })
}

async function resolveImportedBookIds(params: {
  client: ConvexHttpClient
  importedItems: ImportedAwardItem[]
}): Promise<ImportedAwardItem[]> {
  const finalizedItems: ImportedAwardItem[] = []

  for (const item of params.importedItems) {
    if (item.bookId || !item.amazonCandidate) {
      finalizedItems.push(item)
      continue
    }

    const resolvedBook = await params.client.query(api.awards.queries.findBookByIdentifierForImport, {
      asin: item.amazonCandidate.asin,
    })

    if (!resolvedBook) {
      finalizedItems.push({
        ...item,
        importStatus: 'failed',
        error: item.error ?? `Book was not found after import for ASIN ${item.amazonCandidate.asin}.`,
      })
      continue
    }

    finalizedItems.push({
      ...item,
      bookId: resolvedBook.bookId,
      importStatus: 'imported',
    })
  }

  return finalizedItems
}

function buildSkippedAmazonResolution(params: {
  entry: NormalizedAwardEntry
  existingCandidates: ScoredExistingBookCandidate[]
  strongestExistingCandidateScore: number
}): AwardEntryResolution {
  if (params.existingCandidates.length > 0) {
    return {
      status: 'ambiguous',
      entry: params.entry,
      confidence: params.strongestExistingCandidateScore,
      existingCandidates: params.existingCandidates,
      amazonCandidates: [],
      reason: 'Existing candidates were found, but none were distinct enough to auto-link safely.',
    }
  }

  return {
    status: 'unmatched',
    entry: params.entry,
    confidence: 0,
    existingCandidates: [],
    amazonCandidates: [],
    reason: 'No existing Dreambooks match was found.',
  }
}

function buildUnresolvedResolution(params: {
  entry: NormalizedAwardEntry
  existingCandidates: ScoredExistingBookCandidate[]
  amazonCandidates: ScoredAmazonBookCandidate[]
  confidence: number
}): AwardEntryResolution {
  const reason = getUnresolvedMatchReason({
    existingCandidateCount: params.existingCandidates.length,
    amazonCandidateCount: params.amazonCandidates.length,
  })

  if (params.existingCandidates.length > 0 || params.amazonCandidates.length > 0) {
    return {
      status: 'ambiguous',
      entry: params.entry,
      confidence: params.confidence,
      existingCandidates: params.existingCandidates,
      amazonCandidates: params.amazonCandidates,
      reason,
    }
  }

  return {
    status: 'unmatched',
    entry: params.entry,
    confidence: 0,
    existingCandidates: [],
    amazonCandidates: [],
    reason,
  }
}

function parseArgs(args: string[]): CliOptions {
  const command = args[0] && !args[0].startsWith('--') ? (args[0] as CliCommand) : 'run'
  const options = new Map<string, string>()

  for (let index = command === 'run' && args[0]?.startsWith('--') ? 0 : 1; index < args.length; index += 1) {
    const arg = args[index]
    if (!arg.startsWith('--')) continue

    const [key, inlineValue] = arg.split('=')
    const nextValue = inlineValue ?? args[index + 1]

    if (inlineValue === undefined && args[index + 1] && !args[index + 1].startsWith('--')) {
      options.set(key, nextValue)
      index += 1
      continue
    }

    options.set(key, inlineValue ?? 'true')
  }

  const award = options.get('--award') ?? 'caldecott'
  const sourcePath = options.get('--source') ?? getDefaultSourcePathForAward(award)
  const extractedPath = options.get('--extracted') ?? getAwardArtifactPath({ awardSlug: award, artifactName: 'extracted' })
  const resolvedPath = options.get('--resolved') ?? getAwardArtifactPath({ awardSlug: award, artifactName: 'resolved' })
  const importedPath = options.get('--imported') ?? getAwardArtifactPath({ awardSlug: award, artifactName: 'imported' })
  const headless = options.get('--headless') !== 'false'
  const limit = Number(options.get('--limit') ?? '5')
  const offset = Number(options.get('--offset') ?? '0')
  const maxItemsRaw = options.get('--max-items')
  const maxItems = maxItemsRaw ? Number(maxItemsRaw) : undefined
  const directImport = options.get('--direct-import') === 'true'
  const skipAmazon = options.get('--skip-amazon') === 'true'
  const skipWorker = options.get('--skip-worker') === 'true'

  return {
    award,
    command,
    sourcePath,
    extractedPath,
    resolvedPath,
    importedPath,
    headless,
    limit,
    offset: Number.isNaN(offset) || offset < 0 ? 0 : offset,
    maxItems,
    directImport,
    skipAmazon,
    skipWorker,
  }
}

function createConvexClient() {
  const convexUrl = process.env.CONVEX_URL
  if (!convexUrl) {
    throw new Error('CONVEX_URL environment variable is not set')
  }

  return new ConvexHttpClient(convexUrl)
}

function getParser(award: string): AwardSourceParser {
  if (award === 'caldecott') return caldecottPdfParser
  if (award === 'newbery') return newberyPdfParser
  throw new Error(`Unsupported award source: ${award}`)
}

function getDefaultSourcePathForAward(award: string): string {
  if (award === 'caldecott') return `${process.cwd()}/tmp/caldecott-medal-honors-to-present.pdf`
  if (award === 'newbery') return `${process.cwd()}/tmp/newbery-medals-honors-1922-present.pdf`
  throw new Error(`Unsupported award source: ${award}`)
}

function createArtifactEnvelope<T>(award: string, items: T[], sourcePath?: string): ArtifactEnvelope<T> {
  return {
    award,
    sourcePath,
    createdAt: new Date().toISOString(),
    itemCount: items.length,
    items,
  }
}

async function runWorkerUntilIdle() {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('bun', ['run', 'worker', '--until-idle=1'], {
      cwd: process.cwd(),
      stdio: 'inherit',
    })

    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`Worker exited with code ${code}`))
    })

    child.on('error', reject)
  })
}

async function importAmazonBookDirectly(params: {
  entry: NormalizedAwardEntry
  amazonCandidate: AwardImportAmazonCandidate
  headless: boolean
}) {
  const scrapeResult = await scrapeBook(params.amazonCandidate.amazonUrl, {
    provider: 'playwright',
    headless: params.headless,
  })

  if (!scrapeResult.success) {
    throw new Error(scrapeResult.error ?? 'Direct Amazon scrape failed')
  }

  if (!scrapeResult.data.title) {
    throw new Error('Direct Amazon scrape returned no title')
  }

  if (!scrapeResult.data.authors?.length) {
    throw new Error('Direct Amazon scrape returned no authors')
  }

  return await importBookToConvex({
    scrapedData: scrapeResult.data,
    amazonUrl: params.amazonCandidate.amazonUrl,
    firstSeenFromUrl: params.entry.sourcePath,
    firstSeenReason: `award-import:${params.entry.awardName.toLowerCase()}`,
  })
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = []

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize))
  }

  return chunks
}

function applyItemWindow<T>(items: T[], options: Pick<CliOptions, 'offset' | 'maxItems'>): T[] {
  const startIndex = Number.isNaN(options.offset) || options.offset < 0 ? 0 : options.offset

  if (!options.maxItems || Number.isNaN(options.maxItems) || options.maxItems <= 0) {
    return items.slice(startIndex)
  }

  return items.slice(startIndex, startIndex + options.maxItems)
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`❌ Award import failed: ${message}`)

  if (error instanceof Error && error.stack) {
    console.error(error.stack)
  }

  process.exit(1)
})
