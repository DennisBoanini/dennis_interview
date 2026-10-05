#!/usr/bin/env bash
# Verify that an interview ZIP contains only candidate-facing material.
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 /path/to/candidate-package.zip" >&2
  exit 2
fi

ARCHIVE_PATH="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
if [[ ! -f "$ARCHIVE_PATH" ]]; then
  echo "Archive does not exist: ${ARCHIVE_PATH}" >&2
  exit 2
fi

for command_name in unzip grep find; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command is unavailable: ${command_name}" >&2
    exit 2
  fi
done

INSPECTION_DIR="$(mktemp -d)"
ENTRY_LIST="${INSPECTION_DIR}/entries.txt"

cleanup() {
  rm -rf "$INSPECTION_DIR"
}
trap cleanup EXIT

unzip -Z1 "$ARCHIVE_PATH" > "$ENTRY_LIST"

if grep -Eq '(^/|(^|/)\.\.(/|$))' "$ENTRY_LIST"; then
  echo "Archive contains an unsafe absolute or parent-traversal path." >&2
  exit 1
fi

DENIED_PATH_PATTERN='(^|/)(eval|held-out-tests|scripts|reports|\.git|node_modules|target|dist|\.vite|\.idea|\.vscode|__MACOSX)(/|$)|(^|/)(\.DS_Store|PACKAGE-LEAK-SENTINEL\.txt)$|\.iml$|\.class$|\.zip$|held.?out|private.?fixture|eval.?report'
if grep -E "$DENIED_PATH_PATTERN" "$ENTRY_LIST"; then
  echo "Archive contains a denied private or generated path." >&2
  exit 1
fi

unzip -q "$ARCHIVE_PATH" -d "$INSPECTION_DIR/unpacked"

if find "$INSPECTION_DIR/unpacked" -type l -print -quit | grep -q .; then
  echo "Archive contains a symlink; candidate packages must contain regular files only." >&2
  exit 1
fi

ARCHIVE_ROOT_COUNT="$(find "$INSPECTION_DIR/unpacked" -mindepth 1 -maxdepth 1 -type d -print | wc -l | tr -d ' ')"
if [[ "$ARCHIVE_ROOT_COUNT" -ne 1 ]]; then
  echo "Archive must contain exactly one project root directory." >&2
  exit 1
fi

PROJECT_ROOT="$(find "$INSPECTION_DIR/unpacked" -mindepth 1 -maxdepth 1 -type d -print | head -1)"
for required_path in README.md .gitignore backend/pom.xml backend/mvnw frontend/package.json; do
  if [[ ! -e "${PROJECT_ROOT}/${required_path}" ]]; then
    echo "Archive is missing required path: ${required_path}" >&2
    exit 1
  fi
done

UNEXPECTED_TOP_LEVEL="$(
  find "$PROJECT_ROOT" -mindepth 1 -maxdepth 1 -print \
    | while IFS= read -r candidate_path; do
        candidate_name="$(basename "$candidate_path")"
        case "$candidate_name" in
          README.md|.gitignore|backend|frontend) ;;
          *) printf '%s\n' "$candidate_name" ;;
        esac
      done
)"
if [[ -n "$UNEXPECTED_TOP_LEVEL" ]]; then
  printf 'Archive contains unexpected top-level paths:\n%s\n' "$UNEXPECTED_TOP_LEVEL" >&2
  exit 1
fi

if grep -RIlE 'PRIVATE_EVAL_ONLY|EVAL_PRIVATE_FIXTURE_SENTINEL_7f85e2bd' "$PROJECT_ROOT" | grep -q .; then
  echo "Archive contains a private evaluation marker." >&2
  exit 1
fi

unzip -tq "$ARCHIVE_PATH" >/dev/null
echo "Package verification passed: ${ARCHIVE_PATH}"
