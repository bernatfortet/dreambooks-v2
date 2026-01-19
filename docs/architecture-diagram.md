# Scraping Architecture: Agent Browser + Worker System

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              DREAMBOOKS SCRAPING SYSTEM                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   ┌─────────────────┐         ┌─────────────────────────────────────────────┐   │
│   │   Admin UI      │         │              CONVEX (Cloud)                  │   │
│   │   /ad/ page     │         │                                              │   │
│   │                 │         │  ┌───────────────────────────────────────┐   │   │
│   │  ┌───────────┐  │ enqueue │  │           scrapeQueue                 │   │   │
│   │  │ Submit    │──┼─────────┼─▶│  • pending items                      │   │   │
│   │  │ URL Form  │  │         │  │  • status tracking                    │   │   │
│   │  └───────────┘  │         │  │  • priority ordering                  │   │   │
│   │                 │◀────────┼──│  • deduplication                      │   │   │
│   │  ┌───────────┐  │  stats  │  └───────────────────────────────────────┘   │   │
│   │  │ Queue     │  │         │                                              │   │
│   │  │ Status    │  │         │  ┌───────────────────────────────────────┐   │   │
│   │  └───────────┘  │         │  │      books / series / authors         │   │   │
│   │                 │         │  │  • scraped data storage               │   │   │
│   └─────────────────┘         │  │  • enrichment status tracking         │   │   │
│                               │  │  • series scrape status               │   │   │
│                               │  └───────────────────────────────────────┘   │   │
│                               │                                              │   │
│                               └────────────────┬────────────────────────────┘   │
│                                                │                                 │
│                           ┌────────────────────┼────────────────────┐            │
│                           │                    │                    │            │
│                           │ poll for work      │ save results       │            │
│                           │ (HTTP queries)     │ (HTTP mutations)   │            │
│                           ▼                    ▼                    │            │
│   ┌──────────────────────────────────────────────────────────────────────────┐  │
│   │                      LOCAL WORKER (scripts/worker/)                       │  │
│   │                                                                           │  │
│   │   ┌─────────────────────────────────────────────────────────────────┐    │  │
│   │   │                      MAIN LOOP (30s poll)                        │    │  │
│   │   │                                                                  │    │  │
│   │   │   Priority 1: processQueueFlow()     ─── new URLs from UI       │    │  │
│   │   │   Priority 2: processEnrichmentFlow() ─── books needing details │    │  │
│   │   │   Priority 3: processSeriesDiscoveryFlow() ─── find series URLs │    │  │
│   │   │   Priority 4: processSeriesScrapingFlow() ─── scrape full series│    │  │
│   │   │                                                                  │    │  │
│   │   └─────────────────────────────────────────────────────────────────┘    │  │
│   │                               │                                           │  │
│   │                               │ uses                                      │  │
│   │                               ▼                                           │  │
│   │   ┌─────────────────────────────────────────────────────────────────┐    │  │
│   │   │                      PAGE MANAGER                                │    │  │
│   │   │                                                                  │    │  │
│   │   │   • Manages browser connection                                   │    │  │
│   │   │   • Auto-reconnects if tab closed                                │    │  │
│   │   │   • Health checks before each action                             │    │  │
│   │   │   • Human-like delays between actions                            │    │  │
│   │   │                                                                  │    │  │
│   │   └─────────────────────────────────────────────────────────────────┘    │  │
│   │                               │                                           │  │
│   └───────────────────────────────┼───────────────────────────────────────────┘  │
│                                   │                                              │
│                                   │ CDP (Chrome DevTools Protocol)               │
│                                   │ localhost:9222                               │
│                                   ▼                                              │
│   ┌──────────────────────────────────────────────────────────────────────────┐  │
│   │                   AGENT BROWSER (User's Chrome)                           │  │
│   │                                                                           │  │
│   │   Chrome started with: --remote-debugging-port=9222                       │  │
│   │                                                                           │  │
│   │   ┌─────────────────────────────────────────────────────────────────┐    │  │
│   │   │   BENEFITS:                                                      │    │  │
│   │   │   • Uses your existing login sessions & cookies                  │    │  │
│   │   │   • Browser fingerprint matches real user                        │    │  │
│   │   │   • No headless detection issues                                 │    │  │
│   │   │   • Can manually solve CAPTCHAs when needed                      │    │  │
│   │   │   • Human-like scrolling & timing built in                       │    │  │
│   │   └─────────────────────────────────────────────────────────────────┘    │  │
│   │                                                                           │  │
│   │   ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐         │  │
│   │   │ Tab 1      │  │ Tab 2      │  │ Worker Tab │  │ Tab N      │         │  │
│   │   │ (your      │  │ (your      │  │ (scraping) │  │ (your      │         │  │
│   │   │ browsing)  │  │ browsing)  │  │            │  │ browsing)  │         │  │
│   │   └────────────┘  └────────────┘  └────────────┘  └────────────┘         │  │
│   │                                                                           │  │
│   └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Data Flow: Processing a Book URL

```
                           User pastes Amazon book URL
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                               1. ENQUEUE                                          │
│                                                                                   │
│   Admin UI ──▶ BookSubmitForm ──▶ detectUrlType() ──▶ enqueue mutation           │
│                                      │                                            │
│                                      ▼                                            │
│                               scrapeQueue table                                   │
│                          {url, type:'book', status:'pending'}                     │
└──────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │  Worker polls every 30s
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                               2. FETCH WORK                                       │
│                                                                                   │
│   Worker ──▶ fetchPendingQueueItems() ──▶ Convex query                           │
│                                                                                   │
│   Returns: [{_id, url, type:'book', priority, ...}]                              │
└──────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                               3. MARK PROCESSING                                  │
│                                                                                   │
│   Worker ──▶ markQueueItemProcessing() ──▶ status = 'processing'                 │
└──────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                               4. SCRAPE PAGE                                      │
│                                                                                   │
│   ┌────────────────────────────────────────────────────────────────────────┐     │
│   │  PageManager.getPage()                                                  │     │
│   │      │                                                                  │     │
│   │      ▼                                                                  │     │
│   │  navigateWithRetry(page, bookUrl)                                       │     │
│   │      │                                                                  │     │
│   │      ├── page.goto(url)          ──▶ Amazon book page loads             │     │
│   │      ├── humanDelay(2-4s)        ──▶ Wait like a human                  │     │
│   │      └── simulateHumanBehavior() ──▶ Random scrolls                     │     │
│   │                                                                         │     │
│   │  ensurePreferredFormat(page)     ──▶ Switch to hardcover if available   │     │
│   │                                                                         │     │
│   │  parseBookFromPage(page)                                                │     │
│   │      │                                                                  │     │
│   │      ├── Extract title, authors, ISBN, ASIN                             │     │
│   │      ├── Extract description, page count                                │     │
│   │      ├── Extract series info (name, position, URL)                      │     │
│   │      ├── Extract author Amazon IDs (for linking)                        │     │
│   │      └── Extract cover image URL                                        │     │
│   │                                                                         │     │
│   │  Result: BookData object                                                │     │
│   └────────────────────────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                               5. SAVE TO DATABASE                                 │
│                                                                                   │
│   importBookToConvex(bookData, amazonUrl)                                        │
│       │                                                                           │
│       ├── Insert into 'books' table                                              │
│       ├── Create/link 'bookAuthors' relationships                                │
│       ├── Create/link 'series' if found                                          │
│       └── Return bookId                                                          │
└──────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                               6. DISCOVER & QUEUE                                 │
│                                                                                   │
│   discoverBookLinks(bookData)                                                    │
│       │                                                                           │
│       ├── If series found ──▶ queue series URL (priority: 5)                     │
│       └── If author IDs found ──▶ queue author URLs (priority: 15)               │
│                                                                                   │
│   queueDiscoveries([...])  ──▶ Add to scrapeQueue (deduped)                      │
└──────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                               7. MARK COMPLETE                                    │
│                                                                                   │
│   markQueueItemComplete({queueId, bookId})                                       │
│       │                                                                           │
│       └── status = 'complete', completedAt = now                                 │
└──────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │  Loop continues...
                                      ▼
                        Worker processes next item
                     (discovered series, authors, etc.)
```

## Worker Processing Flows

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           WORKER MAIN LOOP                                       │
│                                                                                  │
│   while (true) {                                                                 │
│       │                                                                          │
│       ▼                                                                          │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │ PRIORITY 1: Queue Processing                                             │   │
│   │                                                                          │   │
│   │   Fetches: scrapeQueue where status='pending', ordered by priority       │   │
│   │   Handles: book/series/author URLs added from Admin UI                   │   │
│   │                                                                          │   │
│   │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │   │
│   │   │ type='book'  │  │type='series' │  │type='author' │                  │   │
│   │   │              │  │              │  │              │                  │   │
│   │   │ Scrape book  │  │ Scrape all   │  │ Link books   │                  │   │
│   │   │ details      │  │ books in     │  │ to author    │                  │   │
│   │   │              │  │ series       │  │              │                  │   │
│   │   └──────────────┘  └──────────────┘  └──────────────┘                  │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│       │                                                                          │
│       ▼                                                                          │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │ PRIORITY 2: Book Enrichment                                              │   │
│   │                                                                          │   │
│   │   Fetches: books where detailsStatus='basic'                             │   │
│   │   Purpose: Fill in missing details (ISBN, description, etc.)             │   │
│   │                                                                          │   │
│   │   • Navigate to book's amazonUrl                                         │   │
│   │   • Extract additional metadata                                          │   │
│   │   • Update book record                                                   │   │
│   │   • Mark detailsStatus='complete'                                        │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│       │                                                                          │
│       ▼                                                                          │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │ PRIORITY 3: Series URL Discovery                                         │   │
│   │                                                                          │   │
│   │   Fetches: series where sourceUrl is NULL                                │   │
│   │   Purpose: Find the Amazon series page URL                               │   │
│   │                                                                          │   │
│   │   • Get a book that belongs to the series                                │   │
│   │   • Navigate to that book's page                                         │   │
│   │   • Extract the series link from the book page                           │   │
│   │   • Update series.sourceUrl                                              │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│       │                                                                          │
│       ▼                                                                          │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │ PRIORITY 4: Series Scraping                                              │   │
│   │                                                                          │   │
│   │   Fetches: series where scrapeStatus='pending' OR 'partial'              │   │
│   │   Purpose: Scrape all books in a series                                  │   │
│   │                                                                          │   │
│   │   • Navigate to series page (sourceUrl or nextPageUrl)                   │   │
│   │   • Parse all books listed                                               │   │
│   │   • Handle pagination (save nextPageUrl, mark 'partial')                 │   │
│   │   • Import books to database                                             │   │
│   │   • Mark series 'complete' when all pages done                           │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│       │                                                                          │
│       ▼                                                                          │
│   sleep(30s if work done, 60s if idle)                                          │
│       │                                                                          │
│       └───────────────────────────▶ loop                                         │
│   }                                                                              │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Key Components

### Agent Browser Provider (`lib/scraping/providers/agent-browser/`)

```
┌────────────────────────────────────────────────────────────────┐
│                     agent-browser/browser.ts                    │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  connectToBrowser()                                             │
│    • Connects to Chrome via CDP (localhost:9222)                │
│    • Gets existing browser context (with your cookies!)         │
│    • Returns {browser, context, page}                           │
│                                                                 │
│  withCdpBrowser({ action })                                     │
│    • Execute action on existing page                            │
│    • Keeps browser running after                                │
│                                                                 │
│  withCdpNewTab({ action })                                      │
│    • Creates new tab for action                                 │
│    • Closes tab when done, keeps browser                        │
│                                                                 │
│  navigateWithRetry({ page, url })                               │
│    • Retries with exponential backoff                           │
│    • Waits for DOM content loaded                               │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

### Worker Page Manager (`scripts/worker/browser.ts`)

```
┌────────────────────────────────────────────────────────────────┐
│                        PageManager                              │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  initialize()                                                   │
│    • Connect to browser at startup                              │
│    • Create dedicated scraping tab                              │
│                                                                 │
│  getPage()                                                      │
│    • Check if current page is healthy                           │
│    • Auto-reconnect if tab was closed                           │
│    • Return usable page                                         │
│                                                                 │
│  reconnect()                                                    │
│    • Clean up old connection                                    │
│    • Reconnect to browser                                       │
│    • Create new scraping tab                                    │
│                                                                 │
│  navigateWithReconnect({ url })                                 │
│    • Navigate with retry                                        │
│    • If browser closed → reconnect and retry                    │
│                                                                 │
│  simulateHumanBehavior(page)                                    │
│    • Random scrolls                                             │
│    • Random delays                                              │
│    • Occasional scroll-back                                     │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

## Benefits of This Architecture

| Feature | Benefit |
|---------|---------|
| **CDP Connection** | Uses real Chrome with your cookies/session |
| **Non-headless** | Appears as real user, bypasses bot detection |
| **Polling Loop** | Resilient to failures, can pause/resume anytime |
| **Priority Queue** | Most important work done first |
| **Auto-reconnect** | Worker survives tab closes, browser restarts |
| **Human delays** | Realistic timing prevents rate limiting |
| **Discovery system** | Automatically finds related content |
| **Convex as Queue** | Durable, real-time visibility into progress |
| **Local worker** | No server costs, runs on your machine |

## Starting the System

```bash
# Terminal 1: Start Chrome with remote debugging
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222

# Terminal 2: Start the worker
bunx tsx scripts/worker/index.ts

# Options:
#   --dry-run           Don't save changes
#   --poll-interval=60  Seconds between polls
```

Then open `/ad/` in your browser to add URLs to the queue.
