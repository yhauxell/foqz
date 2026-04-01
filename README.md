# Foqz

Minimal desktop tray app that toggles a centered `tldraw` canvas for quick focus notes.

## Features

- Tray icon in the menu bar (macOS) / system tray (Windows & Linux)
- Single-click show/hide canvas window
- Window auto-centers when opened
- Auto-save and restore board state to Electron user data folder

## Run

```bash
yarn install
yarn dev
```

## Build renderer + run production shell

```bash
yarn build
yarn start
```

Snapshot file location at runtime (macOS example):

- `~/Library/Application Support/foqz/board-snapshot.json`
