# Dreambooks v2

A web portal for discovering and exploring children's books. The platform highlights beautiful book covers and provides multiple ways to browse content (by series, author, awards, lexile reading level, etc.).

## What is Dreambooks?

Dreambooks is designed to help parents, educators, and young readers discover quality children's literature. The platform emphasizes visual discovery through high-quality book covers and offers rich metadata for filtering and exploration.

### Key Features

- **Visual Discovery**: Beautiful book cover galleries optimized for browsing
- **Rich Metadata**: Browse by series, author, awards, lexile reading level, age range, and more
- **Comprehensive Catalog**: Scraped book data from multiple sources (primarily Amazon)
- **Static Performance**: Most pages are statically generated with ISR for fast load times
- **Real-time Updates**: Dynamic sections use Convex for real-time data updates

## Tech Stack

- **Frontend**: Next.js 15 with App Router, Tailwind v4, shadcn/ui
- **Backend**: Convex (database, serverless functions, file storage)
- **Scraping**: Firecrawl Agent for book data extraction

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Set up Convex

Run the Convex development server (this will prompt you to create a new project):

```bash
npx convex dev
```

This will:
- Create a Convex project (or connect to an existing one)
- Generate the `convex/_generated` types
- Start syncing your functions

### 3. Set up environment variables

Create a `.env.local` file with:

```bash
# Convex deployment URL (automatically set by `npx convex dev`)
# NEXT_PUBLIC_CONVEX_URL is for Next.js client-side
# CONVEX_URL is for server-side scripts
NEXT_PUBLIC_CONVEX_URL=https://your-project.convex.cloud
CONVEX_URL=https://your-project.convex.cloud

# Firecrawl API key (get from https://firecrawl.dev)
FIRECRAWL_API_KEY=fc-your-api-key

# Optional: API key for import scripts
SCRAPE_IMPORT_KEY=your-api-key-here
```

**Note**: If you see a warning about multiple `CONVEX_URL` variables, that's expected. Both `NEXT_PUBLIC_CONVEX_URL` (for client) and `CONVEX_URL` (for scripts) are needed, and Convex won't auto-update them when both are present. This is harmless.

### 4. Start the development servers

Run each server in a separate terminal tab in Cursor:

**Terminal 1 (Convex):**
```bash
# Option 1: Using bun
bun run dev:convex

# Option 2: Using make
make dev:convex

# Option 3: Direct command
npx convex dev
```

**Terminal 2 (Next.js):**
```bash
# Option 1: Using bun
bun run dev:next

# Option 2: Using make
make dev:next

# Option 3: Direct command
npm run dev
```

**Or run both in one terminal** (if you prefer):
```bash
bun run dev:all
# or
make dev  # (shows instructions)
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Project Structure

```
├── app/                          # Next.js App Router
│   ├── layout.tsx               # Root layout with ConvexProvider
│   ├── page.tsx                 # Book list + URL submit form
│   └── books/[id]/page.tsx      # Book detail page
├── convex/
│   ├── schema.ts                # Database schema
│   ├── books/                   # Book queries and mutations
│   │   ├── queries.ts
│   │   └── mutations.ts
│   └── scraping/                # Scraping pipeline
│       ├── crawlBook.ts         # Main orchestrator
│       ├── scrapeRuns.ts        # Tracking
│       ├── downloadCover.ts     # Cover handling
│       └── adapters/firecrawl.ts
├── components/
│   ├── ui/                      # shadcn components
│   └── books/                   # Book components
└── lib/
    ├── utils.ts                 # shadcn cn() utility
    └── types/book.ts            # Shared types
```

## Testing the Scraping Flow

### Via the UI

1. Start both servers (`npx convex dev` and `npm run dev`)
2. Go to http://localhost:3000
3. Paste an Amazon book URL (e.g., `https://www.amazon.com/dp/B0XXXXXXXX`)
4. Click "Add Book"
5. Watch the book appear in the list as it's scraped

### Via CLI

```bash
npx convex run scraping/crawlBook:crawlBook '{"url": "https://www.amazon.com/dp/B0XXXXXXXX"}'
```

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed architectural decisions and patterns.
