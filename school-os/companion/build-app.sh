#!/usr/bin/env bash
# Turns the companion into Jarvis.app and puts it in Applications.
#   npm run companion:app
set -e
cd "$(dirname "$0")"
SCHOOL_OS="$(cd .. && pwd)"
ARCH="$(uname -m)"; [ "$ARCH" = x86_64 ] && ARCH=x64
echo "Installing build tools..."
npm install --no-fund --no-audit >/dev/null
# The app lives in Applications, so it needs to know where school-os (and .env) is.
printf '{ "dir": "%s", "node": "%s" }\n' "$SCHOOL_OS" "$(command -v node)" > school-os-path.json
echo "Building Jarvis.app for $ARCH (a minute or two)..."
npx @electron/packager . Jarvis --platform=darwin --arch="$ARCH" --icon=assets/icon.icns --out=dist --overwrite \
  --app-bundle-id=com.school-os.jarvis --app-category-type=public.app-category.education \
  --extend-info=Info.extend.plist --ignore='^/dist' --ignore='^/build-app.sh' --ignore='^/companion.sh' >/dev/null
APP="dist/Jarvis-darwin-$ARCH/Jarvis.app"
[ -d "$APP" ] || { echo "The build did not produce $APP"; exit 1; }
DEST="/Applications"; [ -w "$DEST" ] || { DEST="$HOME/Applications"; mkdir -p "$DEST"; }
osascript -e 'tell application "Jarvis" to quit' >/dev/null 2>&1 || true
rm -rf "$DEST/Jarvis.app"
cp -R "$APP" "$DEST/Jarvis.app"
echo "Done: $DEST/Jarvis.app. Open it from Launchpad or Spotlight (type Jarvis)."
echo "It reads $SCHOOL_OS/.env and talks to the dashboard there. Option+Space shows it."
