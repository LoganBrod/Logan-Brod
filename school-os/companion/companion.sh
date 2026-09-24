#!/usr/bin/env bash
# Start Jarvis (the companion window) when you log in to this Mac.
#   bash companion.sh install    add the login item
#   bash companion.sh remove     take it away
set -e
cd "$(dirname "$0")"
LABEL="com.school-os.companion"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
case "${1:-install}" in
  install)
    [ -d node_modules/electron ] || { echo "Run npm run companion once first, so Electron is installed."; exit 1; }
    NODE="$(command -v node)"; NPX="$(command -v npx)"
    mkdir -p "$HOME/Library/LaunchAgents" ../logs
    cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$NPX</string><string>electron</string><string>.</string></array>
  <key>WorkingDirectory</key><string>$(pwd)</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>$(dirname "$NODE"):/usr/local/bin:/usr/bin:/bin</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><false/>
  <key>StandardOutPath</key><string>$(cd .. && pwd)/logs/companion.log</string>
  <key>StandardErrorPath</key><string>$(cd .. && pwd)/logs/companion.log</string>
</dict></plist>
PL
    launchctl unload "$PLIST" 2>/dev/null || true
    launchctl load "$PLIST"
    echo "Jarvis will start at login. Starting it now."
    ;;
  remove)
    launchctl unload "$PLIST" 2>/dev/null || true
    rm -f "$PLIST"
    echo "Removed. Jarvis no longer starts at login."
    ;;
esac
