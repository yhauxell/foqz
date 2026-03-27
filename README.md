# Focus Work Mini App

Minimal macOS tray app that toggles a centered `tldraw` canvas for quick focus notes.

## Features

- Tray icon in macOS menu bar
- Single-click show/hide canvas window
- Window auto-centers when opened
- Auto-save and restore board state to Electron user data folder

## Run

```bash
npm install
npm run dev
```

## Build renderer + run production shell

```bash
npm run build
npm start
```

Snapshot file location at runtime:

- `~/Library/Application Support/focus-work-mini-app/board-snapshot.json`
