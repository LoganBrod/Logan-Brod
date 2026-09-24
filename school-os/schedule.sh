#!/usr/bin/env bash
# Runs `npm run sync` every 30 minutes in the background on this Mac (launchd).
#   npm run schedule      install or refresh the job
#   npm run unschedule    remove it
# Logs go to school-os/logs/sync.log. The job only runs while the Mac is awake.
set -e
cd "$(dirname "$0")"
HERE="$(pwd)"
LABEL="com.school-os.sync"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
NPM="$(command -v npm)"
NODE_DIR="$(dirname "$(command -v node)")"

if [ "${1:-}" = "remove" ]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  echo "Removed. The brain no longer runs on its own."
  exit 0
fi

mkdir -p "$HOME/Library/LaunchAgents" "$HERE/logs"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>$NPM</string><string>run</string><string>-s</string><string>sync</string></array>
  <key>WorkingDirectory</key><string>$HERE</string>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>$NODE_DIR:/usr/local/bin:/usr/bin:/bin</string></dict>
  <key>StartInterval</key><integer>1800</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$HERE/logs/sync.log</string>
  <key>StandardErrorPath</key><string>$HERE/logs/sync.log</string>
</dict>
</plist>
PLIST

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Scheduled: npm run sync every 30 minutes while this Mac is awake."
echo "Log: $HERE/logs/sync.log   (watch it with: tail -f logs/sync.log)"
echo "Remove with: npm run unschedule"
