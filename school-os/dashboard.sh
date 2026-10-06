#!/usr/bin/env bash
# Run the dashboard in the background, always, so localhost:3210 answers without a Terminal window.
#   npm run dashboard:always    build it and start it at login (and now)
#   npm run dashboard:stop      stop it and remove the login item
set -e
cd "$(dirname "$0")"
LABEL="com.school-os.dashboard"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
case "${1:-install}" in
  install)
    NODE="$(command -v node)"
    echo "Building the dashboard (a minute)..."
    npm run -s dashboard:build >/dev/null
    mkdir -p "$HOME/Library/LaunchAgents" logs
    cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>$(pwd)/node_modules/next/dist/bin/next</string><string>start</string><string>dashboard</string><string>-p</string><string>3210</string></array>
  <key>WorkingDirectory</key><string>$(pwd)</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>$(dirname "$NODE"):/usr/local/bin:/usr/bin:/bin</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$(pwd)/logs/dashboard.log</string>
  <key>StandardErrorPath</key><string>$(pwd)/logs/dashboard.log</string>
</dict></plist>
PL
    launchctl unload "$PLIST" 2>/dev/null || true
    launchctl load "$PLIST"
    echo "The dashboard now runs in the background at http://localhost:3210, and starts at login."
    echo "Bookmark it. After npm run update it rebuilds and restarts by itself."
    ;;
  restart)
    [ -f "$PLIST" ] || exit 0
    echo "Rebuilding and restarting the background dashboard..."
    npm run -s dashboard:build >/dev/null
    launchctl kickstart -k "gui/$(id -u)/$LABEL" 2>/dev/null || { launchctl unload "$PLIST" 2>/dev/null || true; launchctl load "$PLIST"; }
    ;;
  remove)
    launchctl unload "$PLIST" 2>/dev/null || true
    rm -f "$PLIST"
    echo "Stopped. The dashboard no longer runs in the background; npm run dashboard still works."
    ;;
esac
