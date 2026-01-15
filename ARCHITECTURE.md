# Dreambooks v2 - Architecture Decisions

> Last updated: January 2026

## Project Overview

**Dreambooks** is a web portal for discovering and exploring children's books. The platform highlights beautiful book covers and provides multiple ways to browse and organize content.

### Core Goals

1. **Fast page loads** - Pre-rendered static pages via ISR for instant user experience
2. **Beautiful book covers** - First-class image handling with fast CDN delivery
3. **Robust scraping pipeline** - Automated workflows for discovering books, authors, series
4. **Flexible organization** - Browse by series, author, awards, lexile scores, and more

### Key Pages

| Page          | Description                                                   |
| ------------- | ------------------------------------------------------------- |
| Landing       | Portal homepage showcasing featured books and discovery paths |
| Book          | Individual book page with details, cover, related content     |
| All Series    | Browse all book series                                        |
| Series        | Individual series with all books in order                     |
| All Authors   | Top authors, browsable list                                   |
| Author        | Individual author with biography and their books              |
| All Awards    | Children's book awards (Caldecott, Newbery, etc.)             |
| Award         | Award winners filterable by year                              |
| Lexile Browse | Filter books by lexile reading level ranges                   |

---

## Tech Stack Decisions

### Frontend: Next.js

**Decision:** Next.js with App Router

**Rationale:**

- **ISR (Incremental Static Regeneration)** - Native, battle-tested. Book pages rarely change and can be statically generated with long revalidation periods
- **Image Optimization** - `next/image` provides blur placeholders, automatic WebP/AVIF, and CDN caching - perfect for showcasing book covers
- **Partial Prerendering (PPR)** - Static page shell with streaming dynamic sections (e.g., "Related Books")
- **Prefetching** - Links in viewport are automatically prefetched for fluid navigation
- **Mature ecosystem** - Extensive documentation, community support, deployment options

**Alternatives considered:**

- TanStack Start - Excellent type safety but no native ISR support (beta, platform-dependent caching)

### Database & Backend: Convex

**Decision:** Convex as the primary database and backend

**Rationale:**

- **Workflow orchestration** - Built-in scheduled functions and job queue for scraping pipelines. No need for separate Redis/BullMQ
- **Chained actions** - `scheduler.runAfter()` makes it easy to chain: Author → Books → Series → Covers
- **Real-time by default** - Admin dashboard can show live pipeline status
- **Type-safe end-to-end** - Schema-first with TypeScript from database to frontend
- **File storage** - Native storage for book cover images
- **Local development** - `npx convex dev` or `--local` flag for fully local testing

**Alternatives considered:**

- Supabase + Drizzle - Better for complex SQL queries and native ISR fit, but scraping pipeline would require separate queue infrastructure (Inngest, Trigger.dev, etc.)

**ISR with Convex:**
ISR works with Convex via `fetchQuery` from `convex/nextjs`. The Convex HTTP call latency only affects build/revalidation time (background), not user-facing performance. Users always receive cached static HTML from the edge CDN.

```typescript
// Example: Static book page with Convex
import { fetchQuery } from 'convex/nextjs'
import { api } from '@/convex/_generated/api'

export const revalidate = false // Static forever (or 86400 for daily)

export async function generateStaticParams() {
  const books = await fetchQuery(api.books.listAllSlugs)
  return books.map((book) => ({ slug: book.slug }))
}

export default async function BookPage({ params }) {
  const book = await fetchQuery(api.books.getBySlug, { slug: params.slug })
  return <BookDetails book={book} />
}
```

### Authentication: Convex Auth

**Decision:** Convex Auth with Google OAuth + Email magic links

**Rationale:**

- **Free** - No per-user pricing (unlike Clerk at $0.02/MAU)
- **Native integration** - Built into Convex, users stored in Convex database
- **Built on Auth.js** - Proven foundation, familiar patterns
- **Sufficient providers** - Google OAuth and Email (via Resend) cover our needs

**Alternatives considered:**

- Clerk - Excellent DX but expensive at scale ($800/month at 50k users)
- Better Auth - Open source but requires separate hosting and manual JWT integration
- Auth.js standalone - More glue code, two systems to manage

```typescript
// convex/auth.config.ts
import Google from '@auth/core/providers/google'
import Resend from '@auth/core/providers/resend'

export default {
  providers: [Google, Resend({ from: 'hello@dreambooks.club' })],
}
```

### API Layer: None (Convex handles it)

**Decision:** No separate Hono/tRPC layer

**Rationale:**
Convex queries and mutations already provide:

- Type-safe API calls with generated types
- Input validation via `v.string()`, `v.object()`, etc.
- Auth context via `context.auth.getUserIdentity()`
- Real-time subscriptions

Adding Hono/tRPC would duplicate functionality without benefit.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Dreambooks v2                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Next.js App (Vercel or similar)                              │
│   ├── Static pages via ISR (fetchQuery at build/revalidate)    │
│   ├── Client components with real-time (useQuery, useMutation) │
│   ├── Image optimization via next/image                        │
│   └── Convex Auth integration                                  │
│                                                                 │
│   Convex Backend                                               │
│   ├── Database                                                 │
│   │   ├── books, authors, series, awards                       │
│   │   ├── users, sessions (Convex Auth tables)                 │
│   │   └── collections, follows (user data)                     │
│   ├── Queries (public data fetching)                          │
│   ├── Mutations (auth-protected user actions)                  │
│   ├── Actions (external API calls, scraping)                  │
│   ├── Scheduled Functions (pipeline orchestration)            │
│   └── File Storage (book covers)                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Scraping Pipeline Architecture

The scraping system uses Convex's scheduled functions to orchestrate multi-step workflows:

```
┌──────────────────────────────────────────────────────────────────┐
│                    Scraping Pipeline Flow                        │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│   [Trigger: Manual / Schedule / Discovery]                       │
│                    │                                             │
│                    ▼                                             │
│   ┌─────────────────────────┐                                    │
│   │   discoverAuthor        │ ──► Save author (status: pending)  │
│   └─────────────────────────┘                                    │
│                    │                                             │
│         scheduler.runAfter(0)                                    │
│                    ▼                                             │
│   ┌─────────────────────────┐                                    │
│   │   discoverAuthorBooks   │ ──► Save books (status: pending)   │
│   └─────────────────────────┘                                    │
│                    │                                             │
│         scheduler.runAfter(random delay)  ◄── Rate limiting      │
│                    ▼                                             │
│   ┌─────────────────────────┐                                    │
│   │   enrichBook            │ ──► Add lexile, year, cover URL    │
│   └─────────────────────────┘                                    │
│                    │                                             │
│         ┌─────────┴─────────┐                                    │
│         ▼                   ▼                                    │
│   ┌──────────────┐   ┌──────────────┐                            │
│   │ discoverSeries│   │ downloadCover│                           │
│   └──────────────┘   └──────────────┘                            │
│         │                   │                                    │
│         │                   ▼                                    │
│         │           Store in Convex Storage                      │
│         │                                                        │
│         └──► May trigger more discoverAuthor calls (chain)       │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Key Patterns

- **Status tracking** - Each entity has a `status` field to track workflow progress
- **Staggered scheduling** - `scheduler.runAfter(Math.random() * 5000)` to avoid rate limits
- **Automatic retries** - Convex actions retry failed operations automatically
- **Real-time dashboard** - Admin UI subscribes to pipeline status for live updates

---

## Data Model (High-Level)

```typescript
// Core content
books: {
  title, slug, lexileScore, coverStorageId, publishedYear, authorId, seriesId, status
}
authors: {
  name, slug, bio, photoStorageId, status
}
series: {
  name, slug, description, bookCount
}
awards: {
  name, slug, description
}
bookAwards: {
  bookId, awardId, year, type
} // type: winner, honor, etc.

// User data (requires auth)
collections: {
  name, userId, createdAt
}
collectionBooks: {
  collectionId, bookId
}
authorFollows: {
  userId, authorId
}

// Auth (Convex Auth tables)
users, sessions, accounts, verificationTokens
```

---

## Key Technical Patterns

### ISR for Static Pages

```typescript
// Static book page - revalidates daily (or never)
export const revalidate = 86400 // or false for forever

export default async function BookPage({ params }) {
  const book = await fetchQuery(api.books.getBySlug, { slug: params.slug })

  return (
    <div>
      <BookHero book={book} /> {/* Static */}
      <BookDetails book={book} /> {/* Static */}
      <Suspense fallback={<Skeleton />}>
        <RelatedBooks bookId={book._id} /> {/* Streams dynamically */}
      </Suspense>
    </div>
  )
}
```

### Client-Side Real-Time

```tsx
'use client'
import { useQuery } from 'convex/react'

function RelatedBooks({ bookId }) {
  const related = useQuery(api.books.getRelated, { bookId })
  // Updates automatically if data changes
  return <BookGrid books={related} />
}
```

### Protected Mutations

```typescript
export const addToCollection = mutation({
  args: { bookId: v.id('books'), collectionId: v.id('collections') },
  handler: async (context, args) => {
    const userId = await getAuthUserId(context)
    if (!userId) throw new Error('Must be signed in')

    const collection = await context.db.get(args.collectionId)
    if (collection?.userId !== userId) throw new Error('Not your collection')

    await context.db.insert('collectionBooks', {
      collectionId: args.collectionId,
      bookId: args.bookId,
    })
  },
})
```

---

## Open Questions / Future Decisions

### Initial Focus

- [ ] Scraping pipeline first (DB schema, admin tools, data ingestion)
- [ ] Public portal first (landing page, browsing experience)
- [ ] Both in parallel with minimal viable setup

### V1 Component Reuse

- Existing v1 at dreambooks.club has components that could be reused
- Decision pending: start fresh vs. migrate useful components

### Image CDN Strategy

- Option A: Convex file storage (simple, integrated)
- Option B: External CDN (Cloudflare R2, Cloudinary) for more control
- Consider: blur placeholders, multiple sizes, WebP/AVIF optimization

### Deployment

- Vercel (optimized for Next.js, easy Convex integration)
- Other platforms (Cloudflare Pages, Railway, self-hosted)

### Additional Features to Consider

- Search functionality (full-text search for books, authors)
- Reading lists / recommendations
- Age-appropriate filtering
- Publisher pages
- Illustrator pages (important for picture books)

---

## Development Setup

```bash
# Install dependencies
pnpm install

# Start Convex dev server
npx convex dev

# Start Next.js dev server
pnpm dev

# Run scraping pipeline locally
npx convex run scraping/discoverAuthor '{"authorName": "Mo Willems", "source": "test"}'

# View Convex dashboard
# https://dashboard.convex.dev
```

---

## References

- [Next.js ISR Documentation](https://nextjs.org/docs/app/building-your-application/data-fetching/incremental-static-regeneration)
- [Convex Documentation](https://docs.convex.dev)
- [Convex Auth](https://labs.convex.dev/auth)
- [Convex + Next.js Integration](https://docs.convex.dev/client/react/nextjs)
