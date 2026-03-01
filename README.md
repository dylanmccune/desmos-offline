# Desmos Offline

A PWA that wraps the [Desmos](https://desmos.com) calculator and geometry tools for offline use. Save and manage multiple graphs locally — no account, no backend.

## Features

- **Graphing & Geometry** — switch between Desmos Graphing Calculator and Geometry tool
- **Local storage** — graphs are saved to IndexedDB in your browser
- **Offline support** — works without a network connection after the first visit
- **Thumbnails** — each saved graph gets a screenshot preview
- **Export** — copy graph state as a console command or DesModder Text format
- **Import / Export all** — back up and restore your graphs as JSON

## Usage

Open the app, draw something, hit **Save**. Your graphs appear in the folder menu (top-left). Click a card to reopen it, or use the ⋯ menu on a card to duplicate or delete it.

## Development

```bash
npm install
npm run dev      # dev server (also accessible at fedora.local)
npm run build    # production build → dist/
npm run preview  # preview production build
```

Requires Node.js. No backend — all data lives in the browser.

## Deployment

The app is a static SPA. A `_redirects` file is included for Netlify. For other hosts, configure all routes to serve `index.html`.

**First visit must be online** so the service worker can cache the app shell and the Desmos API script. After that, the app works fully offline.

## Stack

- Vanilla JS, no framework
- [Vite](https://vitejs.dev) — build tool
- [idb](https://github.com/jakearchibald/idb) — IndexedDB wrapper
- [Desmos API](https://www.desmos.com/api/v1.12/docs/) — embedded calculator (loaded externally)
- Service worker with stale-while-revalidate caching
