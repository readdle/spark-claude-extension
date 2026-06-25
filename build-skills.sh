#!/bin/bash
# Build a Claude Agent Skill (.skill ZIP) for every skill under skill/.
#
# Usage:
#   build-skills.sh [output-dir]
#
#   [output-dir]  Where to write the .skill files. Defaults to the repo root
#                 (next to Spark.mcpb), matching where release artifacts live.
#
# Each skill/<dir>/SKILL.md becomes one .skill archive whose single top-level
# entry is the skill's `name:` frontmatter value - NOT the source directory
# name. The two differ on purpose here (dir `recipe-inbox-zero`, name
# `spark-recipe-inbox-zero`), and Cowork rejects archives whose top-level entry
# doesn't match `name:`, so we stage under `name` before zipping.
#
# The output FILE is human-readable Title Case (e.g. "Spark Recipe Inbox
# Zero.skill") so it reads well in a downloads folder. The base skill (name
# `spark`) thus lands as `Spark.skill`, matching README.md / release assets.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_ROOT="$SCRIPT_DIR/skill"
OUT_DIR="${1:-$SCRIPT_DIR}"

if [ ! -d "$SKILL_ROOT" ]; then
    echo "error: $SKILL_ROOT not found" >&2
    exit 1
fi

mkdir -p "$OUT_DIR"
OUT_DIR="$(cd "$OUT_DIR" && pwd)"

# Extract the `name:` scalar from the first YAML frontmatter block.
parse_skill_name() {
    awk '
        /^---[[:space:]]*$/ { fence++; next }
        fence == 1 && /^name:[[:space:]]*/ {
            sub(/^name:[[:space:]]*/, "")
            gsub(/["'"'"']/, "")
            sub(/[[:space:]]+$/, "")
            print
            exit
        }
    ' "$1"
}

# Turn a hyphenated skill name into a Title Case, space-separated label used
# only for the output filename (e.g. spark-recipe-inbox-zero -> Spark Recipe
# Inbox Zero).
display_name() {
    echo "$1" | tr '-' ' ' | awk '{
        for (i = 1; i <= NF; i++) {
            $i = toupper(substr($i, 1, 1)) substr($i, 2)
        }
        print
    }'
}

# Clear stale artifacts so renamed builds don't pile up alongside new ones.
rm -f "$OUT_DIR"/*.skill

built=0
for skill_md in "$SKILL_ROOT"/*/SKILL.md; do
    [ -f "$skill_md" ] || continue

    src_dir="$(dirname "$skill_md")"
    name="$(parse_skill_name "$skill_md")"

    if [ -z "$name" ]; then
        echo "error: no 'name:' frontmatter in $skill_md" >&2
        exit 1
    fi

    out="$OUT_DIR/$(display_name "$name").skill"

    # Stage the skill under its `name` so the archive's top-level entry
    # matches the frontmatter, regardless of the source directory name.
    stage="$(mktemp -d)"
    mkdir -p "$stage/$name"
    cp -R "$src_dir"/. "$stage/$name"/
    find "$stage/$name" -name '.DS_Store' -delete

    rm -f "$out"
    ( cd "$stage" && zip -rq "$out" "$name" -x "*.DS_Store" )
    rm -rf "$stage"

    echo "Built ${out#"$SCRIPT_DIR"/}  (name: $name, source: skill/$(basename "$src_dir"))"
    built=$((built + 1))
done

echo "Done: built $built skill archive(s) in ${OUT_DIR#"$SCRIPT_DIR"/}/"
