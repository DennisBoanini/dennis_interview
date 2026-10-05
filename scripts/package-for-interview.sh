#!/usr/bin/env bash
# Package only the candidate-facing exercise as projectname-YYYY-MM-DD.zip.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_NAME="$(basename "$ROOT_DIR")"
PACKAGE_DATE_VALUE="${PACKAGE_DATE:-$(date +%Y-%m-%d)}"
OUTPUT_ZIP="${1:-${ROOT_DIR}/${PROJECT_NAME}-${PACKAGE_DATE_VALUE}.zip}"
VERIFY_SCRIPT="${ROOT_DIR}/scripts/verify-candidate-package.sh"
STAGING_DIR="$(mktemp -d)"
ARCHIVE_ROOT="${STAGING_DIR}/${PROJECT_NAME}"
TEMP_ZIP="${STAGING_DIR}/${PROJECT_NAME}.zip"

cleanup() {
  rm -rf "$STAGING_DIR"
}
trap cleanup EXIT

for required_path in README.md .gitignore backend frontend; do
  if [[ ! -e "${ROOT_DIR}/${required_path}" ]]; then
    echo "Missing required candidate-facing path: ${required_path}" >&2
    exit 1
  fi
done

mkdir -p "$ARCHIVE_ROOT"

# Fail closed: copy an explicit top-level allowlist rather than excluding private
# directories from a broad repository copy.
cp "${ROOT_DIR}/README.md" "${ARCHIVE_ROOT}/README.md"
cp "${ROOT_DIR}/.gitignore" "${ARCHIVE_ROOT}/.gitignore"

rsync -a \
  --exclude='target/' \
  --exclude='*.class' \
  --exclude='.DS_Store' \
  --exclude='.idea/' \
  --exclude='.vscode/' \
  --exclude='*.iml' \
  "${ROOT_DIR}/backend/" "${ARCHIVE_ROOT}/backend/"

rsync -a \
  --exclude='node_modules/' \
  --exclude='dist/' \
  --exclude='.vite/' \
  --exclude='.DS_Store' \
  --exclude='.idea/' \
  --exclude='.vscode/' \
  --exclude='*.iml' \
  "${ROOT_DIR}/frontend/" "${ARCHIVE_ROOT}/frontend/"

(
  cd "$STAGING_DIR"
  zip -qr "$TEMP_ZIP" "$PROJECT_NAME"
)

"$VERIFY_SCRIPT" "$TEMP_ZIP"

mkdir -p "$(dirname "$OUTPUT_ZIP")"
mv "$TEMP_ZIP" "$OUTPUT_ZIP"
echo "Created ${OUTPUT_ZIP}"
