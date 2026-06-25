#!/bin/bash
# Build the Claude Desktop MCP extension bundle (.mcpb) for this repo.
#
# Usage:
#   build-mcpb.sh [output-file]
#
#   [output-file]  Optional output path. Defaults to <name>.mcpb (name taken
#                  from manifest.json) in the repo root, i.e. Spark.mcpb.
#
# Packs manifest.json + the server source + bundled node_modules with the
# official @anthropic-ai/mcpb packer, honoring .mcpbignore exclusions. The
# bundle ships node_modules/ as-is, so deps are installed from the lockfile
# first to keep the artifact reproducible.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -f manifest.json ]; then
    echo "error: manifest.json not found in $SCRIPT_DIR" >&2
    exit 1
fi

NAME="$(node -p "require('./manifest.json').name")"
OUTPUT="${1:-$NAME.mcpb}"
case "$OUTPUT" in
    /*) ;;
    *)  OUTPUT="$SCRIPT_DIR/$OUTPUT" ;;
esac

if [ -f package-lock.json ]; then
    npm ci --omit=dev
else
    npm install --omit=dev
fi

rm -f "$OUTPUT"
npx --yes @anthropic-ai/mcpb pack . "$OUTPUT"

echo "Built ${OUTPUT#"$SCRIPT_DIR"/}"
