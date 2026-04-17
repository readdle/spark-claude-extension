#!/bin/bash
# Packages mcpb/skill/spark/ into Spark.skill, the ZIP archive format that
# Claude Cowork expects when a user imports a skill from disk.
#
# Produces:  spark-cli/mcpb/build/Spark.skill
# Contents:  spark/SKILL.md  (plus any other files in mcpb/skill/spark/)
#
# Per Claude Code / Cowork skills docs:
#   - A skill is a directory named after the skill's `name` frontmatter
#     field, containing a SKILL.md entrypoint and optional supporting files.
#   - A `.skill` file is a ZIP archive of that directory. Cowork imports it
#     when the user drops the file onto the app or picks it in the skills
#     settings panel.
#
# Run from anywhere.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

SKILL_ROOT="$SCRIPT_DIR/skill"
SKILL_DIR="$SKILL_ROOT/spark"
OUTPUT_DIR="$SCRIPT_DIR/build"
OUTPUT="$OUTPUT_DIR/Spark.skill"

if [ ! -f "$SKILL_DIR/SKILL.md" ]; then
    echo "error: $SKILL_DIR/SKILL.md not found" >&2
    exit 1
fi

mkdir -p "$OUTPUT_DIR"
rm -f "$OUTPUT"

# Zip from the parent directory so the archive contains a top-level `spark/`
# folder (matching the skill's `name` frontmatter field), not a bare SKILL.md.
(
    cd "$SKILL_ROOT"
    zip -rq "$OUTPUT" spark -x "*.DS_Store"
)

echo "Built $OUTPUT"
echo "  contents:"
unzip -l "$OUTPUT" | sed 's/^/    /'
