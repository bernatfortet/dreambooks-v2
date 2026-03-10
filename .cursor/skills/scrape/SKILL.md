---
name: scrape
description: Scrape Amazon URLs (books, series, authors) with natural language control over cascading depth. Handles enqueueing, worker execution, and result assessment.
---

# Scrape Skill

Unified scraping workflow that accepts natural language input to control what and how deeply to scrape.

## When to Use

- User says "/scrape" followed by a URL or description
- User wants to add a book, series, or author from Amazon
- User wants control over how much cascading happens (e.g., "just the book", "full series")

## Input Parsing

### Step 1: Extract URL

Look for Amazon URLs in the user's input:
- Book: Contains `/dp/` with 10-char ASIN (e.g., `amazon.com/dp/0062990470`)
- Series: Contains `/dp/` with ASIN starting with B (e.g., `amazon.com/dp/B08911B14Q`)
- Author: Contains `/stores/` or `/e/` (e.g., `amazon.com/stores/author/B000APNG74`)

If no URL found, ask the user for one.

### Step 2: Detect URL Type

```
URL Pattern                              → Type
─────────────────────────────────────────────────────
/dp/[0-9]{10}                           → book (ISBN-like ASIN)
/dp/B[A-Z0-9]{9}                        → series (B-prefix ASIN)
/stores/author/ or /e/B[A-Z0-9]{9}      → author
```

Note: Series and some Kindle books both use B-prefix ASINs. Default to "series" for B-prefix unless context suggests otherwise.

### Step 3: Parse Strategy from Natural Language

| User says | Strategy | Flags |
|-----------|----------|-------|
| "only", "just", "only the book/series/author" | minimal | No cascading |
| "shallow", "don't scrape all books", "metadata only" | shallow | Link but don't cascade |
| "full", "complete", "with all books", "everything" | full | Full cascade (default) |
| (no modifier) | full | Full cascade |

## Strategy Mapping

### For Books

| Strategy | scrapeFullSeries | skipSeriesLink | skipAuthorDiscovery |
|----------|------------------|----------------|---------------------|
| minimal | false | true | true |
| shallow | false | false | true |
| full | true | false | false |

### For Series

| Strategy | scrapeFullSeries | skipBookDiscoveries |
|----------|------------------|---------------------|
| minimal | false | true |
| full | true | false |

### For Authors

| Strategy | skipBookDiscoveries |
|----------|---------------------|
| minimal | true |
| full | false |

## Execution Steps

### Step 1: Enqueue the URL

```bash
npx convex run scrapeQueue/mutations:enqueue '{
  "url": "<URL>",
  "type": "<book|series|author>",
  "scrapeFullSeries": <true|false>,
  "skipSeriesLink": <true|false|undefined>,
  "skipAuthorDiscovery": <true|false|undefined>,
  "skipBookDiscoveries": <true|false|undefined>
}'
```

### Step 2: Run Worker Until Idle

```bash
bun worker --until-idle=1
```

This runs the worker and exits after 1 consecutive idle poll (when all work is done).

Wait for the command to complete. The worker will:
1. Process the queued URL
2. Process any cascaded discoveries (based on strategy)
3. Print a final summary and exit

### Step 3: Assess Results

After the worker exits:

1. **Read worker-logs.txt** for processing details:
   - Look for SUCCESS/FAILED status on each item
   - Note any errors or warnings

2. **Query database** for final counts using Convex MCP:
   ```
   CallMcpTool: user-convex / runOneoffQuery
   Query: "Select count from books, series, authors"
   ```

3. **Report to user**:
   - What was created (X books, Y series, Z authors)
   - Any failures or issues
   - Links to view the content (if applicable)

## Example Usage

### Example 1: Full series scrape (default)

User: `/scrape https://amazon.com/dp/B08911B14Q`

1. Detect: Series URL (B-prefix ASIN)
2. Strategy: full (default)
3. Enqueue: `type: "series", scrapeFullSeries: true`
4. Run: `bun worker --until-idle=1`
5. Report: "Created 1 series with 4 books"

### Example 2: Book only

User: `/scrape only this book https://amazon.com/dp/0062990470`

1. Detect: Book URL (numeric ASIN)
2. Strategy: minimal ("only")
3. Enqueue: `type: "book", skipSeriesLink: true, skipAuthorDiscovery: true`
4. Run: `bun worker --until-idle=1`
5. Report: "Created 1 book (no series/author discovery)"

### Example 3: Series metadata only

User: `/scrape just the series info, don't scrape books https://amazon.com/dp/B08911B14Q`

1. Detect: Series URL
2. Strategy: minimal ("just", "don't scrape books")
3. Enqueue: `type: "series", scrapeFullSeries: false, skipBookDiscoveries: true`
4. Run: `bun worker --until-idle=1`
5. Report: "Created 1 series (books not scraped)"

### Example 4: Author with book discovery

User: `/scrape this author completely https://amazon.com/stores/author/B000APNG74`

1. Detect: Author URL
2. Strategy: full ("completely")
3. Enqueue: `type: "author"`
4. Run: `bun worker --until-idle=1`
5. Report: "Created 1 author, discovered 12 books"

## Error Handling

- **Invalid URL**: Ask user to provide a valid Amazon URL
- **Worker timeout**: Check if Chrome is running (`bun run google`)
- **Scrape failures**: Check worker-logs.txt for error details
- **Already exists**: Report that entity already exists (queue deduplicates)

## Key Files

| File | Purpose |
|------|---------|
| `convex/scrapeQueue/mutations.ts` | enqueue mutation |
| `scripts/worker/index.ts` | Worker with --until-idle flag |
| `worker-logs.txt` | Processing logs |
| `convex/scrapeQueue/queries.ts` | Queue status queries |

## Notes

- The worker must have Chrome running with remote debugging (`bun run google`)
- Worker logs are written to `worker-logs.txt` in project root
- Use the `inspect-worker-logs` skill for detailed log analysis
- Use the `debug-scraping` skill if something went wrong during scraping
