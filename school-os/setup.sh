#!/usr/bin/env bash
# One-shot setup for the brain. Run from Terminal:
#   cd <the school-os folder> && bash setup.sh
# Installs packages, asks for your paths and keys, writes .env, then runs the checks.
set -e
cd "$(dirname "$0")"

say()  { printf '\n\033[1m%s\033[0m\n' "$1"; }
ask()  { printf '%s: ' "$1"; read -r REPLY; }
askq() { printf '%s: ' "$1"; read -rs REPLY; printf '\n'; }

# Turn a path dragged into Terminal (with backslash-escaped spaces, maybe quotes) into a plain path.
clean_path() {
  local p="$1"
  p="${p%"${p##*[![:space:]]}"}"       # trim trailing whitespace
  p="${p#\'}"; p="${p%\'}"; p="${p#\"}"; p="${p%\"}"
  printf '%s' "$p" | sed 's/\\ / /g'
}

say "1/4  Checking Node.js"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Get the LTS version from https://nodejs.org, install it, then run this again."
  exit 1
fi
echo "Node $(node -v), npm $(npm -v)"

say "2/4  Installing packages (takes a minute)"
npm install --no-fund --no-audit >/dev/null
echo "done"

say "3/4  Your settings"
if [ -f .env ]; then
  echo ".env already exists, keeping it. Delete it and rerun if you want to start over."
else
  echo "Drag your School vault folder from Finder into this window, then press Enter."
  ask "Vault folder"
  VAULT="$(clean_path "$REPLY")"
  if [ ! -d "$VAULT/00 Inbox" ]; then
    echo "That folder has no '00 Inbox' inside it: $VAULT"
    echo "Pick the folder that contains 00 Inbox, 01 Courses, and so on."
    exit 1
  fi
  echo "Keys are not shown as you paste them. Paste, then press Enter."
  askq "Claude API key (platform.claude.com)";  ANTHROPIC="$REPLY"
  askq "Schoology consumer key";                 SKEY="$REPLY"
  askq "Schoology consumer secret";              SSECRET="$REPLY"
  cat > .env <<ENV
VAULT_PATH=$VAULT
ANTHROPIC_API_KEY=$ANTHROPIC
CONFIDENCE_THRESHOLD=0.7
SCHOOLOGY_CONSUMER_KEY=$SKEY
SCHOOLOGY_CONSUMER_SECRET=$SSECRET
DISCORD_WEBHOOK_URL=
GDOCS_FOLDER_ID=
GOOGLE_SERVICE_ACCOUNT_KEY=
ENV
  echo "wrote .env"
fi

say "4/4  Checks"
echo "-- Schoology: who am I?"
npm run -s schoology:whoami || echo "   Schoology check failed. Open .env and check the two Schoology lines for stray spaces."
echo
echo "-- Inbox: pretend run, no Claude call"
npm run -s ingest:fake

say "Setup finished."
cat <<'NEXT'
Next, in this same window:
  npm run ingest:dry     first real Claude call; shows the plan, moves nothing
  npm run ingest         files the inbox for real
  npm run schoology      writes 03 Calendar/Upcoming Tests.md
NEXT
