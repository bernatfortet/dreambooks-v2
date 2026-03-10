---
name: add-book
description: Add a new book to Dreambooks. Use when user wants to add a book by URL (Amazon) or by name/title. Handles scraping, data verification, and database insertion.
---

# Add Book Skill

This skill guides you through adding a new book to the Dreambooks database.

## When to Use

- User asks to "add a book", "import a book", or "scrape a book"
- User provides an Amazon book URL
- User provides a book title/name to search for
- User wants to populate book data from an external source

## Input Types

1. **Amazon URL**: Direct URL to an Amazon book page (e.g., `https://www.amazon.com/dp/ASIN`)
2. **Book Name/Title**: Text search that requires finding the book first

## Execution Mode

- If the user explicitly says `crawlee`, use the Crawlee flow.
- Otherwise, default to browser automation with `agent-browser`.
- Treat `crawlee` as an execution hint, not part of the book title.

## Workflow

### Step 1: Input Resolution

**If URL provided:**

- Validate it's an Amazon URL (contains `amazon.com` and `/dp/` or product path)
- Extract ASIN if possible using `extractAsin()` from `convex/scraping/adapters/amazon/url.ts`

**If name provided (TODO - v1):**

- Search Amazon for the book
- Default path: use `agent-browser` to resolve the best Amazon product URL
- Prefer canonical product URLs containing `/dp/`
- If there are multiple plausible matches, present the top options to the user for confirmation
- Get the resolved Amazon URL from the selected result

### Step 2: Check for Duplicates

Before scraping, check if book already exists:

- Query `internal.books.queries.findByAsin` with extracted ASIN
- If exists, inform user and ask if they want to update/rescrape

### Step 3: Scrape Book Data

Use the existing crawlBook action:

```typescript
// Via Convex action
await context.runAction(api.scraping.crawlBook.crawlBook, {
  url: amazonUrl,
  adapter: 'amazon', // default
})
```

This action:

1. Creates a `bookScrapeRun` for traceability
2. Calls Amazon adapter to extract book data (title, authors, ISBN, description, cover, etc.)
3. Upserts book to database via `internal.books.mutations.upsertFromScrape`
4. Links to series if series info found
5. Schedules cover image download

### Step 4: Data Verification (TODO - v1)

Future enhancement: Use fast/cheap AI model to verify extracted data:

- Validate title doesn't contain series info
- Check description is clean (no marketing fluff)
- Verify author names are properly formatted
- Confirm reading level data is accurate

### Step 5: Confirmation

Report back to user:

- Book title and authors
- Whether it was a new book or update
- Series linkage if applicable
- Cover download status

## Key Files

| File                                      | Purpose                                        |
| ----------------------------------------- | ---------------------------------------------- |
| `convex/scraping/crawlBook.ts`            | Main entry point - orchestrates book crawling  |
| `convex/scraping/adapters/amazon/book.ts` | Amazon-specific extraction logic               |
| `convex/scraping/adapters/amazon/url.ts`  | URL parsing and ASIN extraction                |
| `convex/books/mutations.ts`               | Database mutations for upserting books         |
| `convex/scraping/downloadCover.ts`        | Cover image download and storage               |
| `lib/scraping/domains/book/types.ts`      | BookData type definition and extraction schema |

## Database Schema

Books are stored in the `books` table with fields:

- Core: `title`, `subtitle`, `authors`
- Identifiers: `isbn10`, `isbn13`, `asin`, `amazonUrl`
- Series: `seriesId`, `seriesName`, `seriesUrl`, `seriesPosition`
- Details: `publisher`, `publishedDate`, `pageCount`, `description`
- Cover: `coverStorageId`, `coverSourceUrl`, `coverBlurHash`
- Reading level: `lexileScore`, `ageRange`, `gradeLevel`
- Meta: `source`, `scrapeStatus`, `coverStatus`, `scrapedAt`

## Error Handling

Common errors to handle:

- Invalid URL format → Ask user to provide Amazon URL
- Missing required fields → Report what's missing, may need manual entry
- Network/scraping failure → Check scrape run status, retry if appropriate
- Duplicate detection → Offer to update existing or skip

## Future Enhancements (v1+)

- [ ] Search by book name (Amazon search integration)
- [ ] AI verification of extracted data
- [ ] Support for additional sources (OpenLibrary, Google Books)
- [ ] Batch import from CSV/list
- [ ] Manual data entry fallback
