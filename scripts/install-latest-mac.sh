#!/usr/bin/env bash
# Download the latest Foqz macOS release, install it to /Applications and clear the quarantine flag.
#   curl -fsSL https://raw.githubusercontent.com/yhauxell/foqz/main/scripts/install-latest-mac.sh | bash
set -euo pipefail

REPO="yhauxell/foqz"
APP="/Applications/Foqz.app"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

URL="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
  | grep -o '"browser_download_url": *"[^"]*-arm64-mac\.zip"' | cut -d'"' -f4)"
[ -n "$URL" ] || { echo "No arm64 mac zip found in latest release" >&2; exit 1; }

echo "Downloading $URL..."
curl -fL --progress-bar "$URL" -o "$TMP/foqz.zip"

ditto -x -k "$TMP/foqz.zip" "$TMP/out"

osascript -e 'quit app "Foqz"' 2>/dev/null || true
rm -rf "$APP"
cp -R "$TMP/out/Foqz.app" "$APP"
xattr -rd com.apple.quarantine "$APP" 2>/dev/null || true

echo "Installed $(defaults read "$APP/Contents/Info" CFBundleShortVersionString) to $APP"
