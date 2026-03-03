# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start Vite dev server (also accessible at fedora.local)
npm run build    # Production build → dist/
npm run preview  # Preview production build
```

There are no tests in this project.

## Architecture

**Desmos Offline** is a vanilla JS PWA that wraps the Desmos calculator API for offline use. No frameworks, no backend — all data lives on the user's device.

### Key Files

- `src/main.js` — App entry point: SPA router, UI event handlers, graph list rendering, service worker registration
- `src/CalculatorManager.js` — Wraps `window.Desmos.GraphingCalculator()` / `window.Desmos.Geometry()`; manages lifecycle, change detection, and screenshot/thumbnail capture
- `src/db.js` — IndexedDB abstraction via `idb` library; stores graphs as `{ id, type, name, state, thumbnail, lastModified }`
- `src/clipboard.js` — Export formatting: converts Desmos state JSON to console-paste format or DesModder Text syntax
- `public/sw.js` — Service worker with stale-while-revalidate caching strategy

### Routing

Client-side SPA routing with URL pattern `/{calculator|geometry}/{graphId?}`. Graph IDs are 10-character alphanumeric short IDs. Navigation is handled via `popstate` events in `main.js`.

### Data Flow

The Desmos API instance is wrapped by `CalculatorManager`. On change (expressions, settings, viewport), the save button activates. Saving writes to IndexedDB via `db.js`. Thumbnails are captured via `CalculatorManager.screenshot()` (async, 5s timeout) and stored alongside graph state.

### Desmos API

The Desmos calculator script is loaded externally (not bundled). `window.Desmos` must be available before creating a `CalculatorManager` instance. The API is mounted into `#calculator-container`.

### Notes for Claude

Whenever you make changes, commit them with a concise commit message. Do not push changes unless I tell you to do so. Do not add "co-authored by claude" to the end of your commit messages.