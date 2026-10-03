# Flux

A lightweight streaming app for Windows, built with **Electron + React + Vite** (plain JavaScript, no TypeScript), styled with **Tailwind CSS**.

Flux uses the same metadata source as [Helix](https://github.com/etb190/Helix) (the Stremio Cinemeta addon) to search movies & series, and a home page filled by the Streaming Availability API (daily Top 10s, popular per service, new & leaving soon) mixed with TMDB trending.

## Status (v0.19.0)

- [x] REAL Netflix app icon: the official red N ribbon on a black tile
      (window, taskbar, installer .ico)
- [x] Custom frameless title bar: the Windows chrome (minimize / maximize /
      close) is gone — replaced by a black bar with the FLUX wordmark in
      Netflix red on the left and custom-made square window buttons on the
      right (close hovers red); the bar is a drag region, double-click
      maximizes, and the player top bar is draggable too
- [x] Hero buttons equalized: Play / Trailer / plus all render at exactly
      40px (the trailer button used to grow to 42px via padding + border)
- [x] "Want to watch" list: new sidebar tab with its own page (search, add,
      remove); the plus button in the details hero opens a square popup on
      top of the screen offering **Want to watch** and **Watched**, with a
      checkmark on the list(s) the title is already in; the two lists are
      mutually exclusive (enforced in the main-process library)
- [x] Size dropdown fully rebuilt as a DOM menu — the native select popup is
      drawn by Windows and stays rounded no matter what CSS says; the new
      button + popup are square, the popup shows a check on the active
      option, outside click / Esc closes it (Esc does not navigate away)
- [x] Zero border-radius policy (kept): every box, button, card, pill,
      input, popup and dropdown is perfectly square
- [x] Text cleanup: the "Home data by..." attribution line under the home
      rows and the "Keep track of movies &..." paragraph on the Watched
      page are gone; the sidebar shows only the nav buttons (no "Menu"
      label) and the FLUX brand lives in the title bar
- [x] Trailers play through a browser-native YouTube iframe on a localhost
      host page (Error 153 fix); never recorded in Continue watching;
      Return lands back on the details screen
- [x] Details page: plain "Series" / "Movie" pill, info card trimmed to
      genre + country, tightened spacing, one-black background, season pill
      buttons + episode cards in scrollable rows with edge arrows
- [x] Light-black dark mode: neutral gray stack (no blue tint) — #121212 main,
      #0d0d0d sidebar, #1a1a1a cards, red #E50914 accent, Inter font
- [x] Home page: square-cornered 16:9 backdrop cards with a tiny 3px gap,
      arrow-paged carousels, square + wide topbar search, no hero banner
- [x] One-layer details flow: back circle, breadcrumb (Movies | Genre | Title)
      and search live INSIDE the content layer; no settings gear anywhere
- [x] Sources view: uniform server cards (no "recommended" highlighting),
      format/quality chips, operational badge, Stream Now actions
- [x] Continue Watching: first row, S/E + time-left badge, red progress bar,
      same-source resume from the saved timestamp, hover x dismiss (persisted)
- [x] Player: **Artplayer** engine + hls.js — CC (subtitles) and fullscreen
      buttons sized like the built-ins and pinned at the FAR RIGHT of the
      control bar; subtitle settings (size, background, delay) work
- [x] Helix subtitle system kept (SRT/VTT/ASS, embedded tracks)
- [x] cursor:pointer on every clickable element
- [x] Sidebar Home/Watched/Want-to-watch jump straight to their views
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
│   │   ├── trailerserver.js     # localhost host page for YouTube trailers
│   │   ├── library.js           # history + watched + want-to-watch store
│   │   └── settings.js          # persisted settings (v3)
│   ├── preload/index.js         # contextBridge fluxAPI
│   └── renderer/                # React app (Vite + Tailwind v4)
│       ├── index.html
│       ├── public/icon.png
│       └── src/
│           ├── main.jsx         # entry + error boundary
│           ├── App.jsx          # view machine, Esc chain, orchestration
│           ├── components/      # TitleBar (frameless chrome), SideBar, TopBar,
│           │                    # DetailTopBar, HomeView, ResultsView,
│           │                    # DetailsView, SourcesView, WatchedView
│           │                    # (Watched + Want to watch), PlayerView
│           │                    # (Artplayer), SubtitleMenu, PosterCard,
│           │                    # icons, ui
│           ├── hooks/           # useHome, useSearch, useStreams, useSubtitles
│           └── lib/             # subsParser, format helpers, cinemeta fallback
└── assets/                      # icon.png + icon.ico (Netflix N)
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
