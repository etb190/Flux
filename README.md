# Flux

A lightweight streaming app for Windows, built with **Electron + React + Vite** (plain JavaScript, no TypeScript), styled with **Tailwind CSS**.

Flux uses the same metadata source as [Helix](https://github.com/etb190/Helix) (the Stremio Cinemeta addon) to search movies & series, and a home page filled by the Streaming Availability API (daily Top 10s, popular per service, new & leaving soon) mixed with TMDB trending.

## Status (v0.18.0)

- [x] ZERO border-radius policy: every box, button, card, pill, input and
      dropdown across the app is perfectly square (global CSS guarantee)
- [x] Trailers fixed: YouTube's 2025 anti-anonymous-embed policy (Error 153
      "Video player configuration error") rejected the old webview path —
      trailers now play through a browser-native iframe on a localhost host
      page served by the main process (real origin → referrer YouTube
      requires), plus an "Open on YouTube" escape hatch; never recorded in
      Continue watching; Return lands back on the details screen
- [x] Details page: plain "Series" / "Movie" pill (no more "F Series"),
      Play / Trailer / Watched buttons pulled close together, info card
      trimmed to genre + country (cast/director/writer removed), and the
      oversized spacing between hero → storyline → Episodes → season list
      → episode cards tightened throughout
- [x] One black: the details page background no longer splits into two
      tones (flex-shrink bug let the app background leak below the fold) —
      the whole page is the hero's #0a0a0a
- [x] Player chrome: the back button is now a styled "Return" button
      (was an unstyled "Sources" label), matching the "Change source" button
- [x] Sources view: size filter dropdown rebuilt — square, exactly the
      height of the search input beside it, with a chevron affordance
- [x] Light-black dark mode: neutral gray stack (no blue tint) — #121212 main,
      #0d0d0d sidebar, #1a1a1a cards, red #E50914 accent, Inter font
- [x] Home page: square-cornered 16:9 backdrop cards with a tiny 3px gap,
      arrow-paged carousels, square + wide topbar search, tight spacing under
      the search bar, no hero banner
- [x] One-layer details flow: back circle, breadcrumb (Movies | Genre | Title)
      and search live INSIDE the content layer; no settings gear anywhere
- [x] Details hero: full-bleed art, match pill, IMDb chip, red-gradient series
      title, Play / **Trailer** (YouTube) / add-to-Watched actions — the hero
      stays above the storyline on every page length
- [x] Episodes: season buttons in one scrollable line (arrows when they
      overflow) and episode CARDS in one scrollable line — banner, red
      "EP n", bold white title, light-gray description, uniform card sizes
- [x] Sources view: uniform server cards (no "recommended" highlighting),
      format/quality chips, operational badge, Stream Now actions
- [x] Continue Watching: first row, S/E + time-left badge, red progress bar,
      same-source resume from the saved timestamp, hover x dismiss (persisted)
- [x] Player: **Artplayer** engine + hls.js — CC (subtitles) and fullscreen
      buttons sized like the built-ins and pinned at the FAR RIGHT of the
      control bar; CC opens the Flux subtitle menu (real mouse clicks included)
- [x] CSP fix: inline styles + Artplayer's runtime stylesheet now apply
      (previously blocked — subtitle size/background settings were no-ops)
- [x] Helix subtitle system kept (SRT/VTT/ASS, embedded tracks) + subtitle
      settings (size, background, delay) in the player settings panel
- [x] cursor:pointer on every clickable element
- [x] Sidebar Home/Watched jump straight to their views from anywhere
- [x] Search (debounced), multi-provider source scanning, Squirrel.Windows
      installer lifecycle

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
│           ├── components/      # TopBar, DetailTopBar, HomeView, ResultsView,
│           │                    # DetailsView, SourcesView, PlayerView
│           │                    # (Artplayer), SubtitleMenu, SettingsModal,
│           │                    # PosterCard, icons, ui
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
