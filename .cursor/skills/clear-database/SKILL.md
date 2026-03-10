---
name: clear-database
description: Clear the database for testing scraping systems. Deletes all books, series, authors, scrape queue, and storage files while preserving awards. Use when resetting the database during testing or development.
---

# Clear Database Skill

Clears all database tables and storage files except awards, useful for testing scraping systems and resetting the database.

## When to Use

- User wants to clear the database for testing
- User says "clear db", "reset database", "wipe database", or similar
- Testing scraping systems and need a clean slate
- Development/testing scenarios where you need to start fresh

## What Gets Deleted

The following tables and data are **deleted**:

- **Books**: All book records
- **Series**: All series records
- **Authors**: All author records
- **Book Authors**: Join table linking books to authors
- **Book Awards**: Join table linking books to awards
- **Scrape Queue**: All pending/processing queue items
- **Scrape Artifacts**: Historical scrape data
- **Book Scrape Runs**: Scraping run history
- **Series Scrape Runs**: Series scraping run history
- **Storage Files**: Book covers, series covers, and author images

## What Gets Preserved

- **Awards**: The awards table is preserved (award definitions remain)

## Requirements

- `CONVEX_URL` environment variable must be set
- Access to the Convex deployment

## Execution Steps

### Step 1: Run the Clear Script

Run the existing script located at `scripts/clear-database.ts`:

```bash
bun scripts/clear-database.ts
```

The script will:
1. Connect to Convex using `CONVEX_URL`
2. Call `api.admin.clearDatabase.clearAllExceptAwards`
3. Delete storage files first (book covers, series covers, author images)
4. Delete database tables in order (join tables first, then main entities, then scrape data)
5. Display a summary of what was deleted

### Step 2: Review Output

The script outputs a detailed summary:

```
✅ Database clear complete!

Deleted:
  - Book Awards: X
  - Book Authors: X
  - Books: X
  - Series: X
  - Authors: X
  - Scrape Queue: X
  - Scrape Artifacts: X
  - Book Scrape Runs: X
  - Series Scrape Runs: X

Storage files deleted:
  - Book Covers: X
  - Series Covers: X
  - Author Images: X

Awards table preserved.
```

## Safety Warnings

**Destructive operation**: This permanently deletes all books, series, authors, and related data.

- **Cannot be undone**: Once deleted, data cannot be recovered
- **Awards preserved**: Only the awards table is kept
- **Storage files deleted**: All cover images and author photos are removed
- **Use with caution**: Only run against development/testing deployments

## Example Usage

### Example 1: Clear database for testing

User: "clear the database"

1. Run: `bun scripts/clear-database.ts`
2. Wait for completion
3. Report: "Database cleared. Deleted X books, Y series, Z authors. Awards preserved."

### Example 2: Reset before testing scraping

User: "reset the db so I can test scraping"

1. Run: `bun scripts/clear-database.ts`
2. Wait for completion
3. Report: "Database reset complete. Ready for new scraping tests."

## Error Handling

- **Missing CONVEX_URL**: Script will exit with error message
- **Connection errors**: Check Convex deployment status
- **Partial failures**: Script logs which batches failed but continues

## Key Files

| File | Purpose |
|------|---------|
| `scripts/clear-database.ts` | Main script that performs the clear operation |
| `convex/admin/clearDatabase.ts` | Convex action `clearAllExceptAwards` that does the actual deletion |

## Notes

- The script uses batched deletions to avoid timeouts on large databases
- Storage files are deleted before database records to avoid orphaned references
- The operation may take several minutes for large databases
- Awards are preserved to maintain award definitions for future use
