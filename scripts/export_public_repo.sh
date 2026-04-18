#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${1:-${ROOT_DIR}/.public-export}"

rm -rf "${OUTPUT_DIR}"
mkdir -p "${OUTPUT_DIR}"

copy_path() {
  local source_path="$1"
  if [[ -e "${ROOT_DIR}/${source_path}" ]]; then
    mkdir -p "${OUTPUT_DIR}/$(dirname "${source_path}")"
    cp -R "${ROOT_DIR}/${source_path}" "${OUTPUT_DIR}/${source_path}"
  fi
}

copy_path "README.md"
copy_path ".github"
copy_path "deno-relay"
copy_path "hf-space-agent"
copy_path "android-client"
copy_path "skills"

find "${OUTPUT_DIR}" \
  \( -name ".env" -o -name ".env.*" \) \
  ! -name ".env.example" | while read -r secret_file; do
  rm -f "${secret_file}"
done

echo "Exported public workspace to ${OUTPUT_DIR}"
