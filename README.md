# Flux

A lightweight streaming app for Windows, built with Electron.

Flux uses the same metadata source as [Helix](https://github.com/etb190/Helix) (the Stremio Cinemeta addon) to search movies & series and display poster thumbnails.

## Status (MVP)

- [x] Search bar (debounced as-you-type + Enter)
- [x] Poster thumbnail grid for results (movies + series, interleaved)
- [x] IMDb rating chip, type badge, year
- [ ] Details page (next)
- [ ] Stream sourcing & playback (later)

## Requirements

- Node.js 18+ (LTS recommended)
- Windows 10/11 (only platform being targeted)

## Run in development

```bash
npm install
npm start
```

## Build for Windows

```bash
npm install
npm run dist:win
```

Installers/portables are emitted into `dist/`.

## How search works

The Electron main process queries Cinemeta exactly like Helix does:

```
GET https://v3-cinemeta.strem.io/catalog/{movie|series}/top/search={query}.json
```

Both catalogs are queried in parallel and results are interleaved, so neither
movies nor series drown each other out. Search runs in the main process (no
CORS issues) and is exposed to the renderer via a small `fluxAPI` preload
bridge.
