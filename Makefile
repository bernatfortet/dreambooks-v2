.PHONY: dev
dev:
	@echo "🚀 Starting Convex and Next.js dev servers..."
	@echo ""
	@echo "Run these commands in separate terminal tabs:"
	@echo "  Terminal 1: make dev:convex"
	@echo "  Terminal 2: make dev:next"
	@echo ""
	@echo "Or use: bun run dev:all (runs both in one terminal)"

.PHONY: dev:convex
dev:convex:
	@echo "🌀 Starting Convex dev server..."
	@npx convex dev

.PHONY: dev:next
dev:next:
	@echo "🌀 Starting Next.js dev server..."
	@bun run dev

.PHONY: install
install:
	@bun install

.PHONY: build
build:
	@bun run build
