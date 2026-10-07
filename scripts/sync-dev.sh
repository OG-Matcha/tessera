#!/bin/sh
# Copies the mod into this session's hot-reload folder: sh scripts/sync-dev.sh <dev-mods session dir>
set -e
src=$(cd "$(dirname "$0")/.." && pwd)
dst="$1/tessera"
mkdir -p "$dst"
(cd "$src" && tar --exclude=.git --exclude=scripts --exclude=.claude-plugin/types -cf - .) | (cd "$dst" && tar -xf -)
