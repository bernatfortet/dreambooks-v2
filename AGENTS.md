# Dreambooks v2

## Cursor Cloud specific instructions

### Services overview

| Service | How to run | Notes |
|---|---|---|
| **Next.js dev server** | `bun run dev` | Runs on port 3000. Hot-reloads frontend changes. |
| **Convex backend** | Cloud-hosted at the URL in `NEXT_PUBLIC_CONVEX_URL`. No local server needed for frontend dev. | Pushing Convex functions requires `npx convex dev` with Convex CLI auth (interactive login). |

### Quick start

1. `bun install` (dependencies)
2. Ensure `.env.local` has `NEXT_PUBLIC_CONVEX_URL` and `CONVEX_URL` from environment secrets
3. `bun run dev` to start the Next.js dev server on port 3000

### Key gotchas

- **Missing `convex/lib/` files**: The repo references `convex/lib/slug`, `convex/lib/deleteHelpers`, `convex/lib/scrapeVersions`, etc. that do not exist on disk. This causes `bun run check` (tsc) and `bun run build` to fail with TS2307 errors. The Convex cloud deployment has these functions already deployed, so the frontend works fine against the cloud backend.
- **Missing UI component stubs**: Several components referenced in `app/layout.tsx` and page files (`Nav`, `PageContainer`, `BookFilterBar`, `config/site`, etc.) were not committed to the repo. Stubs were created during environment setup to get the app running.
- **Convex function deployment**: Deploying Convex functions (`npx convex dev`) requires interactive CLI authentication. In headless environments, this is not available. The frontend connects directly to the cloud Convex deployment via `NEXT_PUBLIC_CONVEX_URL`.
- **`bun run build` vs `bun run dev`**: The production build runs TypeScript strict checking and will fail on the missing `convex/lib/` modules. The dev server (`bun run dev`) works fine.

### Playwright / scraping

- Playwright Chromium is installed by the update script (`bunx playwright install --with-deps chromium`).
- The scraping worker (`bun run worker`) connects to an existing Chrome instance via CDP on port 9222 — it does **not** use the bundled Playwright Chromium. To use it, launch Chrome with `google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug-profile`.
- Playwright Chromium is still useful for headless scraping scripts and tests that launch their own browser via `chromium.launch()`.

### Available commands

See `package.json` scripts. Key ones:
- `bun run dev` — Next.js dev server
- `bun run lint` — ESLint (has pre-existing warnings/errors)
- `bun run check` — TypeScript type-check (has pre-existing errors from missing convex/lib files)
- `bun run build` — Production build (fails due to pre-existing TS errors)
- `bun run worker` — Scraping worker (requires Chrome with CDP on port 9222)

### Environment secrets

Required secrets (injected as environment variables):
- `NEXT_PUBLIC_CONVEX_URL` — Convex deployment URL for the frontend
- `CONVEX_URL` — Convex deployment URL for scripts
- `CONVEX_DEPLOYMENT` — Convex deployment name

Optional (for scraping features):
- `FIRECRAWL_API_KEY` — Firecrawl API access
- `SCRAPE_IMPORT_KEY` — Auth key for import endpoints
