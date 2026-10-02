/* ── Flux renderer: search, details, seasons & episodes ──────────────── */
(() => {
  'use strict';

  const CINEMETA_BASE = 'https://v3-cinemeta.strem.io';
  const EP_BATCH_SIZE = 50;   // Helix: single season with 50+ eps → 50-ep tabs

  const els = {
    input: document.getElementById('search'),
    clear: document.getElementById('clear'),
    home: document.getElementById('home'),
    homeLoading: document.getElementById('home-loading'),
    homeSetup: document.getElementById('home-setup'),
    homeError: document.getElementById('home-error'),
    homeErrorMsg: document.getElementById('home-error-msg'),
    homeRetry: document.getElementById('home-retry'),
    homeSetupBtn: document.getElementById('home-setup-btn'),
    homeBody: document.getElementById('home-body'),
    hero: document.getElementById('home-hero'),
    heroBg: document.getElementById('hero-bg'),
    heroServices: document.getElementById('hero-services'),
    heroTitle: document.getElementById('hero-title'),
    heroMeta: document.getElementById('hero-meta'),
    heroOverview: document.getElementById('hero-overview'),
    homeRows: document.getElementById('home-rows'),
    loading: document.getElementById('loading'),
    error: document.getElementById('error'),
    errorMsg: document.getElementById('error-msg'),
    empty: document.getElementById('empty'),
    resultsWrap: document.getElementById('results-wrap'),
    resultsTitle: document.getElementById('results-title'),
    resultsCount: document.getElementById('results-count'),
    grid: document.getElementById('grid'),
    content: document.getElementById('content'),
    details: document.getElementById('details'),
    backBtn: document.getElementById('back-btn'),
    detailsLoading: document.getElementById('details-loading'),
    detailsError: document.getElementById('details-error'),
    detailsContent: document.getElementById('details-content'),
    sourcesView: document.getElementById('sources-view'),
    sourcesTitle: document.getElementById('sources-title'),
    sourcesSub: document.getElementById('sources-sub'),
    sourcesStatus: document.getElementById('sources-status'),
    sourcesSearch: document.getElementById('sources-search'),
    sourcesSize: document.getElementById('sources-size'),
    sourcesNomatch: document.getElementById('sources-nomatch'),
    sourcesEmpty: document.getElementById('sources-empty'),
    sourcesList: document.getElementById('sources-list'),

    // player overlay
    playerView: document.getElementById('player-view'),
    playerBack: document.getElementById('player-back'),
    playerSwitch: document.getElementById('player-switch'),
    playerTitle: document.getElementById('player-title'),
    playerSub: document.getElementById('player-sub'),
    playerStage: document.getElementById('player-stage'),
    playerVideo: document.getElementById('player-video'),
    playerBuffering: document.getElementById('player-buffering'),
    playerFail: document.getElementById('player-fail'),
    playerFailMsg: document.getElementById('player-fail-msg'),
    playerFailBack: document.getElementById('player-fail-back'),
    playerControls: document.getElementById('player-controls'),
    playerSubOverlay: document.getElementById('player-sub-overlay'),
    playerSubmenu: document.getElementById('player-submenu'),
    psmRefresh: document.getElementById('psm-refresh'),
    psmClose: document.getElementById('psm-close'),
    psmStatus: document.getElementById('psm-status'),
    psmBody: document.getElementById('psm-body'),
    psmDelayMinus: document.getElementById('psm-delay-minus'),
    psmDelayPlus: document.getElementById('psm-delay-plus'),
    psmDelayReset: document.getElementById('psm-delay-reset'),
    psmDelayValue: document.getElementById('psm-delay-value'),
    pcPlay: document.getElementById('pc-play'),
    pcPlayIcon: document.getElementById('pc-play-icon'),
    pcCur: document.getElementById('pc-cur'),
    pcDur: document.getElementById('pc-dur'),
    pcSeek: document.getElementById('pc-seek'),
    pcMute: document.getElementById('pc-mute'),
    pcVolIcon: document.getElementById('pc-vol-icon'),
    pcCc: document.getElementById('pc-cc'),
    pcFs: document.getElementById('pc-fs'),

    // settings overlay
    settingsBtn: document.getElementById('settings-btn'),
    settingsView: document.getElementById('settings-view'),
    settingsAngle: document.getElementById('settings-angle'),
    settingsGpu: document.getElementById('settings-gpu'),
    settingsSaaKey: document.getElementById('settings-saa-key'),
    settingsSaaCountry: document.getElementById('settings-saa-country'),
    settingsSave: document.getElementById('settings-save'),
    settingsClose: document.getElementById('settings-close')
  };

  let debounceTimer = null;
  let searchSeq = 0;          // guards against stale search responses
  let detailsSeq = 0;         // guards against stale detail loads
  let seasonTabs = [];        // [{label, episodes}] for the open title
  let currentTab = 0;
  let resultsScrollTop = 0;   // restored when going back from details
  let currentMeta = null;     // meta of the open title
  let streamsRequestId = null; // active sources scan (null = none)
  let sourcesCache = [];       // all source rows of the open scan
  let lastEpisode = null;      // episode (or movie pseudo-ep) behind the sources view
  let sourceQuery = '';        // sources-view text filter
  let sourceSizeFilter = 'all';// 'all' | 'gt1gb' | 'lt1gb'
  let scanSummaryText = null;  // 'done' status line (null while scanning)
  let scanProviderCount = 0;   // providers announced by the init event

  // ── Home page state (Streaming Availability API) ───────────────────────
  let homeSeq = 0;            // guards against stale home responses
  let homeLoaded = false;     // a successful payload has been rendered
  let homeLoading = false;    // request in flight
  let detailsReturn = 'results'; // which view Esc/Back returns to
  let homeScrollTop = 0;      // home vertical scroll before details

  // ── Player state ───────────────────────────────────────────────────────
  let hls = null;              // hls.js instance while an HLS source plays
  let webviewEl = null;        // <webview> while an embed source plays
  let activeSource = null;     // the source being played
  let playedOnce = false;      // a frame actually rendered
  let failTimer = null;        // direct-link connection timeout

  // ── Subtitle state (Helix PlayerScreen subtitle block) ─────────────────
  let subGroups = [];          // [{language, variants:[{providerName,language,title,downloadUrl,format,extraData}]}]
  let subSelected = null;      // the loaded SubtitleVariant (null = none)
  let subCues = [];            // parsed cues of the loaded variant [{start,end,text}]
  let subDelay = 0;            // seconds; positive = subs show later
  let subEpisodeKey = '';      // episode the current subGroups belong to
  let subsRequestId = null;    // in-flight subtitle search
  let subsPending = 0;         // providers not finished yet
  let embeddedSubs = [];       // hls.js subtitleTracks [{id, name, lang}]
  let embeddedActive = null;   // active embedded track id (or null)
  let embeddedCues = new Map();// embedded track id → cues
  let subLoadingUrl = null;    // variant being downloaded (menu spinner)

  // ── Player chrome auto-hide state (fullscreen, mouse idle) ────────────
  let chromeIdleTimer = null;
  const CHROME_IDLE_MS = 2600;

  // ── Subtitle language whitelist (user setting) ─────────────────────────
  // Only these five languages are kept: English, French, Italian, Spanish,
  // Arabic. Everything else (embedded HLS tracks included) is dropped.
  const SUB_LANG_CODES = {
    en: 'English', eng: 'English',
    fr: 'French', fra: 'French', fre: 'French',
    it: 'Italian', ita: 'Italian',
    es: 'Spanish', spa: 'Spanish', esp: 'Spanish',
    ar: 'Arabic', ara: 'Arabic'
  };
  const SUB_LANG_NAMES = {
    english: 'English', french: 'French',
    italian: 'Italian', spanish: 'Spanish', arabic: 'Arabic'
  };

  // Match a language name or code ('en', 'eng', 'es-419', 'English') against
  // the whitelist; returns the canonical English name or null.
  function subLangLabel(raw) {
    const s = String(raw == null ? '' : raw).trim().toLowerCase();
    if (!s) return null;
    const noParen = s.replace(/\s*\([^)]*\)\s*$/, '').trim() || s;
    for (const cand of [s, noParen]) {
      if (SUB_LANG_NAMES[cand]) return SUB_LANG_NAMES[cand];
      if (SUB_LANG_CODES[cand]) return SUB_LANG_CODES[cand];
    }
    const m = /^([a-z]{2,3})(?:[-_][a-z0-9]{2,4})?$/.exec(noParen);
    if (m && SUB_LANG_CODES[m[1]]) return SUB_LANG_CODES[m[1]];
    return null;
  }

  // ── Subtitle parsing (port of Helix subtitle_parser.dart) ─────────────
  // Cues: {start, end, text} — seconds, text already cleaned.

  function subDetectFormat(text) {
    const head = text.slice(0, 300).trim().toLowerCase();
    if (head.startsWith('webvtt')) return 'vtt';
    if (head.includes('[script info]') || head.includes('[v4+ styles]') ||
        text.toLowerCase().includes('[events]')) return 'ass';
    return 'srt';
  }

  function subCleanInline(s) {
    return s
      .replace(/<[^>]+>/g, '')            // HTML tags like <i>, <b>, <font>
      .replace(/\{[^}]*\}/g, '')          // ASS formatting
      .replace(/\\N/g, '\n')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }

  function subToSec(h, m, s, ms) {
    const paddedMs = (ms + '000').substring(0, 3);
    return (parseInt(h, 10) || 0) * 3600 + (parseInt(m, 10) || 0) * 60 +
      (parseInt(s, 10) || 0) + (parseInt(paddedMs, 10) || 0) / 1000;
  }

  function subParseSrt(text) {
    const cues = [];
    const blocks = text.split(/\n{2,}/);
    const timingRe = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;
    for (const block of blocks) {
      const lines = block.split('\n').filter((l) => l.trim());
      if (lines.length < 2) continue;
      let timingIdx = /^\d+$/.test(lines[0].trim()) ? 1 : 0;
      if (timingIdx >= lines.length) continue;
      const m = timingRe.exec(lines[timingIdx]);
      if (!m) continue;
      const start = subToSec(m[1], m[2], m[3], m[4]);
      const end = subToSec(m[5], m[6], m[7], m[8]);
      const cleanText = subCleanInline(lines.slice(timingIdx + 1).join('\n'));
      if (cleanText) cues.push({ start, end, text: cleanText });
    }
    cues.sort((a, b) => a.start - b.start);
    return cues;
  }

  function subParseVtt(text) {
    const cues = [];
    const stripped = text.replace(/^WEBVTT[^\n]*\n+/i, '');
    const blocks = stripped.split(/\n{2,}/);
    const timingRe = /(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[,.](\d{1,3})\s*-->\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[,.](\d{1,3})/;
    for (const block of blocks) {
      const lines = block.split('\n').filter((l) => l.trim());
      if (!lines.length) continue;
      let timingIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('-->')) { timingIdx = i; break; }
      }
      if (timingIdx === -1) continue;
      const m = timingRe.exec(lines[timingIdx]);
      if (!m) continue;
      const start = subToSec(m[1] || '0', m[2], m[3], m[4]);
      const end = subToSec(m[5] || '0', m[6], m[7], m[8]);
      const cleanText = subCleanInline(lines.slice(timingIdx + 1).join('\n'));
      if (cleanText) cues.push({ start, end, text: cleanText });
    }
    cues.sort((a, b) => a.start - b.start);
    return cues;
  }

  function subParseAssTime(s) {
    const m = /(\d+):(\d{2}):(\d{2})\.(\d{1,3})/.exec(String(s).trim());
    if (!m) return NaN;
    return subToSec(m[1], m[2], m[3], (m[4] + '00').substring(0, 3));
  }

  function subParseAss(text) {
    const cues = [];
    const eventsIdx = text.toLowerCase().indexOf('[events]');
    if (eventsIdx === -1) return cues;
    const lines = text.slice(eventsIdx).split('\n');
    let format = null;
    for (const line of lines) {
      const trimmed = line.trim();
      if (/^format:/i.test(trimmed)) {
        format = trimmed.slice(7).split(',').map((s) => s.trim().toLowerCase());
        continue;
      }
      if (!/^dialogue:/i.test(trimmed) || !format) continue;
      const startIdx = format.indexOf('start');
      const endIdx = format.indexOf('end');
      const textIdx = format.indexOf('text');
      if (startIdx === -1 || endIdx === -1 || textIdx === -1) continue;

      // split respecting that text is the last field (may contain commas)
      const body = trimmed.slice(9);
      const parts = [];
      let buf = '';
      let count = 0;
      for (let i = 0; i < body.length; i++) {
        const c = body[i];
        if (c === ',' && count < format.length - 1) {
          parts.push(buf.trim());
          buf = '';
          count++;
        } else {
          buf += c;
        }
      }
      parts.push(buf);
      if (parts.length < format.length) continue;

      const start = subParseAssTime(parts[startIdx]);
      const end = subParseAssTime(parts[endIdx]);
      if (Number.isNaN(start) || Number.isNaN(end)) continue;
      const cleanText = parts[textIdx]
        .replace(/\{[^}]*\}/g, '')
        .replace(/\\N/g, '\n')
        .replace(/\\n/g, ' ')
        .replace(/\\h/g, ' ')
        .trim();
      if (cleanText) cues.push({ start, end, text: cleanText });
    }
    cues.sort((a, b) => a.start - b.start);
    return cues;
  }

  function subParse(text, format) {
    const raw = String(text || '')
      .replace(/^\uFEFF/, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
    const fmt = format || subDetectFormat(raw);
    if (fmt === 'vtt') return subParseVtt(raw);
    if (fmt === 'ass') return subParseAss(raw);
    return subParseSrt(raw);
  }

  // Binary search: index of the cue active at t, or -1 (Helix findActiveCueIndex)
  function findActiveCueIndex(cues, t) {
    let lo = 0;
    let hi = cues.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const c = cues[mid];
      if (t < c.start) hi = mid - 1;
      else if (t >= c.end) lo = mid + 1;
      else return mid;
    }
    return -1;
  }

  const ICON_PLAY = 'M8 5v14l11-7z';
  const ICON_PAUSE = 'M6 19h4V5H6v14zm8-14v14h4V5h-4z';
  const ICON_VOL = 'M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05A4.5 4.5 0 0 0 16.5 12z';
  const ICON_MUTE = 'M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0 0 21.5 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.3 8.3 0 0 0 3.69-1.81L19.73 21 21 19.73 4.27 3zM12 4L9.91 6.09 12 8.18V4z';

  // ── Data layer ────────────────────────────────────────────────────────
  // In Electron, network calls run in the main process (no CORS,
  // future-proof for stream scraping). Outside Electron (plain browser),
  // fall back to direct fetch — Cinemeta is CORS-enabled.

  async function searchCatalogDirect(type, query) {
    const url =
      CINEMETA_BASE +
      '/catalog/' + encodeURIComponent(type) +
      '/top/search=' + encodeURIComponent(query) + '.json';
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const body = await res.json();
    const metas = Array.isArray(body.metas) ? body.metas : [];
    return metas
      .map((m) => ({
        id: String(m.id ?? ''),
        name: String(m.name ?? 'Unknown'),
        poster: m.poster ? String(m.poster) : null,
        year:
          m.releaseInfo != null ? String(m.releaseInfo)
          : m.year != null ? String(m.year)
          : null,
        type: String(m.type ?? type),
        imdbRating:
          m.imdbRating != null ? String(m.imdbRating)
          : m.rating != null ? String(m.rating)
          : null
      }))
      .filter((m) => m.id && m.name && m.name !== 'Unknown');
  }

  async function getMeta(type, id) {
    if (window.fluxAPI && typeof window.fluxAPI.getMeta === 'function') {
      return window.fluxAPI.getMeta(type, id);
    }
    // Browser fallback (same request Helix makes)
    const num = (val) => {
      if (val == null) return null;
      const n = parseInt(val, 10);
      return Number.isNaN(n) ? null : n;
    };
    const url =
      CINEMETA_BASE +
      '/meta/' + encodeURIComponent(type) +
      '/' + encodeURIComponent(id) + '.json';
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const body = await res.json();
    const m = body && body.meta;
    if (!m) return null;
    return {
      id: String(m.id ?? id),
      type: String(m.type ?? type),
      name: String(m.name ?? 'Unknown'),
      poster: m.poster ? String(m.poster) : null,
      background: m.background ? String(m.background) : null,
      description: m.description ? String(m.description) : null,
      year: m.releaseInfo != null ? String(m.releaseInfo) : null,
      imdbRating: m.imdbRating != null ? String(m.imdbRating) : null,
      genres: Array.isArray(m.genres) ? m.genres.map(String) : [],
      runtime: m.runtime != null ? String(m.runtime) : null,
      videos: (Array.isArray(m.videos) ? m.videos : [])
        .map((v) => ({
          id: String(v.id ?? ''),
          title: String(v.title ?? v.name ?? 'Episode'),
          season: num(v.season),
          episode: num(v.episode ?? v.number),
          released: v.released ? String(v.released) : null,
          thumbnail: v.thumbnail ? String(v.thumbnail) : null,
          overview: String(v.overview ?? v.description ?? '')
        }))
        .filter((v) => v.id)
    };
  }

  async function doSearch(query) {
    if (window.fluxAPI && typeof window.fluxAPI.search === 'function') {
      return window.fluxAPI.search(query);
    }
    // Browser fallback: search movie + series in parallel, interleave
    const [movies, series] = await Promise.all([
      searchCatalogDirect('movie', query).catch(() => []),
      searchCatalogDirect('series', query).catch(() => [])
    ]);
    const mixed = [];
    const max = Math.max(movies.length, series.length);
    for (let i = 0; i < max; i++) {
      if (movies[i]) mixed.push(movies[i]);
      if (series[i]) mixed.push(series[i]);
    }
    return mixed;
  }

  // ── View switching ────────────────────────────────────────────────────
  const searchSections = () =>
    [els.home, els.loading, els.error, els.empty, els.resultsWrap];
  const detailsSections = () =>
    [els.detailsLoading, els.detailsError, els.detailsContent, els.sourcesView];

  function showSearch(section) {
    els.details.classList.add('hidden');
    searchSections().forEach((el) => el.classList.add('hidden'));
    if (section) section.classList.remove('hidden');
    if (section === els.home) {
      els.content.scrollTop = homeScrollTop;
      if (!homeLoaded && !homeLoading) loadHome();
    }
  }

  function showDetails(section) {
    searchSections().forEach((el) => el.classList.add('hidden'));
    detailsSections().forEach((el) => el.classList.add('hidden'));
    els.details.classList.remove('hidden');
    if (section) section.classList.remove('hidden');
  }

  // Kept for the search flow (used by runSearch / scheduleSearch)
  const show = (section) => showSearch(section);

  // ── Home page (Streaming Availability API) ────────────────────────────
  function homeState(el) {
    [els.homeLoading, els.homeSetup, els.homeError, els.homeBody]
      .forEach((s) => s.classList.add('hidden'));
    if (el) el.classList.remove('hidden');
  }

  async function loadHome(force) {
    const seq = ++homeSeq;
    homeLoading = true;
    if (force || !homeLoaded) homeState(els.homeLoading);
    try {
      const api = window.fluxAPI;
      if (!api || typeof api.getHome !== 'function') {
        if (seq === homeSeq) homeState(els.homeSetup);
        return;
      }
      const data = await api.getHome();
      if (seq !== homeSeq) return;          // a newer load superseded this one
      homeLoading = false;
      if (!data || data.noKey) {
        homeState(els.homeSetup);
      } else if (data.error) {
        els.homeErrorMsg.textContent = String(data.error);
        homeState(els.homeError);
      } else {
        renderHome(data);
        homeLoaded = true;
      }
    } catch (err) {
      if (seq !== homeSeq) return;
      homeLoading = false;
      els.homeErrorMsg.textContent =
        'Couldn\u2019t reach the Streaming Availability API. Check your connection and try again.';
      homeState(els.homeError);
    }
  }

  function renderHome(data) {
    renderHero(data.hero);
    els.homeRows.innerHTML = '';
    for (const row of data.rows || []) {
      if (!row.items || !row.items.length) continue;
      const section = document.createElement('div');
      section.className = 'home-row';
      const h2 = document.createElement('h2');
      h2.className = 'row-title';
      h2.textContent = row.title;
      const scroller = document.createElement('div');
      scroller.className = 'row-scroller';
      for (const item of row.items) {
        const card = makeCard(item, 'home');
        scroller.appendChild(card);
      }
      section.appendChild(h2);
      section.appendChild(scroller);
      els.homeRows.appendChild(section);
    }
    homeState(els.homeBody);
  }

  function renderHero(hero) {
    if (!hero) {
      els.hero.classList.add('hidden');
      return;
    }
    els.heroBg.src = hero.backdrop || hero.poster || '';
    els.heroBg.alt = hero.name + ' backdrop';
    els.heroBg.onerror = () => {
      if (hero.poster && els.heroBg.src !== hero.poster) {
        els.heroBg.src = hero.poster;
      } else {
        els.heroBg.removeAttribute('src');
      }
    };
    els.heroServices.innerHTML = '';
    for (const s of (hero.services || []).slice(0, 3)) {
      const chip = document.createElement('span');
      chip.className = 'hero-chip';
      chip.textContent = s.name;
      els.heroServices.appendChild(chip);
    }
    els.heroTitle.textContent = hero.name;
    const bits = [];
    if (hero.year) bits.push(hero.year);
    if (hero.imdbRating && hero.imdbRating !== 'null') {
      bits.push('\u2605 ' + hero.imdbRating);
    }
    bits.push(hero.type === 'series' ? 'Series' : 'Movie');
    if (hero.genres && hero.genres.length) bits.push(hero.genres.slice(0, 3).join(' \u00b7 '));
    els.heroMeta.textContent = bits.join('  \u00b7  ');
    els.heroOverview.textContent = hero.overview || '';
    els.hero.onclick = () => openDetails(hero, 'home');
    els.hero.classList.remove('hidden');
  }

  // ── Sources scan (episode click) ───────────────────────────────────────
  function stopScan() {
    if (streamsRequestId != null) {
      streamsRequestId = null;
      if (window.fluxAPI && typeof window.fluxAPI.cancelStreams === 'function') {
        window.fluxAPI.cancelStreams();
      }
    }
  }

  const GB = 1024 * 1024 * 1024;

  function fmtSize(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return null;
    if (bytes >= GB) return (bytes / GB).toFixed(2) + ' GB';
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return Math.max(1, Math.round(bytes / 1024)) + ' KB';
  }

  function makeSourceRow(src) {
    const row = document.createElement('div');
    row.className = 'source-row' + (src.format === 'Embed' ? ' embed' : '');

    const icon = document.createElement('div');
    icon.className = 'source-icon';
    icon.textContent = (src.provider || '?').charAt(0).toUpperCase();
    row.appendChild(icon);

    const info = document.createElement('div');
    info.className = 'source-info';

    const line = document.createElement('div');
    line.className = 'source-line';

    const name = document.createElement('span');
    name.className = 'source-name';
    name.textContent = src.title || src.provider || 'Source';
    line.appendChild(name);

    const format = document.createElement('span');
    format.className = 'source-format' +
      (src.format === 'Embed' ? ' f-embed' : src.format === 'HLS' ? ' f-hls' : src.format === 'DASH' ? ' f-dash' : ' f-mp4');
    format.textContent = src.format || 'LINK';
    line.appendChild(format);

    if (src.quality) {
      const q = document.createElement('span');
      q.className = 'source-quality';
      q.textContent = src.quality;
      line.appendChild(q);
    }

    const sizeLabel = fmtSize(src.sizeBytes);
    if (sizeLabel) {
      const s = document.createElement('span');
      s.className = 'source-size';
      s.textContent = sizeLabel;
      line.appendChild(s);
    }
    info.appendChild(line);

    let host = '';
    try { host = new URL(src.url).hostname.replace(/^www\./, ''); } catch (_) {}
    const desc = document.createElement('div');
    desc.className = 'source-desc';
    desc.textContent = [src.description, host].filter(Boolean).join(' \u00b7 ');
    info.appendChild(desc);

    row.appendChild(info);

    const play = document.createElement('div');
    play.className = 'source-play';
    play.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>';
    row.appendChild(play);

    row.addEventListener('click', () => openPlayer(src));

    return row;
  }

  function sourceMatches(src) {
    if (sourceQuery) {
      const hay = ((src.title || '') + ' ' + (src.provider || '') + ' ' +
        (src.description || '')).toLowerCase();
      if (!hay.includes(sourceQuery)) return false;
    }
    if (sourceSizeFilter === 'gt1gb' && (src.sizeBytes == null || src.sizeBytes <= GB)) return false;
    if (sourceSizeFilter === 'lt1gb' && (src.sizeBytes == null || src.sizeBytes >= GB)) return false;
    return true;
  }

  // Rebuild the sources list from the cache with the active filters applied.
  // Direct links stay on top, embed players pinned below them.
  function renderSources() {
    const direct = [];
    const embeds = [];
    let shown = 0;
    for (const src of sourcesCache) {
      if (!sourceMatches(src)) continue;
      shown++;
      (src.format === 'Embed' ? embeds : direct).push(src);
    }

    els.sourcesList.innerHTML = '';
    for (const src of direct.concat(embeds)) els.sourcesList.appendChild(makeSourceRow(src));

    els.sourcesEmpty.classList.toggle('hidden',
      !(scanSummaryText !== null && sourcesCache.length === 0));
    els.sourcesNomatch.classList.toggle('hidden',
      !(sourcesCache.length > 0 && shown === 0));

    let status;
    if (scanSummaryText !== null) {
      status = scanSummaryText;
    } else {
      status = 'Scanning ' + scanProviderCount + ' providers\u2026';
    }
    if (sourcesCache.length > 0 && (sourceQuery || sourceSizeFilter !== 'all')) {
      status += ' \u00b7 showing ' + shown + ' of ' + sourcesCache.length;
    }
    els.sourcesStatus.textContent = status;
  }

  function updateSourcesStatus(text) {
    els.sourcesStatus.textContent = text;
  }

  function handleStreamsEvent(evt) {
    // The main process streams events before the invoke() reply lands here,
    // so while 'pending' we adopt the requestId of the first init event.
    if (streamsRequestId === 'pending') {
      if (evt.kind !== 'init' || evt.requestId == null) return;
      streamsRequestId = evt.requestId;
    } else if (streamsRequestId == null || evt.requestId !== streamsRequestId) {
      return;
    }

    if (evt.kind === 'init') {
      scanProviderCount = evt.providers ? evt.providers.length : 0;
      scanSummaryText = null;
      renderSources();
      return;
    }

    if (evt.kind === 'provider') {
      for (const src of evt.sources || []) sourcesCache.push(src);
      renderSources();
      return;
    }

    if (evt.kind === 'done') {
      streamsRequestId = null;          // scan finished
      const direct = evt.directCount || 0;
      const embeds = evt.embedCount || 0;
      if (direct + embeds === 0) {
        scanSummaryText = 'Scan complete \u2014 no sources found';
      } else {
        const parts = [];
        if (direct) parts.push(direct + (direct === 1 ? ' direct link' : ' direct links'));
        if (embeds) parts.push(embeds + (embeds === 1 ? ' embed player' : ' embed players'));
        scanSummaryText = 'Scan complete \u2014 ' + parts.join(', ');
      }
      renderSources();
    }
  }

  async function openSources(ep) {
    if (!currentMeta) return;
    lastEpisode = ep;
    sourcesCache = [];
    sourceQuery = '';
    sourceSizeFilter = 'all';
    scanSummaryText = null;
    scanProviderCount = 0;
    els.sourcesSearch.value = '';
    els.sourcesSize.value = 'all';
    // New episode → the previously loaded subtitles belong to the old one
    if (window.fluxAPI && typeof window.fluxAPI.cancelSubtitles === 'function') {
      window.fluxAPI.cancelSubtitles().catch(() => {});
    }
    subsRequestId = null;
    subsPending = 0;
    subGroups = [];
    subSelected = null;
    subCues = [];
    subEpisodeKey = '';
    subLoadingUrl = null;
    embeddedSubs = [];
    embeddedActive = null;
    embeddedCues = new Map();
    els.playerSubOverlay.classList.add('hidden');
    els.playerSubOverlay.textContent = '';
    showDetails(els.sourcesView);
    els.sourcesList.innerHTML = '';
    els.sourcesEmpty.classList.add('hidden');
    els.sourcesNomatch.classList.add('hidden');
    const isSeries = currentMeta.type === 'series';
    els.sourcesTitle.textContent = isSeries
      ? 'S' + (ep.season ?? 1) + ' E' + (ep.episode ?? 1) + ' \u00b7 ' + ep.title
      : ep.title;
    els.sourcesSub.textContent = currentMeta.name;
    updateSourcesStatus('Contacting providers\u2026');

    stopScan();
    try {
      streamsRequestId = 'pending';    // adopt requestId from the init event
      const res = await window.fluxAPI.getStreams({
        type: currentMeta.type,
        imdbId: currentMeta.id,
        title: currentMeta.name,
        year: currentMeta.year,
        season: ep.season ?? 1,
        episode: ep.episode ?? 1
      });
      if (streamsRequestId === 'pending' && res && res.requestId != null) {
        streamsRequestId = res.requestId;  // fallback if init raced past us
      }
    } catch (_) {
      if (streamsRequestId === 'pending') streamsRequestId = null;
      updateSourcesStatus('Could not start the scan.');
    }
  }

  function closeSources() {
    closePlayer(true);          // player can't be open here, but stay safe
    stopScan();
    showDetails(els.detailsContent);
    els.content.scrollTop = 0;
  }

  // ── Player (Helix PlayerScreen equivalent, basic) ──────────────────────
  function setBuffering(on) {
    els.playerBuffering.classList.toggle('hidden', !on);
  }

  function showPlayerFail(msg) {
    clearTimeout(failTimer);
    failTimer = null;
    els.playerFailMsg.textContent =
      msg || 'The stream may be offline or blocked. Try a different source below.';
    els.playerBuffering.classList.add('hidden');
    els.playerFail.classList.remove('hidden');
  }

  function setPlayIcon(playing) {
    els.pcPlayIcon.querySelector('path')
      .setAttribute('d', playing ? ICON_PAUSE : ICON_PLAY);
  }

  function setVolIcon(muted) {
    els.pcVolIcon.querySelector('path').setAttribute('d', muted ? ICON_MUTE : ICON_VOL);
  }

  function fmtTime(t) {
    if (!Number.isFinite(t) || t < 0) return '0:00';
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = Math.floor(t % 60);
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) +
      ':' + String(s).padStart(2, '0');
  }

  // Register Referer/UA injection + CORS passthrough for this playback
  function applyPlayerRules(src) {
    if (!(window.fluxAPI && typeof window.fluxAPI.setPlayerRules === 'function')) return;
    const rules = { headers: [], corsHosts: [] };
    let host = '';
    try { host = new URL(src.url).hostname; } catch (_) {}
    if (host && src.headers) {
      rules.headers.push({ host, headers: src.headers });
    }
    // CORS: any host the other sources point at may serve segments after a
    // redirect; whitelisting them all is harmless (renderer-only traffic).
    const hosts = new Set();
    for (const s of sourcesCache) {
      try { hosts.add(new URL(s.url).hostname); } catch (_) {}
    }
    if (host) hosts.add(host);
    rules.corsHosts = [...hosts];
    window.fluxAPI.setPlayerRules(rules);
  }

  // ── Subtitles: search / menu / rendering (Helix PlayerSubtitleMenu) ────
  function subtitleSupports() {
    return window.fluxAPI && typeof window.fluxAPI.searchSubtitles === 'function';
  }

  function currentSubParams() {
    const isSeries = currentMeta && currentMeta.type === 'series';
    const yearMatch = currentMeta && currentMeta.year
      ? /^(\d{4})/.exec(String(currentMeta.year))
      : null;
    return {
      name: currentMeta ? currentMeta.name : '',
      imdbId: currentMeta ? currentMeta.id : null,   // Cinemeta ids are imdb tt-ids
      season: isSeries && lastEpisode ? lastEpisode.season : null,
      episode: isSeries && lastEpisode ? lastEpisode.episode : null,
      year: yearMatch ? parseInt(yearMatch[1], 10) : null
    };
  }

  function startSubSearch(force) {
    if (!subtitleSupports()) return;
    if (activeSource && activeSource.format === 'Embed') return;  // embeds manage their own subs
    const params = currentSubParams();
    if (!params.name && !params.imdbId) return;

    const key = [params.imdbId || params.name, params.season ?? '', params.episode ?? ''].join(':');
    if (!force && key === subEpisodeKey && subGroups.length) return;  // already have this episode
    subEpisodeKey = key;
    subGroups = [];
    subSelected = null;
    subCues = [];
    embeddedSubs = [];
    embeddedActive = null;
    embeddedCues = new Map();
    renderSubOverlay();
    if (!els.playerSubmenu.classList.contains('hidden')) renderSubmenu();

    subsPending = 4;
    updateSubStatus();
    window.fluxAPI.searchSubtitles(params).then((res) => {
      if (res && res.requestId != null) subsRequestId = res.requestId;
    }).catch(() => {
      subsPending = 0;
      updateSubStatus();
    });
  }

  function handleSubsEvent(payload) {
    if (!payload || payload.kind === undefined) return;
    if (subsRequestId != null && payload.requestId !== subsRequestId) return;

    if (payload.kind === 'batch' && Array.isArray(payload.variants)) {
      // merge batch (Helix _mergeSubtitleGroups: dedupe URLs, keep sort)
      const seen = new Set(subGroups.flatMap((g) => g.variants.map((v) => String(v.downloadUrl).toLowerCase())));
      for (const v of payload.variants) {
        if (!v || !v.downloadUrl) continue;
        const urlKey = String(v.downloadUrl).toLowerCase();
        if (seen.has(urlKey)) continue;
        seen.add(urlKey);
        const lang = String(v.language || 'Unknown');
        let group = subGroups.find((g) => g.language === lang);
        if (!group) {
          group = { language: lang, variants: [] };
          subGroups.push(group);
        }
        group.variants.push(v);
      }
      subGroups.sort((a, b) => a.language.localeCompare(b.language));
      if (!els.playerSubmenu.classList.contains('hidden')) renderSubmenu();
      updateSubStatus();
    } else if (payload.kind === 'done') {
      subsPending = 0;
      updateSubStatus();
      if (!els.playerSubmenu.classList.contains('hidden')) renderSubmenu();
    }
  }

  function updateSubStatus() {
    const searching = subsPending > 0;
    els.psmStatus.classList.toggle('hidden', !searching && subGroups.length > 0);
    if (searching) {
      els.psmStatus.textContent = subGroups.length
        ? 'Searching additional subtitles online\u2026'
        : 'Searching subtitles\u2026';
    } else if (!subGroups.length && !embeddedSubs.length) {
      els.psmStatus.classList.remove('hidden');
      els.psmStatus.textContent = 'No subtitles found for this title.';
    }
  }

  function fmtDelay(d) {
    const sign = d > 0 ? '+' : d < 0 ? '\u2212' : '';
    return sign + Math.abs(d).toFixed(1) + 's';
  }

  function setSubDelay(d) {
    subDelay = Math.max(-30, Math.min(30, Math.round(d * 10) / 10));
    els.psmDelayValue.textContent = fmtDelay(subDelay);
    renderSubOverlay();     // re-evaluate the visible cue immediately
  }

  function subsOff() {
    subSelected = null;
    subCues = [];
    if (hls) { try { hls.subtitleTrack = -1; } catch (_) {} }
    embeddedActive = null;
    els.pcCc.classList.remove('sub-active');
    renderSubOverlay();
    renderSubmenu();
  }

  async function selectVariant(variant) {
    subSelected = variant;
    subLoadingUrl = String(variant.downloadUrl);
    renderSubmenu();
    try {
      const res = await window.fluxAPI.downloadSubtitle(variant);
      if (subSelected !== variant) return;   // user picked another meanwhile
      if (!res || !res.content) {
        subLoadingUrl = null;
        subSelected = null;
        renderSubmenu();
        els.psmStatus.classList.remove('hidden');
        els.psmStatus.textContent = 'Failed to download subtitle \u2014 try another one.';
        return;
      }
      subCues = subParse(res.content, res.format === 'vtt' || res.format === 'ass' ? res.format : null);
      if (hls) { try { hls.subtitleTrack = -1; } catch (_) {} }   // external replaces embedded
      embeddedActive = null;
      subLoadingUrl = null;
      els.pcCc.classList.add('sub-active');
      renderSubOverlay();
      renderSubmenu();
    } catch (_) {
      subLoadingUrl = null;
      subSelected = null;
      renderSubmenu();
    }
  }

  function selectEmbedded(id) {
    embeddedActive = id;
    subSelected = null;
    subCues = [];
    if (hls) {
      try { hls.subtitleTrack = id; } catch (_) {}
    }
    els.pcCc.classList.add('sub-active');
    renderSubOverlay();
    renderSubmenu();
  }

  // Render the current cue (external cues or embedded cues, with delay)
  function renderSubOverlay() {
    const video = els.playerVideo;
    const overlay = els.playerSubOverlay;
    if (els.playerView.classList.contains('hidden')) return;

    let cues = null;
    if (embeddedActive != null && embeddedCues.has(embeddedActive)) {
      cues = embeddedCues.get(embeddedActive);
    } else if (subSelected && subCues.length) {
      cues = subCues;
    }

    let text = '';
    if (cues && cues.length) {
      const t = video.currentTime - subDelay;
      const idx = findActiveCueIndex(cues, t);
      if (idx !== -1) text = cues[idx].text || '';
    }

    if (text) {
      overlay.textContent = text;
      overlay.classList.remove('hidden');
    } else {
      overlay.textContent = '';
      overlay.classList.add('hidden');
    }
  }

  function closeSubmenu() {
    els.playerSubmenu.classList.add('hidden');
    scheduleChromeHide();
  }

  function toggleSubmenu() {
    if (els.playerSubmenu.classList.contains('hidden')) {
      wakeChrome();
      renderSubmenu();
      els.playerSubmenu.classList.remove('hidden');
      updateSubStatus();
    } else {
      closeSubmenu();
    }
  }

  function renderSubmenu() {
    const body = els.psmBody;
    body.innerHTML = '';

    // Off row (Helix: "Turn off subtitles")
    const off = document.createElement('div');
    off.className = 'psm-row psm-off' + (!subSelected && embeddedActive == null ? ' active' : '');
    off.textContent = 'Off';
    off.addEventListener('click', () => { wakeChrome(); subsOff(); });
    body.appendChild(off);

    // Embedded tracks (HLS WebVTT tracks — Helix "Embedded" section)
    if (embeddedSubs.length) {
      const head = document.createElement('div');
      head.className = 'psm-lang';
      head.textContent = 'Embedded';
      body.appendChild(head);
      for (const tr of embeddedSubs) {
        const row = document.createElement('div');
        row.className = 'psm-row' + (embeddedActive === tr.id ? ' active' : '');
        row.innerHTML =
          '<span class="psm-row-title"></span>' +
          '<span class="psm-badge">Track</span>';
        row.querySelector('.psm-row-title').textContent = tr.name || tr.lang || 'Subtitle track';
        row.addEventListener('click', () => { wakeChrome(); selectEmbedded(tr.id); });
        body.appendChild(row);
      }
    }

    // Language groups → variants
    for (const group of subGroups) {
      const head = document.createElement('div');
      head.className = 'psm-lang';
      head.textContent = group.language;
      body.appendChild(head);

      for (const variant of group.variants) {
        const row = document.createElement('div');
        const isActive = subSelected && String(subSelected.downloadUrl) === String(variant.downloadUrl);
        const isLoading = subLoadingUrl && String(subLoadingUrl) === String(variant.downloadUrl);
        row.className = 'psm-row' + (isActive ? ' active' : '');
        row.innerHTML =
          '<span class="psm-row-title"></span>' +
          '<span class="psm-badge">' + (variant.providerName || 'Sub') + '</span>' +
          (variant.format && variant.format !== 'srt'
            ? '<span class="psm-badge fmt">' + String(variant.format).toUpperCase() + '</span>'
            : '') +
          (isActive ? '<span class="psm-check">\u2713</span>' : '') +
          (isLoading ? '<span class="psm-spinner"></span>' : '');
        row.querySelector('.psm-row-title').textContent = variant.title || variant.language;
        row.title = variant.title || '';
        row.addEventListener('click', () => { wakeChrome(); if (!isActive && !isLoading) selectVariant(variant); });
        body.appendChild(row);
      }
    }
  }

  // ── Player chrome auto-hide (fullscreen + mouse idle) ──────────────────
  function chromeCanHide() {
    if (els.playerView.classList.contains('hidden')) return false;
    if (!document.fullscreenElement) return false;        // fullscreen only
    if (!els.playerFail.classList.contains('hidden')) return false;
    if (!els.playerSubmenu.classList.contains('hidden')) return false;
    if (els.playerVideo.classList.contains('hidden')) return false;
    if (els.playerVideo.paused) return false;             // paused keeps chrome
    return true;
  }

  function scheduleChromeHide() {
    clearTimeout(chromeIdleTimer);
    chromeIdleTimer = setTimeout(() => {
      if (chromeCanHide()) els.playerView.classList.add('player-idle');
    }, CHROME_IDLE_MS);
  }

  function wakeChrome() {
    els.playerView.classList.remove('player-idle');
    scheduleChromeHide();
  }

  function stopChromeHide() {
    clearTimeout(chromeIdleTimer);
    chromeIdleTimer = null;
    els.playerView.classList.remove('player-idle');
  }

  function playDirect(src) {
    const video = els.playerVideo;
    video.classList.remove('hidden');
    els.playerControls.classList.remove('hidden');
    setBuffering(true);

    const url = src.url;
    const isHls = src.format === 'HLS' || /\.m3u8($|\?)/i.test(url);
    const isDash = src.format === 'DASH' || /\.mpd($|\?)/i.test(url);

    if (isDash) {
      showPlayerFail('DASH streams aren\u2019t supported by the basic player yet. Pick another source below.');
      return;
    }

    // If nothing renders within 25s, treat the host as dead
    failTimer = setTimeout(() => {
      if (!playedOnce) showPlayerFail('Timed out while contacting the stream host.');
    }, 25000);

    if (isHls && window.Hls && Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        backBufferLength: 90,
        maxBufferLength: 30,
        // Subtitles are rendered by our own overlay (Helix-style styling +
        // delay support) instead of native <track> elements.
        renderTextTracksNatively: false
      });
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        // Embedded WebVTT subtitle tracks → menu (Helix "Embedded" section).
        // Only whitelisted languages are offered (en/fr/it/es/ar).
        try {
          embeddedSubs = (hls.subtitleTracks || [])
            .map((t) => ({
              id: t.id,
              name: subLangLabel(t.lang) || subLangLabel(t.name) || null,
              lang: t.lang
            }))
            .filter((t) => t.name)
            .map((t) => ({ id: t.id, name: t.name, lang: t.lang }));
        } catch (_) { embeddedSubs = []; }
        if (!els.playerSubmenu.classList.contains('hidden')) renderSubmenu();
        video.play().catch(() => {});
      });
      // cues for the active embedded track (renderTextTracksNatively: false)
      hls.on(Hls.Events.CUES_PARSED, (_e, data) => {
        if (!data) return;
        const cues = (data.cues || []).map((c) => ({
          start: c.start ?? c.startTime ?? 0,
          end: c.end ?? c.endTime ?? 0,
          text: c.text || c.content || ''
        })).filter((c) => c.text);
        cues.sort((a, b) => a.start - b.start);
        embeddedCues.set(data.track, cues);
        if (embeddedActive === data.track) renderSubOverlay();
      });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data || !data.fatal) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          try { hls.recoverMediaError(); return; } catch (_) {}
        }
        showPlayerFail('The stream host refused the request \u2014 it may be offline, geo-blocked, or require special headers.');
      });
      hls.loadSource(url);
      hls.attachMedia(video);
    } else if (isHls && video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
      video.play().catch(() => {});
    } else if (!isHls) {
      video.src = url;
      video.play().catch(() => {});
    } else {
      showPlayerFail('HLS playback is not supported in this environment.');
    }
  }

  function playEmbed(src) {
    const wv = document.createElement('webview');
    wv.setAttribute('partition', 'persist:embeds');
    wv.setAttribute('allowfullscreen', '');
    // Present as a regular Windows Chrome \u2014 some embed hosts reject
    // Electron/unknown user agents outright.
    wv.setAttribute('useragent',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');
    wv.setAttribute('src', src.url);
    wv.addEventListener('dom-ready', () => setBuffering(false));
    wv.addEventListener('did-finish-load', () => setBuffering(false));
    wv.addEventListener('did-fail-load', (e) => {
      if (e.errorCode === -3) return;   // aborted navigation \u2014 ignore
      showPlayerFail('The embed player failed to load (' + (e.errorDescription || e.errorCode) + ').');
    });
    webviewEl = wv;
    els.playerStage.appendChild(wv);
  }

  async function openPlayer(src) {
    activeSource = src;
    playedOnce = false;

    // Header text: show name + S/E for series, title for movies
    const isSeries = currentMeta && currentMeta.type === 'series';
    const se = isSeries && lastEpisode
      ? 'S' + (lastEpisode.season ?? 1) + ' E' + (lastEpisode.episode ?? 1) + ' \u00b7 ' + (lastEpisode.title || '')
      : '';
    els.playerTitle.textContent = currentMeta
      ? currentMeta.name + (isSeries ? ' \u2014 ' + se.split(' \u00b7 ')[0] : '')
      : (src.title || 'Now playing');
    els.playerSub.textContent = [
      se.split(' \u00b7 ').slice(1).join(' \u00b7 '),
      src.title || src.provider || 'Source'
    ].filter(Boolean).join('  \u2014  ');

    // Reset previous state
    els.playerFail.classList.add('hidden');
    els.playerBuffering.classList.remove('hidden');
    els.playerVideo.classList.add('hidden');
    els.playerControls.classList.add('hidden');
    els.playerView.classList.remove('hidden');
    stopChromeHide();
    els.playerSubmenu.classList.add('hidden');
    els.playerSubOverlay.classList.add('hidden');
    els.playerSubOverlay.textContent = '';
    els.pcCc.classList.toggle('sub-active', !!(subSelected || embeddedActive != null));

    applyPlayerRules(src);

    if (src.format === 'Embed') {
      playEmbed(src);
    } else {
      playDirect(src);
      // Auto-fetch subtitles for this episode/movie (Helix _fetchInitialSubtitles)
      startSubSearch(false);
    }
  }

  function closePlayer(silent) {
    if (els.playerView.classList.contains('hidden')) return;
    if (hls) { try { hls.destroy(); } catch (_) {} hls = null; }
    clearTimeout(failTimer);
    failTimer = null;

    const video = els.playerVideo;
    try { video.pause(); } catch (_) {}
    video.removeAttribute('src');
    try { video.load(); } catch (_) {}
    video.classList.add('hidden');
    els.playerControls.classList.add('hidden');
    setPlayIcon(false);

    if (webviewEl) {
      try { webviewEl.stop(); } catch (_) {}
      webviewEl.remove();
      webviewEl = null;
    }

    // Subtitles: cancel in-flight search, close menu, clear overlay.
    // subGroups/subSelected survive a source switch (Helix keeps the variant
    // across sources for the same episode); startSubSearch skips re-searching
    // while subEpisodeKey still matches.
    if (window.fluxAPI && typeof window.fluxAPI.cancelSubtitles === 'function') {
      window.fluxAPI.cancelSubtitles().catch(() => {});
    }
    subsRequestId = null;
    subsPending = 0;
    subLoadingUrl = null;
    embeddedSubs = [];
    embeddedActive = null;
    embeddedCues = new Map();
    els.playerSubmenu.classList.add('hidden');
    els.playerSubOverlay.classList.add('hidden');
    els.playerSubOverlay.textContent = '';

    els.playerBuffering.classList.add('hidden');
    els.playerFail.classList.add('hidden');
    els.playerView.classList.add('hidden');
    stopChromeHide();
    playedOnce = false;
    activeSource = null;

    if (window.fluxAPI && typeof window.fluxAPI.clearPlayerRules === 'function') {
      window.fluxAPI.clearPlayerRules();
    }
    if (!silent) showDetails(els.sourcesView);   // back to the source list
  }

  function wirePlayerControls() {
    const video = els.playerVideo;

    els.playerBack.addEventListener('click', () => closePlayer());
    els.playerSwitch.addEventListener('click', () => closePlayer());
    els.playerFailBack.addEventListener('click', () => closePlayer());

    els.pcPlay.addEventListener('click', () => {
      if (video.paused) video.play().catch(() => {});
      else video.pause();
    });

    els.pcMute.addEventListener('click', () => {
      video.muted = !video.muted;
      setVolIcon(video.muted);
    });

    els.pcFs.addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else els.playerStage.requestFullscreen().catch(() => {});
    });

    els.pcSeek.addEventListener('input', () => {
      const d = video.duration;
      if (Number.isFinite(d) && d > 0) {
        video.currentTime = (parseFloat(els.pcSeek.value) / 100) * d;
      }
      wakeChrome();
    });

    // Subtitle menu (CC button)
    els.pcCc.addEventListener('click', () => toggleSubmenu());
    els.psmClose.addEventListener('click', () => closeSubmenu());
    els.psmRefresh.addEventListener('click', () => {
      wakeChrome();
      startSubSearch(true);
    });
    els.psmDelayMinus.addEventListener('click', () => { wakeChrome(); setSubDelay(subDelay - 0.1); });
    els.psmDelayPlus.addEventListener('click', () => { wakeChrome(); setSubDelay(subDelay + 0.1); });
    els.psmDelayReset.addEventListener('click', () => { wakeChrome(); setSubDelay(0); });

    // Click outside the subtitle menu closes it. composedPath() is used
    // because selecting a row rebuilds the menu list synchronously, which
    // detaches the clicked row before the event finishes bubbling (a plain
    // e.target.closest() on the detached node would misread it as "outside").
    els.playerView.addEventListener('click', (e) => {
      if (els.playerSubmenu.classList.contains('hidden')) return;
      const path = e.composedPath ? e.composedPath() : [];
      for (const node of path) {
        if (node && (node.id === 'player-submenu' || node.id === 'pc-cc')) return;
      }
      closeSubmenu();
    });

    // Chrome auto-hide: any mouse movement wakes the controls; after
    // CHROME_IDLE_MS of stillness in fullscreen + playing, they fade out.
    els.playerView.addEventListener('mousemove', () => {
      if (els.playerView.classList.contains('player-idle') || document.fullscreenElement) wakeChrome();
    });
    document.addEventListener('fullscreenchange', () => {
      if (document.fullscreenElement) {
        wakeChrome();
      } else {
        stopChromeHide();           // leaving fullscreen always shows chrome
      }
    });

    video.addEventListener('play', () => {
      setPlayIcon(true);
      scheduleChromeHide();         // resuming re-arms the idle hide
    });
    video.addEventListener('pause', () => {
      setPlayIcon(false);
      wakeChrome();                 // paused → keep controls visible
    });
    video.addEventListener('loadedmetadata', () => {
      els.pcDur.textContent = fmtTime(video.duration);
    });
    video.addEventListener('timeupdate', () => {
      els.pcCur.textContent = fmtTime(video.currentTime);
      const d = video.duration;
      if (Number.isFinite(d) && d > 0) {
        els.pcSeek.value = String((video.currentTime / d) * 100);
      }
      renderSubOverlay();           // subtitle cue step
    });
    video.addEventListener('playing', () => {
      playedOnce = true;
      clearTimeout(failTimer);
      failTimer = null;
      setBuffering(false);
      els.playerFail.classList.add('hidden');
    });
    video.addEventListener('waiting', () => {
      if (!els.playerFail.classList.contains('hidden')) return;
      setBuffering(true);
    });
    video.addEventListener('error', () => {
      if (!video.currentSrc) return;      // teardown clears src \u2014 ignore
      showPlayerFail('Playback failed \u2014 the file could not be decoded or reached. Try another source.');
    });
  }
  wirePlayerControls();

  if (window.fluxAPI && typeof window.fluxAPI.onStreamsProgress === 'function') {
    window.fluxAPI.onStreamsProgress(handleStreamsEvent);
  }
  if (window.fluxAPI && typeof window.fluxAPI.onSubsProgress === 'function') {
    window.fluxAPI.onSubsProgress(handleSubsEvent);
  }

  // ── Search rendering ──────────────────────────────────────────────────
  function makeCard(item, from) {
    const card = document.createElement('div');
    card.className = 'card';
    card.title = item.name;
    card.addEventListener('click', () => openDetails(item, from || 'results'));

    const wrap = document.createElement('div');
    wrap.className = 'poster-wrap';

    if (item.poster) {
      const img = document.createElement('img');
      img.src = item.poster;
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.alt = item.name + ' poster';
      img.addEventListener('error', () => {
        img.remove();
        const fb = document.createElement('div');
        fb.className = 'poster-fallback';
        fb.textContent = '\uD83C\uDFAC';
        wrap.appendChild(fb);
      });
      wrap.appendChild(img);
    } else {
      const fb = document.createElement('div');
      fb.className = 'poster-fallback';
      fb.textContent = '\uD83C\uDFAC';
      wrap.appendChild(fb);
    }

    if (item.imdbRating && item.imdbRating !== 'null') {
      const chip = document.createElement('span');
      chip.className = 'rating-chip';
      chip.textContent = '\u2605 ' + item.imdbRating;
      wrap.appendChild(chip);
    }

    const badge = document.createElement('span');
    badge.className = 'type-badge ' + (item.type === 'series' ? 'series' : 'movie');
    badge.textContent = item.type === 'series' ? 'Series' : 'Movie';
    wrap.appendChild(badge);

    const meta = document.createElement('div');
    meta.className = 'card-meta';

    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = item.name;

    const sub = document.createElement('div');
    sub.className = 'card-sub';
    sub.textContent = item.year || '';

    meta.appendChild(title);
    meta.appendChild(sub);

    card.appendChild(wrap);
    card.appendChild(meta);
    return card;
  }

  function renderResults(query, items) {
    els.resultsTitle.textContent = 'Results for \u201C' + query + '\u201D';
    els.resultsCount.textContent =
      items.length + (items.length === 1 ? ' title' : ' titles');
    els.grid.innerHTML = '';
    for (const item of items) els.grid.appendChild(makeCard(item, 'results'));
    showSearch(els.resultsWrap);
  }

  // ── Seasons & episodes (Helix: player_episodes_panel.dart pattern) ────
  function buildSeasonTabs(videos) {
    const bySeason = new Map();
    for (const v of videos) {
      const s = v.season ?? 1;
      if (!bySeason.has(s)) bySeason.set(s, []);
      bySeason.get(s).push(v);
    }
    for (const list of bySeason.values()) {
      list.sort((a, b) => (a.episode ?? 0) - (b.episode ?? 0));
    }

    const numeric = [...bySeason.keys()].filter((s) => s > 0).sort((a, b) => a - b);
    const hasSpecials = bySeason.has(0);

    const tabs = [];
    // Helix behavior: one season with 50+ episodes → 50-episode tabs
    if (numeric.length === 1 && !hasSpecials &&
        bySeason.get(numeric[0]).length >= EP_BATCH_SIZE) {
      const eps = bySeason.get(numeric[0]);
      for (let i = 0; i < eps.length; i += EP_BATCH_SIZE) {
        const batch = eps.slice(i, i + EP_BATCH_SIZE);
        tabs.push({
          label: 'Episodes ' + batch[0].episode + '\u2013' + batch[batch.length - 1].episode,
          episodes: batch
        });
      }
    } else {
      for (const s of numeric) {
        tabs.push({ label: 'Season ' + s, episodes: bySeason.get(s) });
      }
      if (hasSpecials) {
        tabs.push({ label: 'Specials', episodes: bySeason.get(0) });
      }
    }
    return tabs;
  }

  function formatAirDate(released) {
    if (!released) return '';
    const d = new Date(released);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function makeThumb(src, alt, fallbackText) {
    const wrap = document.createElement('div');
    wrap.className = 'ep-thumb';
    if (src) {
      const img = document.createElement('img');
      img.src = src;
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.alt = alt;
      img.addEventListener('error', () => {
        img.remove();
        const fb = document.createElement('div');
        fb.className = 'ep-thumb-fallback';
        fb.textContent = fallbackText || '\uD83C\uDFAC';
        wrap.appendChild(fb);
      });
      wrap.appendChild(img);
    } else {
      const fb = document.createElement('div');
      fb.className = 'ep-thumb-fallback';
      fb.textContent = fallbackText || '\uD83C\uDFAC';
      wrap.appendChild(fb);
    }
    return wrap;
  }

  function renderSeasonTabs() {
    const row = document.createElement('div');
    row.className = 'seasons-row';
    row.id = 'seasons-row';

    seasonTabs.forEach((tab, idx) => {
      const chip = document.createElement('button');
      chip.className = 'season-chip' + (idx === currentTab ? ' active' : '');
      chip.textContent = tab.label;
      chip.addEventListener('click', () => {
        if (currentTab === idx) return;
        currentTab = idx;
        row.querySelectorAll('.season-chip').forEach((c, i) =>
          c.classList.toggle('active', i === currentTab));
        renderEpisodeList(tab);
      });
      row.appendChild(chip);
    });
    return row;
  }

  function renderEpisodeList(tab) {
    const old = document.getElementById('episodes-list');
    if (old) old.remove();

    const list = document.createElement('div');
    list.className = 'episodes';
    list.id = 'episodes-list';

    for (const ep of tab.episodes) {
      const rowEl = document.createElement('div');
      rowEl.className = 'episode-row clickable';
      rowEl.title = 'Find sources for this episode';
      rowEl.addEventListener('click', () => openSources(ep));

      rowEl.appendChild(makeThumb(
        ep.thumbnail, ep.title,
        ep.episode != null ? String(ep.episode) : '\uD83C\uDFAC'));

      const info = document.createElement('div');
      info.className = 'ep-info';

      const line = document.createElement('div');
      line.className = 'ep-line';

      if (ep.season != null && ep.episode != null) {
        const num = document.createElement('span');
        num.className = 'ep-num';
        num.textContent = 'S' + ep.season + ' E' + ep.episode;
        line.appendChild(num);
      }

      const title = document.createElement('span');
      title.className = 'ep-title';
      title.textContent = ep.title;
      line.appendChild(title);

      const date = document.createElement('div');
      date.className = 'ep-date';
      date.textContent = formatAirDate(ep.released);

      const overview = document.createElement('div');
      overview.className = 'ep-overview';
      overview.textContent = ep.overview || '';
      if (ep.overview) overview.title = ep.overview;

      info.appendChild(line);
      if (date.textContent) info.appendChild(date);
      info.appendChild(overview);

      rowEl.appendChild(info);

      const chev = document.createElement('div');
      chev.className = 'ep-chev';
      chev.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>';
      rowEl.appendChild(chev);

      list.appendChild(rowEl);
    }

    els.detailsContent.appendChild(list);
  }

  function renderDetails(meta) {
    currentMeta = meta;
    els.detailsContent.innerHTML = '';
    els.detailsContent.scrollTop = 0;

    // ── Hero: backdrop, poster, title, meta line, description ──
    const hero = document.createElement('div');
    hero.className = 'hero';

    if (meta.background) {
      const bg = document.createElement('img');
      bg.className = 'hero-bg';
      bg.src = meta.background;
      bg.referrerPolicy = 'no-referrer';
      bg.alt = '';
      bg.addEventListener('error', () => bg.remove());
      hero.appendChild(bg);
    }

    const heroBody = document.createElement('div');
    heroBody.className = 'hero-body';

    const poster = document.createElement('div');
    poster.className = 'hero-poster';
    poster.appendChild(makeThumb(meta.poster, meta.name + ' poster', meta.name));
    heroBody.appendChild(poster);

    const heroInfo = document.createElement('div');
    heroInfo.className = 'hero-info';

    const name = document.createElement('h1');
    name.className = 'hero-title';
    name.textContent = meta.name;
    heroInfo.appendChild(name);

    const metaLine = document.createElement('div');
    metaLine.className = 'hero-meta';

    if (meta.imdbRating && meta.imdbRating !== 'null') {
      const rating = document.createElement('span');
      rating.className = 'hero-rating';
      rating.textContent = '\u2605 ' + meta.imdbRating;
      metaLine.appendChild(rating);
    }
    if (meta.year) {
      const year = document.createElement('span');
      year.textContent = meta.year;
      metaLine.appendChild(year);
    }
    if (meta.runtime) {
      const rt = document.createElement('span');
      rt.textContent = meta.runtime;
      metaLine.appendChild(rt);
    }
    for (const g of meta.genres.slice(0, 3)) {
      const chip = document.createElement('span');
      chip.className = 'genre-chip';
      chip.textContent = g;
      metaLine.appendChild(chip);
    }
    heroInfo.appendChild(metaLine);

    if (meta.description) {
      const desc = document.createElement('p');
      desc.className = 'hero-desc';
      desc.textContent = meta.description;
      heroInfo.appendChild(desc);
    }

    heroBody.appendChild(heroInfo);
    hero.appendChild(heroBody);
    els.detailsContent.appendChild(hero);

    // ── Series: season tabs + episode list ──
    if (meta.type === 'series' && meta.videos.length > 0) {
      seasonTabs = buildSeasonTabs(meta.videos);
      currentTab = 0;

      const head = document.createElement('div');
      head.className = 'episodes-header';

      const headTitle = document.createElement('h2');
      headTitle.textContent = 'Episodes';
      const headCount = document.createElement('span');
      headCount.className = 'episodes-count';
      headCount.textContent = meta.videos.length + ' total';
      head.appendChild(headTitle);
      head.appendChild(headCount);
      els.detailsContent.appendChild(head);

      els.detailsContent.appendChild(renderSeasonTabs());
      renderEpisodeList(seasonTabs[currentTab]);
    } else if (meta.type === 'series') {
      const note = document.createElement('div');
      note.className = 'coming-note';
      note.textContent = 'No episode data available for this series yet.';
      els.detailsContent.appendChild(note);
    } else {
      // Movie — find sources for the feature film
      const cta = document.createElement('div');
      cta.className = 'coming-note';
      const btn = document.createElement('button');
      btn.className = 'find-sources-btn';
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M8 5v14l11-7z"/></svg><span>Find sources</span>';
      btn.addEventListener('click', () =>
        openSources({ title: meta.name, season: 1, episode: 1 }));
      cta.appendChild(btn);
      els.detailsContent.appendChild(cta);
    }
  }

  // ── Details orchestration ─────────────────────────────────────────────
  async function openDetails(item, from) {
    const seq = ++detailsSeq;
    currentMeta = null;
    stopScan();
    detailsReturn = from === 'home' ? 'home' : 'results';
    if (detailsReturn === 'home') homeScrollTop = els.content.scrollTop;
    else resultsScrollTop = els.content.scrollTop;
    showDetails(els.detailsLoading);
    els.content.scrollTop = 0;
    try {
      const meta = await getMeta(item.type, item.id);
      if (seq !== detailsSeq) return;     // another title was opened meanwhile
      if (!meta) throw new Error('no meta');
      renderDetails(meta);
      showDetails(els.detailsContent);
    } catch (err) {
      if (seq !== detailsSeq) return;
      showDetails(els.detailsError);
    }
  }

  function closeDetails() {
    detailsSeq++;                          // invalidate in-flight loads
    closePlayer(true);
    stopScan();
    if (detailsReturn === 'home') {
      showSearch(els.home);
    } else {
      showSearch(els.resultsWrap);
      els.content.scrollTop = resultsScrollTop;
    }
  }

  // ── Search orchestration ──────────────────────────────────────────────
  async function runSearch(query) {
    const seq = ++searchSeq;
    detailsSeq++;                          // close/invalidate details view
    closePlayer(true);
    stopScan();
    showSearch(els.loading);
    try {
      const items = await doSearch(query);
      if (seq !== searchSeq) return;
      if (items.length === 0) {
        showSearch(els.empty);
      } else {
        renderResults(query, items);
      }
    } catch (err) {
      if (seq !== searchSeq) return;
      els.errorMsg.textContent =
        'Couldn\u2019t reach the search service. Check your connection and try again.';
      showSearch(els.error);
    }
  }

  function scheduleSearch(query) {
    clearTimeout(debounceTimer);
    if (!query) {
      searchSeq++;
      els.clear.classList.remove('visible');
      showSearch(els.home);
      return;
    }
    els.clear.classList.add('visible');
    debounceTimer = setTimeout(() => runSearch(query), 400);
  }

  // ── Events ────────────────────────────────────────────────────────────
  els.input.addEventListener('input', () => scheduleSearch(els.input.value.trim()));
  els.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(debounceTimer);
      const q = els.input.value.trim();
      if (q) runSearch(q);
    }
  });

  // Global Esc: settings → subtitle menu → player → sources → episodes → results
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!els.settingsView.classList.contains('hidden')) {
      closeSettings();          // Esc in settings → close just the dialog
      return;
    }
    if (!els.playerView.classList.contains('hidden')) {
      if (!els.playerSubmenu.classList.contains('hidden')) {
        closeSubmenu();            // Esc in subtitle menu → close just the menu
        return;
      }
      closePlayer();               // Esc in player → back to sources
      return;
    }
    if (!els.details.classList.contains('hidden')) {
      if (!els.sourcesView.classList.contains('hidden')) {
        closeSources();              // Esc in sources → back to episodes
      } else {
        closeDetails();              // Esc in details → back to results
      }
      return;
    }
    els.input.value = '';
    scheduleSearch('');
    els.input.focus();
  });

  els.clear.addEventListener('click', () => {
    els.input.value = '';
    scheduleSearch('');
    els.input.focus();
  });

  els.backBtn.addEventListener('click', () => {
    if (!els.sourcesView.classList.contains('hidden')) closeSources();
    else closeDetails();
  });

  // Sources toolbar: text filter + size dropdown
  els.sourcesSearch.addEventListener('input', () => {
    sourceQuery = els.sourcesSearch.value.trim().toLowerCase();
    renderSources();
  });
  els.sourcesSize.addEventListener('change', () => {
    sourceSizeFilter = els.sourcesSize.value;
    renderSources();
  });

  // ── Settings (graphics backend, Streaming Availability API key) ───────
  let settingsLoaded = false;
  let settingsSaving = false;
  let settingsAngleAtLoad = null;   // to detect ANGLE changes (needs relaunch)

  function syncSaveLabel() {
    const changed = settingsAngleAtLoad != null &&
      els.settingsAngle.value !== settingsAngleAtLoad;
    if (!settingsSaving) {
      els.settingsSave.textContent = changed ? 'Save & Restart' : 'Save';
    }
  }

  function closeSettings() {
    els.settingsView.classList.add('hidden');
  }

  async function openSettings() {
    els.settingsView.classList.remove('hidden');
    els.settingsSave.disabled = false;
    els.settingsSave.textContent = 'Save';
    els.settingsGpu.textContent = 'Checking GPU\u2026';

    // dropdown options come from main (kept in sync with settings.js)
    if (!settingsLoaded && window.fluxAPI && typeof window.fluxAPI.getSettings === 'function') {
      try {
        const s = await window.fluxAPI.getSettings();
        if (s) {
          const list = Array.isArray(s.backends) && s.backends.length
            ? s.backends
            : [{ value: 'default', label: 'Default' }];
          els.settingsAngle.innerHTML = '';
          for (const b of list) {
            const opt = document.createElement('option');
            opt.value = b.value;
            opt.textContent = b.label;
            els.settingsAngle.appendChild(opt);
          }
          els.settingsAngle.value = s.angleBackend || 'd3d9';
          els.settingsSaaKey.value = s.saaApiKey || '';
          els.settingsSaaCountry.value = s.saaCountry || 'us';
          settingsAngleAtLoad = els.settingsAngle.value;
          settingsLoaded = true;
          syncSaveLabel();
        }
      } catch (_) { /* leave dropdown as-is */ }
    }

    if (window.fluxAPI && typeof window.fluxAPI.getGpuInfo === 'function') {
      try {
        const gpu = await window.fluxAPI.getGpuInfo();
        els.settingsGpu.textContent = gpu && gpu.renderer
          ? 'Active renderer: ' + (gpu.vendor ? gpu.vendor + ' ' : '') + gpu.renderer
          : 'Active renderer: unavailable';
      } catch (_) {
        els.settingsGpu.textContent = 'Active renderer: unavailable';
      }
    } else {
      els.settingsGpu.textContent = 'Active renderer: unavailable';
    }
  }

  async function saveAndRestart() {
    if (settingsSaving) return;
    settingsSaving = true;
    els.settingsSave.disabled = true;
    els.settingsSave.textContent = 'Saving\u2026';
    const angleChanged = settingsAngleAtLoad != null &&
      els.settingsAngle.value !== settingsAngleAtLoad;
    try {
      if (window.fluxAPI && typeof window.fluxAPI.saveSettings === 'function') {
        await window.fluxAPI.saveSettings({
          angleBackend: els.settingsAngle.value,
          saaApiKey: els.settingsSaaKey.value.trim(),
          saaCountry: els.settingsSaaCountry.value.trim()
        });
      }
      if (angleChanged && window.fluxAPI && typeof window.fluxAPI.relaunchApp === 'function') {
        els.settingsSave.textContent = 'Restarting\u2026';
        await window.fluxAPI.relaunchApp();
        // If relaunch never fires (stubs / failure), restore the button.
        setTimeout(() => {
          settingsSaving = false;
          els.settingsSave.disabled = false;
          els.settingsSave.textContent = 'Save & Restart';
        }, 1500);
        return;
      }
      // No ANGLE change: no restart needed — just refresh the home page
      // (the API key or country may have changed).
      settingsAngleAtLoad = els.settingsAngle.value;
      settingsSaving = false;
      els.settingsSave.disabled = false;
      els.settingsSave.textContent = 'Saved \u2713';
      homeLoaded = false;
      loadHome(true);
      setTimeout(() => {
        closeSettings();
        syncSaveLabel();
      }, 650);
    } catch (_) {
      settingsSaving = false;
      els.settingsSave.disabled = false;
      els.settingsSave.textContent = 'Save';
    }
  }

  els.settingsBtn.addEventListener('click', () => { openSettings(); });
  els.settingsClose.addEventListener('click', () => closeSettings());
  els.settingsSave.addEventListener('click', () => { saveAndRestart(); });
  els.settingsAngle.addEventListener('change', syncSaveLabel);
  els.settingsView.addEventListener('click', (e) => {
    if (e.target === els.settingsView) closeSettings();   // click on backdrop
  });

  // ── Home events + initial load ─────────────────────────────────────────
  els.homeRetry.addEventListener('click', () => loadHome(true));
  els.homeSetupBtn.addEventListener('click', () => openSettings());
  showSearch(els.home);   // app opens straight onto the home page
})();
