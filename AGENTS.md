# AGENTS.md

## Cursor Cloud specific instructions

### Services overview

| Service | Command | Notes |
|---------|---------|-------|
| Next.js dev server | `bun run dev` | Runs on port 3000. Turbopack enabled by default in Next.js 16. |
| Convex dev server | `bunx convex dev` | Pushes functions + watches for changes. Requires Convex auth (interactive login). Not needed if only running the frontend against an existing cloud deployment. |
| Both together | `bun run dev:all` | Runs Next.js + Convex via `concurrently`. |

### Environment variables

The following secrets must be injected (via Cursor Secrets) for the app to connect to the Convex cloud backend:

- `CONVEX_DEPLOYMENT` — Convex deployment identifier (e.g. `abundant-bee-200`)
- `NEXT_PUBLIC_CONVEX_URL` — Public Convex URL for the frontend client
- `CONVEX_URL` — Convex URL for server-side / script usage

These are written to `.env.local` at setup time. If they are already present in the environment, the Next.js dev server picks them up automatically.

### Running without `convex dev`

The Next.js frontend works standalone (without `convex dev` running) as long as `NEXT_PUBLIC_CONVEX_URL` points to a valid cloud deployment with functions already pushed. The `convex dev` command is only needed to push schema/function changes and regenerate types.

### Lint, type check, build

Standard commands from `package.json`:

- **Lint**: `bun run lint` (ESLint — note: the codebase has pre-existing lint warnings/errors)
- **Type check**: `bun run check` (runs `tsc --noEmit` with increased memory)
- **Build**: `bun run build` (Next.js production build)

### Gotchas

- **Bun is required** — The project uses `bun.lock`. Always use `bun install`, `bun run`, `bunx` instead of npm/npx.
- **`convex dev` requires interactive login** — In non-interactive terminals (CI, cloud agents), you cannot run `convex dev` without pre-existing auth. The frontend still works against the cloud deployment without it.
- **Generated types** — `convex/_generated/` is committed to the repo. If schema changes are needed but `convex dev` can't run, the types may be stale. Avoid modifying `convex/schema.ts` without the ability to regenerate.
- **`.env.local` is gitignored** — It must be recreated from environment secrets on each fresh VM.
