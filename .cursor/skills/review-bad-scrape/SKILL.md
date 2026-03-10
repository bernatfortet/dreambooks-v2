---
name: review-bad-scrape
description: Review entities flagged as bad scrapes, diagnose whether the issue is parsing, saving, or follow-up processing, and choose the safest repair path. Use when the user asks to review a bad scrape, investigate a flagged book/series/author, or decide whether to re-scrape.
---

# Review Bad Scrape

Use this workflow to investigate a flagged `book`, `series`, or `author` without defaulting to a blind re-scrape.

## Default Policy

- Treat `bad scrape` as a triage flag, not an automatic retry.
- Prefer the smallest repair that fixes the issue.
- For cover-only issues, prefer cover-specific repair before a full re-scrape.
- Use the queue system for refreshes. Do not create one-off scraping scripts.

## Workflow

### 1. Start from the flagged entity

Collect:
- entity type: `book` | `series` | `author`
- entity id
- source URL
- bad scrape notes
- the exact symptom the user sees

If the symptom is vague, restate it as a concrete field-level problem first.

### 2. Inspect current state

For books:

```bash
bun scripts/debug.ts inspect book <bookId>
```

Or by ASIN:

```bash
bun scripts/debug.ts inspect book --asin <ASIN>
```

For series:

```bash
bun scripts/debug.ts inspect series <seriesId>
```

For authors:
- There is no dedicated inspect CLI yet.
- Read the current author data from the app/admin surfaces and use worker logs plus source URL to decide whether a re-scrape is justified.

### 3. Classify the failure

Use this decision table:

- Artifact missing the field too: parsing/extraction issue
- Artifact has the field, entity is missing it: save/mutation issue
- Entity has source data but derived asset is missing: follow-up processing issue
- Only cover/image is wrong: try targeted cover/image repair first
- Data is already correct: clear the bad flag without re-scraping

## Deep Debugging

If selector drift is likely, use the existing debug workflow:

### Offline parse saved HTML

```bash
bun scripts/debug.ts parse book <html-file>
bun scripts/debug.ts parse series <html-file>
```

### Live dry-run scrape

```bash
bun scripts/debug.ts scrape book <url>
bun scripts/debug.ts scrape series <url>
```

Use `.cursor/debug-html/` artifacts when available so you can separate parsing bugs from network/runtime issues.

## Safe Repair Paths

### Cover-only issue

- Prefer a cover-specific admin action first.
- Only queue a full entity re-scrape if the saved source data is also wrong or missing.

### Focused re-scrape

Use the existing queue mutation with the smallest blast radius:

```bash
bunx convex run scrapeQueue/mutations:queueRescrape '{
  "entityType": "book",
  "entityId": "<id>",
  "skipAuthorDiscovery": true,
  "skipSeriesLink": true,
  "skipCoverDownload": true
}'
```

Adjust flags by entity type:
- `book`: `skipSeriesLink`, `skipAuthorDiscovery`, `skipCoverDownload`
- `series`: `skipBookDiscoveries`, `skipCoverDownload`
- `author`: `skipBookDiscoveries`, `skipCoverDownload`

### Run the worker

```bash
bun worker --until-idle=1
```

Then inspect `worker-logs.txt` and confirm whether the queued item completed successfully.

## Verification

After any repair:

1. Re-check the entity data
2. Confirm the user-visible symptom is fixed
3. Clear the bad flag only after verification

## Related Skills

- Use `debug-scraping` for detailed inspect/parse/scrape triage
- Use `inspect-worker-logs` to review recent worker output
- Use `scrape` when the user explicitly wants a new scrape/import flow
