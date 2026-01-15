---
name: add-series
description: Add a new book series to Dreambooks. Use when user wants to add a series by URL (Amazon) or by name. Handles scraping series metadata and discovering all books in the series.
---

# Add Series Skill

This skill guides you through adding a new book series to the Dreambooks database.

## When to Use

- User asks to "add a series", "import a series", or "scrape a series"
- User provides an Amazon series URL
- User provides a series name to search for
- User wants to discover all books in a series

## Input Types

1. **Amazon Series URL**: Direct URL to an Amazon series page (e.g., `https://www.amazon.com/dp/B0XXXXXX?binding=kindle_edition`)
2. **Series Name**: Text search that requires finding the series first (TODO - v1)

## Workflow

### Step 1: Input Resolution

**If URL provided:**
- Validate it's an Amazon series URL
- Extract series ID if possible

**If name provided (TODO - v1):**
- Search Amazon for the series
- Present options to user for confirmation
- Get URL from selected result

### Step 2: Check for Duplicates

Before scraping, check if series already exists:
- Query `internal.series.queries.getBySourceUrl` with the URL
- If exists, ask user if they want to rescrape/refresh

### Step 3: Create or Get Series Record

If new series:

```typescript
const seriesId = await context.runMutation(internal.series.mutations.upsert, {
  name: seriesName, // may be placeholder until scrape completes
  source: 'amazon',
  sourceUrl: amazonSeriesUrl,
})
```

### Step 4: Scrape Series Data

Use the existing scrapeSeries action:

```typescript
await context.runAction(api.scraping.scrapeSeries.scrapeSeries, {
  seriesId: seriesId,
})
```

This action:
1. Creates a `seriesScrapeRun` for traceability
2. Calls Amazon adapter to extract series metadata
3. Creates `seriesBookDiscoveries` for each book found
4. Updates series with book counts and pagination info
5. Handles multi-page series (pagination)

### Step 5: Data Verification (TODO - v1)

Future enhancement: Use fast/cheap AI model to verify:
- Series name is accurate and clean
- Book count matches expectation
- Description is appropriate

### Step 6: Process Discovered Books (Optional)

After series scrape, user may want to import the books:

```typescript
// Get pending discoveries
const discoveries = await context.runQuery(internal.series.queries.getDiscoveriesByStatus, {
  seriesId: seriesId,
  status: 'pending',
})

// Scrape each discovered book
for (const discovery of discoveries) {
  await context.runAction(api.scraping.scrapeSeries.scrapeDiscovery, {
    discoveryId: discovery._id,
  })
}
```

### Step 7: Confirmation

Report back to user:
- Series name and description
- Number of books discovered
- How many are already in DB vs pending
- Whether pagination exists (more pages to scrape)

## Key Files

| File | Purpose |
|------|---------|
| `convex/scraping/scrapeSeries.ts` | Main entry point - orchestrates series scraping |
| `convex/scraping/adapters/amazon/series.ts` | Amazon-specific series extraction |
| `convex/series/mutations.ts` | Database mutations for series |
| `convex/series/queries.ts` | Queries for series and discoveries |
| `lib/scraping/domains/series/types.ts` | SeriesData type definition |

## Database Schema

### Series Table

- Identity: `name`
- Source: `source`, `sourceUrl`, `sourceId`
- Display: `description`, `coverStorageId`, `coverSourceUrl`
- Completeness: `expectedBookCount`, `discoveredBookCount`, `scrapedBookCount`, `completeness`
- Pagination: `lastScrapedPage`, `totalPages`, `nextPageUrl`
- Status: `scrapeStatus`, `lastScrapedAt`, `errorMessage`

### Series Book Discoveries Table

- Links: `seriesId`, `bookId` (after import)
- Source: `source`, `sourceUrl`, `sourceId`, `normalizedUrl`
- Display: `title`, `position`
- Status: `status` (pending/complete/skipped/error)

## Series Scrape States

```
pending → processing → partial → complete
                   ↘ error
```

- `pending`: Created, not yet scraped
- `processing`: Currently scraping
- `partial`: Has more pages to scrape (`nextPageUrl` exists)
- `complete`: All pages scraped
- `error`: Scraping failed

## Error Handling

Common errors to handle:
- Invalid URL format → Ask user to provide Amazon series URL
- Series not found → URL may be incorrect
- Partial scrape → Inform user, offer to continue pagination
- Book scraping failures → Report which discoveries failed

## Future Enhancements (v1+)

- [ ] Search by series name
- [ ] AI verification of series metadata
- [ ] Automatic pagination handling
- [ ] Batch import all discovered books
- [ ] Series cover image download
- [ ] Cross-reference with other sources
