---
name: add-author
description: Add a new author to Dreambooks. Use when user wants to add an author by URL (Amazon) or by name. Handles scraping author profile and discovering their books.
---

# Add Author Skill

This skill guides you through adding a new author to the Dreambooks database.

> **Note**: Author scraping infrastructure is partially implemented. The types exist but the full pipeline needs to be built following the book/series patterns.

## When to Use

- User asks to "add an author", "import an author", or "scrape an author"
- User provides an Amazon author page URL
- User provides an author name to search for
- User wants to discover all books by an author

## Input Types

1. **Amazon Author URL**: Direct URL to an Amazon author page (e.g., `https://www.amazon.com/stores/author/AUTHORID`)
2. **Author Name**: Text search that requires finding the author first (TODO)

## Current State

### What Exists

- Type definitions: `lib/scraping/domains/author/types.ts`
  - `AuthorData`: name, bio, imageUrl, amazonAuthorId, books
  - `AuthorBookEntry`: title, asin, coverImageUrl

### What Needs to Be Built

- [ ] Database table for authors in `convex/schema.ts`
- [ ] Amazon adapter for author pages: `convex/scraping/adapters/amazon/author.ts`
- [ ] Author scrape function: `lib/scraping/domains/author/scrape.ts`
- [ ] Author parse function: `lib/scraping/domains/author/parse.ts`
- [ ] Convex action: `convex/scraping/scrapeAuthor.ts`
- [ ] Convex mutations: `convex/authors/mutations.ts`
- [ ] Convex queries: `convex/authors/queries.ts`

## Proposed Workflow

### Step 1: Input Resolution

**If URL provided:**
- Validate it's an Amazon author URL
- Extract author ID from URL

**If name provided (TODO):**
- Search Amazon for the author
- Present options to user for confirmation
- Get URL from selected result

### Step 2: Check for Duplicates

Before scraping, check if author already exists:
- Query by amazonAuthorId
- If exists, ask user if they want to rescrape/refresh

### Step 3: Scrape Author Data

```typescript
// Proposed action (to be implemented)
await context.runAction(api.scraping.scrapeAuthor.scrapeAuthor, {
  url: amazonAuthorUrl,
})
```

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
- Match discovered books against existing books in DB (by ASIN)
- Update book records to link to author
- Create discoveries for books not yet in DB

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

## Key Files (Existing)

| File | Purpose |
|------|---------|
| `lib/scraping/domains/author/types.ts` | AuthorData type definition |
| `lib/scraping/domains/author/index.ts` | Exports (currently just types) |

## Key Files (To Create)

| File | Purpose |
|------|---------|
| `convex/scraping/adapters/amazon/author.ts` | Amazon author page extraction |
| `convex/scraping/scrapeAuthor.ts` | Main orchestrator action |
| `convex/authors/mutations.ts` | Database mutations |
| `convex/authors/queries.ts` | Database queries |
| `lib/scraping/domains/author/scrape.ts` | Scraping logic |
| `lib/scraping/domains/author/parse.ts` | Parsing logic |

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

- [ ] Complete scraping infrastructure
- [ ] Search by author name
- [ ] AI verification of author data
- [ ] Profile image download
- [ ] Link authors to existing books
- [ ] Author page on frontend
- [ ] Author statistics (book count, average rating, etc.)
