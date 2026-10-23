#!/usr/bin/env bash
set -euo pipefail
blast_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$blast_root"
blast_bun="$(command -v bun || true)"
if [[ -z "$blast_bun" ]] || [[ "$("$blast_bun" --version)" != '1.3.11' ]]; then
  case "$(uname -s)-$(uname -m)" in
    Linux-x86_64) blast_package='bun-linux-x64' ;;
    Linux-aarch64) blast_package='bun-linux-aarch64' ;;
    *) echo 'Install Bun 1.3.11 for this platform before running setup.' >&2; exit 1 ;;
  esac
  npm --cache "$blast_root/.tools/npm-cache" install --prefix "$blast_root/.tools/bun" --no-audit --no-fund --ignore-scripts "@oven/$blast_package@1.3.11"
  mkdir -p "$blast_root/.tools/bin"
  ln -sfn "../bun/node_modules/@oven/$blast_package/bin/bun" "$blast_root/.tools/bin/bun"
  blast_bun="$blast_root/.tools/bin/bun"
fi
export PATH="$(dirname -- "$blast_bun"):$PATH"
BUN_INSTALL_CACHE_DIR="$blast_root/.tools/bun-cache" bun install --frozen-lockfile
bun run typecheck
bun run test
bun run build
