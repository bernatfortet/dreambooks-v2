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
- Query `api.series.queries.getBySourceUrl` with the URL
- If exists, ask user if they want to rescrape/refresh

### Step 3: Add to Scrape Queue

The easiest way is to add the series URL to the scrape queue:

```typescript
// Add to queue via mutation
await context.mutation(api.scrapeQueue.mutations.enqueue, {
  url: amazonSeriesUrl,
  type: 'series',
  source: 'user',
})
```

The local worker will then:
1. Scrape the series page
2. Create the series record
3. Queue discovered books automatically (via unified discovery system)
4. Process books with priority ordering

### Step 4: Data Verification (TODO - v1)

Future enhancement: Use fast/cheap AI model to verify:
- Series name is accurate and clean
- Book count matches expectation
- Description is appropriate

### Step 5: Confirmation

Report back to user:
- Series URL added to queue
- Worker will process and discover books automatically
- Books will be queued with `source: 'discovery'`

## Key Files

| File | Purpose |
|------|---------|
| `convex/scrapeQueue/mutations.ts` | Queue mutations (enqueue, enqueueDiscoveries) |
| `convex/scraping/scrapeSeries.ts` | Action for direct series scraping |
| `convex/series/mutations.ts` | Database mutations for series |
| `scripts/worker/processors/series.ts` | Worker processor for series URLs |
| `lib/scraping/domains/series/discover.ts` | Book discovery extraction from series |

## Unified Discovery System

Books are now discovered via a unified queue system:

1. When a series is scraped, `discoverSeriesLinks()` extracts book URLs
2. Books are added to `scrapeQueue` with `source: 'discovery'`
3. Worker processes queue items in priority order
4. Books themselves may discover more series/authors

## Database Schema

### Series Table

- Identity: `name`
- Source: `source`, `sourceUrl`, `sourceId`
- Display: `description`, `coverStorageId`, `coverSourceUrl`
- Completeness: `expectedBookCount`, `discoveredBookCount`, `scrapedBookCount`, `completeness`
- Pagination: `lastScrapedPage`, `totalPages`, `nextPageUrl`
- Status: `scrapeStatus`, `lastScrapedAt`, `errorMessage`

### Scrape Queue Table

- `url`: The URL to scrape
- `type`: 'book' | 'series' | 'author'
- `source`: 'user' | 'discovery'
- `status`: 'pending' | 'processing' | 'complete' | 'error'
- `priority`: Lower = higher priority

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
- Book scraping failures → Errors tracked in scrapeQueue

## Future Enhancements (v1+)

- [ ] Search by series name
- [ ] AI verification of series metadata
- [ ] Automatic pagination handling
- [ ] Series cover image download
- [ ] Cross-reference with other sources
