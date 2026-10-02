# Flux

A lightweight streaming app for Windows, built with **Electron + React + Vite** (plain JavaScript, no TypeScript), styled with **Tailwind CSS**.

Flux uses the same metadata source as [Helix](https://github.com/etb190/Helix) (the Stremio Cinemeta addon) to search movies & series, and a home page filled by the Streaming Availability API (daily Top 10s, popular per service, new & leaving soon) mixed with TMDB trending.

## Status (v0.12.0)

- [x] Home page (Streaming Availability API + TMDB trending, hero banner, poster rows)
- [x] Search bar (debounced as-you-type + Enter)
- [x] Poster results grid (movies + series, interleaved)
- [x] Details page with season tabs + episode lists (50-ep batches for long seasons)
- [x] Source scanning (multi-provider, live progress, text + size filters)
- [x] Player: HLS (hls.js) / MP4 direct playback + embed webviews, header injection + CORS passthrough
- [x] Helix subtitle system (SRT/VTT/ASS, en/fr/it/es/ar whitelist, delay, embedded tracks)
- [x] Settings: ANGLE graphics backend (D3D9 default), Streaming Availability key + country
- [x] Squirrel.Windows installer lifecycle (install/update/uninstall events)

## Project structure

```
Flux/
├── electron.vite.config.mjs     # vite config for main/preload/renderer
├── src/
│   ├── main/                    # Electron main process (CommonJS, unbundled)
│   │   ├── index.js             # window + IPC + squirrel startup + interceptors
│   │   ├── search.js            # Cinemeta search/meta
│   │   ├── streams.js           # multi-provider source scraper
│   │   ├── providers2/3.js      # scrapers
│   │   ├── subtitles.js         # Helix SubtitleService port
│   │   ├── home.js              # home orchestrator (SA + TMDB)
│   │   ├── saa.js               # Streaming Availability API client
│   │   ├── tmdbhome.js          # TMDB trending + IMDb enrichment
│   │   └── settings.js          # persisted settings (v3)
│   ├── preload/index.js         # contextBridge fluxAPI
│   └── renderer/                # React app (Vite + Tailwind v4)
│       ├── index.html
│       ├── public/icon.png
│       └── src/
│           ├── main.jsx         # entry + error boundary
│           ├── App.jsx          # view machine, Esc chain, orchestration
│           ├── components/      # TopBar, HomeView, ResultsView, DetailsView,
│           │                    # SourcesView, PlayerView, SubtitleMenu,
│           │                    # SettingsModal, PosterCard, icons, ui
│           ├── hooks/           # useHome, useSearch, useStreams, useSubtitles
│           └── lib/             # subsParser, format helpers, cinemeta fallback
└── assets/icon.png              # installer/window icon
```

The main process modules are plain CommonJS and are copied to `out/main/` at
build time instead of being bundled, so they stay byte-for-byte identical to
the pre-React versions. The renderer is a React 18 SPA built by Vite with
Tailwind v4.

## Requirements

- Node.js 20+ (24 recommended)
- Windows 10/11 (only platform being targeted)

## Run in development

```bash
npm install
npm run dev        # electron-vite dev (Vite HMR for the renderer)
```

## Build for Windows

```bash
npm install
npm run build      # electron-vite build -> out/
npm run dist:win   # build + electron-builder (Squirrel.Windows installer)
```

The Squirrel installer and its `.nupkg`/`RELEASES` files are emitted into `dist/`.
Install/update/uninstall events are handled in the main process via
`electron-squirrel-startup`.

## How it works

- **Search / details** — the main process queries Cinemeta exactly like Helix
  does (`v3-cinemeta.strem.io`), movies + series in parallel, interleaved.
- **Home page** — `saa.js` talks to the Streaming Availability API
  (`api.movieofthenight.com/v4`, key in Settings, shipped with a working one)
  for Top 10s / popular / new / leaving-soon; `tmdbhome.js` adds TMDB trending
  enriched with IMDb ids. Responses are disk-cached (6–12 h) to protect quotas.
- **Sources** — every provider scraper runs in the main process; results stream
  to the UI over IPC as they are found.
- **Playback** — direct HLS/MP4 via hls.js / `<video>` (Referer/UA injection +
  CORS passthrough via webRequest), embed providers in a sandboxed `<webview>`.
- **Subtitles** — OpenSubtitles/other providers + embedded HLS WebVTT tracks,
  filtered to en/fr/it/es/ar, rendered by the app's own overlay with delay control.
