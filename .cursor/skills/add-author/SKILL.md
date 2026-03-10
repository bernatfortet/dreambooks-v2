---
name: add-author
description: Add a new author to Dreambooks. Use when user wants to add an author by URL (Amazon) or by name. Handles scraping author profile and discovering their books.
---

# Add Author Skill

This skill guides you through adding a new author to the Dreambooks database.

Author import exists and supports local scraping flows. Discovery of additional books/series from an author page may still be limited depending on the chosen execution path.

## When to Use

- User asks to "add an author", "import an author", or "scrape an author"
- User provides an Amazon author page URL
- User provides an author name to search for
- User wants to discover all books by an author

## Input Types

1. **Amazon Author URL**: Direct URL to an Amazon author page (e.g., `https://www.amazon.com/stores/author/AUTHORID`)
2. **Author Name**: Text like `Brian Floca` or `author Brian Floca`

## Execution Mode

- If the user explicitly says `crawlee`, use the Crawlee flow.
- Otherwise, default to browser automation with `agent-browser`.
- Treat `crawlee` as an execution hint, not part of the author name.

## Current State

### What Exists

- Author queue/import pipeline:
  - `scripts/worker/processors/author.ts`
  - `convex/scraping/importAuthor.ts`
  - `convex/authors/mutations.ts`
  - `convex/authors/queries.ts`
- Type definitions and parsing:
  - `lib/scraping/domains/author/types.ts`
  - `lib/scraping/domains/author/parse.ts`
  - `lib/scraping/domains/author/discover.ts`
- Crawlee demo processor:
  - `scripts/crawlee/processors/author.ts`

### Known Limitation

- The worker can import authors from Amazon URLs.
- Automatic queueing of discovered books/series from an author page is currently disabled in the worker, so author scraping primarily creates or refreshes the author and links already-known books.

## Proposed Workflow

### Step 1: Input Resolution

**If URL provided:**
- Validate it's an Amazon author URL
- Extract author ID from URL

**If name provided:**
- Strip helper words like `author`, `add`, `scrape`, and execution hints like `crawlee`
- Search Amazon for the author page first
- Default path: use `agent-browser` to search Amazon and resolve the best author URL
- Good search queries:
  - `Brian Floca Amazon author`
  - `site:amazon.com Brian Floca amazon author`
- Prefer canonical author URLs containing `/e/` or `/stores/author/`
- If there are multiple plausible matches, show the top options and ask the user to confirm
- Once resolved, continue with the Amazon author URL

### Step 2: Check for Duplicates

Before scraping, check if author already exists:
- Query by amazonAuthorId
- If exists, ask user if they want to rescrape/refresh

### Step 3: Scrape Author Data

Default path with browser automation:

1. Use `agent-browser` to locate the author's Amazon page if only a name was provided.
2. Enqueue the resolved Amazon author URL with type `author`.
3. Run the local worker until idle.
4. By default, keep the scrape scoped to that author page and the books directly visible on it.
5. Do not fan out into co-authors, related authors, or series expansion unless the user explicitly asks for a broader crawl.

If the user explicitly says `crawlee`:

1. Resolve the Amazon author URL from name if needed.
2. Run the Crawlee author flow using that URL.
3. Import the resulting author into Convex.

Should extract:
- Author name
- Bio/description
- Profile image URL
- List of books by this author

### Step 4: Data Verification (TODO)

Future enhancement: Use fast/cheap AI model to verify:
- Author name is formatted correctly
- Bio is clean and appropriate
- Books list is accurate

### Step 5: Link Existing Books

After scraping author data:
- Match discovered books against existing books in DB (by ASIN or author match)
- Update book records to link to author
- Do not assume new book discoveries will be queued unless that path is explicitly enabled

### Step 6: Confirmation

Report back to user:
- Author name and bio preview
- Number of books discovered
- How many books already in DB vs need import

## Proposed Database Schema

```typescript
// Add to convex/schema.ts
authors: defineTable({
  // Identity
  name: v.string(),
  
  // Source
  source: v.string(), // 'amazon', 'manual'
  sourceUrl: v.optional(v.string()),
  sourceId: v.optional(v.string()), // amazonAuthorId
  
  // Profile
  bio: v.optional(v.string()),
  imageStorageId: v.optional(v.id('_storage')),
  imageSourceUrl: v.optional(v.string()),
  
  // Status
  scrapeStatus: v.union(
    v.literal('pending'),
    v.literal('complete'),
    v.literal('error'),
  ),
  lastScrapedAt: v.optional(v.number()),
  errorMessage: v.optional(v.string()),
  
  // Meta
  createdAt: v.number(),
})
  .index('by_sourceId', ['sourceId'])
  .index('by_name', ['name'])
  .index('by_scrapeStatus', ['scrapeStatus']),

// Many-to-many relationship (books can have multiple authors)
bookAuthors: defineTable({
  bookId: v.id('books'),
  authorId: v.id('authors'),
  role: v.optional(v.string()), // 'author', 'illustrator', 'translator'
  position: v.optional(v.number()), // Order of authors on book
})
  .index('by_bookId', ['bookId'])
  .index('by_authorId', ['authorId']),
```

## Key Files

| File | Purpose |
|------|---------|
| `scripts/worker/processors/author.ts` | Queue-based author processing |
| `scripts/crawlee/processors/author.ts` | Crawlee author processing |
| `convex/scraping/importAuthor.ts` | Import author into Convex |
| `convex/authors/mutations.ts` | Author upsert logic |
| `convex/bookAuthors/mutations.ts` | Link books to authors |
| `lib/scraping/domains/author/parse.ts` | Parse author page data |
| `lib/scraping/domains/author/discover.ts` | Extract discovered books/series |

## Implementation Guide

When implementing author scraping, follow the patterns established in:

1. **Book scraping pattern**: `convex/scraping/crawlBook.ts`
   - Create scrape run for traceability
   - Call adapter
   - Validate data
   - Upsert to database
   - Schedule follow-up tasks

2. **Series scraping pattern**: `convex/scraping/scrapeSeries.ts`
   - Handle discovery records
   - Track completeness
   - Support pagination (authors may have many books)

## Error Handling

Common errors to handle:
- Invalid URL format → Ask user to provide Amazon author URL
- Author not found → URL may be incorrect
- Scraping failure → Check for rate limiting or page structure changes
- Book linking failures → Handle partial success gracefully

## Future Enhancements (v1+)

- [ ] Re-enable automatic discovery queueing from author pages
- [ ] Improve Amazon author search disambiguation
- [ ] AI verification of author data
- [ ] Author page on frontend
- [ ] Author statistics (book count, average rating, etc.)
