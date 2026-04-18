#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILLS_DIR="${ROOT_DIR}/skills"
TARGET_REPO="${1:-}"
TARGET_BRANCH="${2:-main}"

if [[ -z "${TARGET_REPO}" ]]; then
  echo "usage: $0 <owner/repo> [branch]" >&2
  exit 1
fi

TOKEN="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
if [[ -z "${TOKEN}" ]]; then
  echo "GH_TOKEN or GITHUB_TOKEN is required" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

git clone --depth 1 --branch "${TARGET_BRANCH}" "https://x-access-token:${TOKEN}@github.com/${TARGET_REPO}.git" "${TMP_DIR}/repo" >/dev/null 2>&1
find "${TMP_DIR}/repo" -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} +
mkdir -p "${TMP_DIR}/repo/skills"
cp -R "${SKILLS_DIR}/." "${TMP_DIR}/repo/skills/"

git -C "${TMP_DIR}/repo" add .
if git -C "${TMP_DIR}/repo" diff --cached --quiet; then
  echo "No skill changes to publish."
  exit 0
fi

git -C "${TMP_DIR}/repo" config user.name "codex-bot"
git -C "${TMP_DIR}/repo" config user.email "codex-bot@users.noreply.github.com"
git -C "${TMP_DIR}/repo" commit -m "chore: sync persona skills" >/dev/null
git -C "${TMP_DIR}/repo" push origin "${TARGET_BRANCH}" >/dev/null
echo "Published skills to ${TARGET_REPO}@${TARGET_BRANCH}"
