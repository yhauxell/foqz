#!/usr/bin/env bash
# Download the latest Foqz macOS release, install it to /Applications and clear the quarantine flag.
set -euo pipefail

REPO="yhauxell/foqz"
APP="/Applications/Foqz.app"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Downloading latest release from $REPO..."
gh release download --repo "$REPO" --pattern '*-arm64-mac.zip' --dir "$TMP"

ditto -x -k "$TMP"/*.zip "$TMP/out"

osascript -e 'quit app "Foqz"' 2>/dev/null || true
rm -rf "$APP"
cp -R "$TMP/out/Foqz.app" "$APP"
xattr -rd com.apple.quarantine "$APP" 2>/dev/null || true

echo "Installed $(defaults read "$APP/Contents/Info" CFBundleShortVersionString) to $APP"
