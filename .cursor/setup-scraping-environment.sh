#!/usr/bin/env bash

set -euo pipefail

readonly bun_install_directory="${BUN_INSTALL:-/home/ubuntu/.bun}"
readonly playwright_browsers_path="${PLAYWRIGHT_BROWSERS_PATH:-/home/ubuntu/.cache/ms-playwright}"

export BUN_INSTALL="$bun_install_directory"
export PLAYWRIGHT_BROWSERS_PATH="$playwright_browsers_path"
export PATH="$BUN_INSTALL/bin:$PATH"

if ! command -v bun >/dev/null 2>&1; then
  curl -fsSL https://bun.sh/install | bash
fi

mkdir -p "$PLAYWRIGHT_BROWSERS_PATH"

if [[ -f bun.lock ]]; then
  bun install --frozen-lockfile
else
  bun install
fi

bunx playwright install --with-deps chromium
