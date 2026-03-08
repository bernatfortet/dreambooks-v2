## Cursor Cloud specific instructions

### Services Overview

| Service | Command | Purpose |
|---------|---------|---------|
| Next.js Dev Server | `bun run dev` | Frontend on `http://localhost:3000` |
| Convex Dev Server | `bunx convex dev` | Backend (requires interactive auth or `CONVEX_DEPLOY_KEY`) |

### Environment Variables

The following secrets must be available (injected via Cursor Secrets):
- `NEXT_PUBLIC_CONVEX_URL` — Convex deployment URL (client-side)
- `CONVEX_URL` — Convex deployment URL (server-side/scripts)
- `CONVEX_DEPLOYMENT` — Convex deployment identifier

A `.env.local` file must exist at the project root with at least `NEXT_PUBLIC_CONVEX_URL` and `CONVEX_URL`. Create it from the environment variables if it doesn't exist:
```bash
echo "NEXT_PUBLIC_CONVEX_URL=$NEXT_PUBLIC_CONVEX_URL" > .env.local
echo "CONVEX_URL=$CONVEX_URL" >> .env.local
```

### Running the App

The Next.js dev server connects to the Convex cloud deployment and does not require a local Convex dev server.

```bash
bun run dev   # Starts Next.js on port 3000
```

### Convex Dev Server (for pushing function changes)

`bunx convex dev` requires interactive login and cannot run non-interactively without `CONVEX_DEPLOY_KEY`. In cloud agent environments, the Convex backend is already deployed and accessible via `NEXT_PUBLIC_CONVEX_URL`. You can still view/query data through the Next.js frontend without running `convex dev`.

### Lint and Type Check

Standard commands from `package.json`:
- `bun run lint` — ESLint (pre-existing warnings/errors in convex/ and scripts/)
- `bun run check` — TypeScript `tsc --noEmit`
- `bun run build` — Next.js production build (currently fails due to pre-existing missing modules in convex/lib/)

### Known Issues

- Several Convex utility modules are missing (`convex/lib/slug`, `convex/lib/deleteHelpers`, `convex/lib/scrapeVersions`, `convex/books/lib/searchText`, `lib/utils/age-range`, `lib/utils/grade-level`). These cause `tsc` and `next build` to fail but do not affect the dev server.
- Several UI component stubs were added for the app to load: `components/Nav.tsx`, `components/ui/PageContainer.tsx`, `components/books/BookFilterBar.tsx`, `components/books/filters/types.ts`, `components/series/SeriesGrid.tsx`, `config/site.ts`, `app/ad/Client.tsx`. These are minimal and may need fleshing out.
