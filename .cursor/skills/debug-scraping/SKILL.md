---
name: debug-scraping
description: Debug and diagnose scraping issues. Use when user reports missing data, wrong values, or asks to inspect scraped entities. Provides systematic workflow using inspect, parse, and scrape CLI commands.
---

# Debug Scraping Skill

This skill guides you through diagnosing and fixing scraping issues using the debug CLI toolkit.

## When to Use

- User reports scraping issues (e.g., "covers aren't saving", "series data is wrong")
- User asks to "debug", "inspect", or "check" a scraped entity
- Need to verify what data was extracted vs what was saved
- Selectors may have broken due to Amazon page changes

## Available Tools

### 1. Inspect Command

Query Convex for current entity state plus scrape artifacts:

```bash
# Inspect a series by ID
bun scripts/debug.ts inspect series <seriesId>

# Inspect a book by ID
bun scripts/debug.ts inspect book <bookId>

# Inspect a book by ASIN
bun scripts/debug.ts inspect book --asin <ASIN>
```

**Output includes:**
- Key fields (name/title, coverSourceUrl, coverStorageId, coverUrl, status)
- Recent scrape runs with extracted data
- Recent artifacts with parsed payloads
- Full JSON dump for detailed inspection

### 2. Parse Command

Test selectors on saved HTML files (offline, no network):

```bash
# Parse a saved series HTML
bun scripts/debug.ts parse series <html-file>

# Parse a saved book HTML
bun scripts/debug.ts parse book <html-file>
```

HTML files are saved to `.cursor/debug-html/` during scraping when `SCRAPING_CONFIG.debug.dumpHtml` is enabled.

### 3. Scrape Command

Dry-run scrape without saving to database:

```bash
# Dry-run series scrape
bun scripts/debug.ts scrape series <url>

# Dry-run book scrape
bun scripts/debug.ts scrape book <url>
```

## Diagnostic Workflow

Follow this systematic approach when debugging:

### Step 1: Identify the Symptom

Ask: What specific field is missing or wrong?
- Cover not showing? → Check `coverSourceUrl`, `coverStorageId`, `coverUrl`
- Title/name wrong? → Check entity vs artifact payload
- Books missing from series? → Check `discoveredBookCount` vs `scrapedBookCount`

### Step 2: Inspect the Entity

Run the inspect command to see current state:

```bash
bun scripts/debug.ts inspect series <id>
```

Look at the "KEY FIELDS" section first. Common patterns:
- `coverSourceUrl: NULL` → Extraction failed (selector issue)
- `coverSourceUrl: <url>` but `coverStorageId: NULL` → Download failed
- Both set but `coverUrl: NULL` → Storage URL resolution issue

### Step 3: Compare Artifact vs Entity

The `inspect` output shows both:
- **Entity**: What's currently in the database
- **Artifacts**: What was extracted during scraping

If `artifact.payload.coverImageUrl` exists but `entity.coverSourceUrl` is null, the bug is in the mutation (data not being saved).

### Step 4: Test Offline Parsing

If extraction failed, test the selectors on saved HTML:

```bash
bun scripts/debug.ts parse series .cursor/debug-html/<timestamp>_series_<asin>.html
```

If parsing returns null for a field, the selector needs updating. Check:
- `lib/scraping/domains/series/parse.ts` for series selectors
- `lib/scraping/domains/book/parse.ts` for book selectors

### Step 5: Trace the Pipeline

Use the architecture reference at `.cursor/rules/scraping-architecture.mdc` to understand data flow:

```
URL → Scrape (Playwright) → Parse (selectors) → Save (Convex) → Side Effects (cover download)
```

Identify which stage failed and fix accordingly.

## Common Issues

### Cover Not Extracted (coverSourceUrl is null)

**Cause**: Selectors don't match Amazon's current page structure

**Debug**:
```bash
bun scripts/debug.ts parse series <html-file>
```

**Fix**: Update selectors in `parse.ts:extractCoverImage()`

### Cover Extracted But Not Saved

**Cause**: Bug in mutation - field not being passed or saved

**Debug**: Compare artifact payload vs entity in inspect output

**Fix**: Check `saveFromCliScrape` or `updateFromScrape` mutation

### Cover Downloaded But No Storage ID

**Cause**: Download job failed or wasn't scheduled

**Debug**: Check Convex dashboard logs for `downloadSeriesCover` errors

**Fix**: Verify scheduler.runAfter was called, check URL validity

### Scrape Status Stuck on "processing"

**Cause**: Worker crashed or timed out

**Debug**: Check worker logs, look for error messages

**Fix**: Reset status to "pending" via admin panel or mutation

## Key Files Reference

| Domain | File | Purpose |
|--------|------|---------|
| Series | `lib/scraping/domains/series/parse.ts` | Selector extraction |
| Series | `convex/series/mutations.ts` | Database saves |
| Series | `convex/scraping/downloadSeriesCover.ts` | Cover download |
| Book | `lib/scraping/domains/book/parse.ts` | Selector extraction |
| Book | `convex/books/mutations.ts` | Database saves |
| Book | `convex/scraping/downloadCover.ts` | Cover download |
| Debug | `convex/debug/queries.ts` | Inspect queries |
| Debug | `scripts/debug.ts` | CLI entry point |

## Architecture Reference

For detailed data flow diagrams and common failure points, see:
`.cursor/rules/scraping-architecture.mdc`

## Example Debug Session

User reports: "Series covers aren't saving"

```bash
# 1. Inspect the series
bun scripts/debug.ts inspect series jd735x8qbew8898davr9scknkd7z9kxc

# Output shows:
#   coverSourceUrl:  ❌ NULL
#   coverStorageId:  ❌ NULL
# But artifact.payload.coverImageUrl has a URL

# 2. Diagnosis: Data extracted but not saved
# 3. Check mutation: convex/series/mutations.ts:saveFromCliScrape
# 4. Find bug: coverSourceUrl not being passed in patch
# 5. Fix and re-scrape
```
