# Test Plan: Unified Discovery System

## Status: COMPLETE

The unified discovery system has been fully implemented and the legacy `seriesBookDiscoveries` table has been removed.

## Summary of Changes

1. **Discovery extractors** created in `lib/scraping/domains/*/discover.ts`:
   - `discoverBookLinks()` - extracts series and author discoveries from books
   - `discoverSeriesLinks()` - extracts book discoveries from series
   - `discoverAuthorLinks()` - extracts series and book discoveries from authors

2. **Queue mutations** updated in `convex/scrapeQueue/mutations.ts`:
   - `enqueue()` - supports `source` field ('user' or 'discovery')
   - `enqueueDiscoveries()` - bulk queues discoveries with capping and deduplication

3. **Processors** updated in `scripts/worker/processors/`:
   - All processors now call discovery extractors and queue discoveries
   - No more inline scraping of related entities

4. **Legacy cleanup complete**:
   - `seriesBookDiscoveries` table removed from schema
   - `createDiscovery`, `updateDiscovery` mutations removed
   - `scrapeDiscovery` action removed
   - SeriesCard UI simplified (no discovery scraping)

## Architecture

```
User/Admin UI → scrapeQueue (source: 'user')
      ↓
   Worker processes queue item
      ↓
   Processor calls parseXFromPage()
      ↓
   discoverXLinks() extracts discoveries
      ↓
   queueDiscoveries() adds to scrapeQueue (source: 'discovery')
      ↓
   Loop continues...
```

## Priority Order

- User-initiated items: priority 10 (default)
- Series from books: priority 20
- Books from series: priority 30
- Series from authors: priority 25
- Books from authors: priority 35
- Authors from books: priority 40

## Capping

- Per discovery extraction: 50 books, 20 series, 30 books from author
- Per `enqueueDiscoveries` call: 50 items max

## Running Tests

```bash
bunx tsx scripts/test-discovery-system.ts
```

This verifies:
- Discovery extraction correctness
- Queue capping and deduplication
- Source field handling

## Manual Testing

1. Start worker: `bunx tsx scripts/worker/index.ts`
2. Add a book/series/author via the admin UI
3. Watch discoveries flow through the queue
4. Verify books are created with correct series links
