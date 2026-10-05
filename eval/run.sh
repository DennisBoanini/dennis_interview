#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 /path/to/candidate-submission [--report-dir DIR] [--keep-workdir]" >&2
  exit 2
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 22.12 or later is required to run the evaluator." >&2
  exit 2
fi

node "${ROOT_DIR}/eval/run-backend-eval.mjs" "$@"
