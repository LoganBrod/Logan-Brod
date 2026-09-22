#!/usr/bin/env bash
# Pulls the latest school-os from GitHub over this folder. Keeps .env and node_modules.
#   bash update.sh
# Whole body is one function so bash reads the file fully before it gets replaced.
main() {
  set -e
  cd "$(dirname "$0")"
  local REPO="LoganBrod/Logan-Brod"
  local BRANCH="claude/agentic-school-os-notes-1wr7w3"
  local URL="https://github.com/$REPO/archive/refs/heads/$BRANCH.zip"
  local TMP; TMP="$(mktemp -d)"

  echo "Downloading latest from GitHub..."
  curl -sSL "$URL" -o "$TMP/latest.zip"
  unzip -q "$TMP/latest.zip" -d "$TMP"
  local SRC; SRC="$(find "$TMP" -maxdepth 2 -type d -name school-os | head -1)"
  [ -d "$SRC" ] || { echo "Could not find school-os in the download."; exit 1; }

  echo "Updating files (keeping .env and node_modules)..."
  local entry name
  for entry in "$SRC"/* "$SRC"/.[!.]*; do
    [ -e "$entry" ] || continue
    name="$(basename "$entry")"
    case "$name" in .env|node_modules|service-account.json) continue ;; esac
    rm -rf "./$name"
    cp -R "$entry" "./$name"
  done

  # Docs live next to school-os in the repo; refresh them too if that layout exists here.
  if [ -d "../docs" ] && [ -d "$SRC/../docs" ]; then cp -R "$SRC/../docs/." "../docs/"; fi

  rm -rf "$TMP"
  echo "Installing packages..."
  npm install --no-fund --no-audit >/dev/null
  echo "Up to date. Run: npm run sync"
  exit 0
}
main "$@"
