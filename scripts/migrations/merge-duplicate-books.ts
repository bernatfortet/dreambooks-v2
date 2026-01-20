import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'

function getFlagValue(flag: string): string | null {
  const direct = process.argv.find((arg) => arg.startsWith(`${flag}=`))
  if (direct) return direct.slice(flag.length + 1)

  const index = process.argv.indexOf(flag)
  if (index !== -1) {
    const next = process.argv[index + 1]
    if (next && !next.startsWith('--')) return next
  }

  return null
}

async function main() {
  const convexUrl = process.env.CONVEX_URL
  const apiKey = process.env.SCRAPE_IMPORT_KEY

  if (!convexUrl) {
    throw new Error('CONVEX_URL environment variable is not set')
  }
  if (!apiKey) {
    throw new Error('SCRAPE_IMPORT_KEY environment variable is not set')
  }

  const seriesId = getFlagValue('--seriesId') ?? undefined
  const limitRaw = getFlagValue('--limit')
  const limit = limitRaw ? Number(limitRaw) : undefined
  const dryRun = !process.argv.includes('--apply')

  const client = new ConvexHttpClient(convexUrl)

  const result = await client.action(api.books.migrateDuplicates.mergeDuplicatesBySeriesPosition, {
    apiKey,
    seriesId: seriesId as Id<'series'> | undefined,
    dryRun,
    limit,
  })

  console.log(
    JSON.stringify(
      {
        dryRun,
        groupsFound: result.groupsFound,
        booksDeleted: result.booksDeleted,
        merges: result.merges.map((m) => ({
          seriesId: m.seriesId,
          seriesPosition: m.seriesPosition,
          keeperBookId: m.keeperBookId,
          deletedBookIds: m.deletedBookIds,
        })),
      },
      null,
      2,
    ),
  )

  if (dryRun) {
    console.log('\nDry run only. Re-run with `--apply` to execute merges.')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
