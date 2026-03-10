---
name: inspect-worker-logs
description: Inspect recent worker processing logs. Use when user asks about recent scrapes, worker activity, or wants to see what items were processed.
---

# Inspect Worker Logs Skill

Quick access to the last 20 items processed by the worker.

## When to Use

- User asks "what did the worker just do?"
- User wants to see recent scraping activity
- Debugging why a recent item failed
- Checking worker output without scrolling terminal

## Usage

The log file can be large (up to 20 items). Read strategically:

### Quick Summary (last few items)

Read only the end of the file to see the most recent items:

```
Read worker-logs.txt with offset from end
```

### Search for Specific Items

Use Grep to find specific books, series, or failures:

```
Grep "FAILED" in worker-logs.txt
Grep "ASIN_HERE" in worker-logs.txt
Grep "SERIES:" in worker-logs.txt
```

### Full Log

Only read the entire file if the user explicitly asks for all logs:

```
Read worker-logs.txt
```

## Log Format

Each entry contains:

- Item number (e.g., [15/20], oldest to newest)
- Type: BOOK, SERIES, AUTHOR, or ENRICHMENT
- URL that was processed
- Timestamp and duration
- SUCCESS or FAILED status
- Full console output from processing

## Example Output

```
============================================================
[18/20] BOOK: https://amazon.com/dp/1234567890
Time: 2026-01-19T18:30:00.000Z | Duration: 12.3s | SUCCESS
============================================================
[2026-01-19T18:30:00.123Z] ────────────────────────────────────────────────────────────
[2026-01-19T18:30:00.124Z] 📖 Processing book: https://amazon.com/dp/1234567890
[2026-01-19T18:30:00.125Z] ────────────────────────────────────────────────────────────
[2026-01-19T18:30:02.456Z]    ✅ Parsed: The Great Book
[2026-01-19T18:30:02.457Z]    Authors: John Doe
[2026-01-19T18:30:12.789Z]    ✅ Imported: abc123 (new: true)
...
```

## Processing Strategies

When the user asks about worker logs:

1. **"What just happened?"** - Read the last ~200 lines to see recent items
2. **"Show me failures"** - Grep for "FAILED" first
3. **"Find book X"** - Grep for the ASIN or title
4. **"Show all activity"** - Read the full file (warn user it may be long)

## Combining with Debug Skill

If an item failed, use the debug-scraping skill for deeper investigation:

```bash
bun scripts/debug.ts inspect book --asin 1234567890
```

## Notes

- The log file is located at `worker-logs.txt` in the project root
- The last 20 items are kept (rolling buffer)
- Logs are written after each item completes
- If the worker hasn't processed anything yet, the file won't exist
