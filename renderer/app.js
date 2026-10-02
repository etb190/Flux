/* ── Flux renderer: search, details, seasons & episodes ──────────────── */
(() => {
  'use strict';

  const CINEMETA_BASE = 'https://v3-cinemeta.strem.io';
  const EP_BATCH_SIZE = 50;   // Helix: single season with 50+ eps → 50-ep tabs

  const els = {
    input: document.getElementById('search'),
    clear: document.getElementById('clear'),
    welcome: document.getElementById('welcome'),
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
    providerChips: document.getElementById('provider-chips'),
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
    pcPlay: document.getElementById('pc-play'),
    pcPlayIcon: document.getElementById('pc-play-icon'),
    pcCur: document.getElementById('pc-cur'),
    pcDur: document.getElementById('pc-dur'),
    pcSeek: document.getElementById('pc-seek'),
    pcMute: document.getElementById('pc-mute'),
    pcVolIcon: document.getElementById('pc-vol-icon'),
    pcFs: document.getElementById('pc-fs')
  };

  let debounceTimer = null;
  let searchSeq = 0;          // guards against stale search responses
  let detailsSeq = 0;         // guards against stale detail loads
  let seasonTabs = [];        // [{label, episodes}] for the open title
  let currentTab = 0;
  let resultsScrollTop = 0;   // restored when going back from details
  let currentMeta = null;     // meta of the open title
  let streamsRequestId = null; // active sources scan (null = none)
  let providerRowEls = {};     // provider name -> chip element
  let sourcesCache = [];       // all source rows of the open scan
  let lastEpisode = null;      // episode (or movie pseudo-ep) behind the sources view

  // ── Player state ───────────────────────────────────────────────────────
  let hls = null;              // hls.js instance while an HLS source plays
  let webviewEl = null;        // <webview> while an embed source plays
  let activeSource = null;     // the source being played
  let playedOnce = false;      // a frame actually rendered
  let failTimer = null;        // direct-link connection timeout

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
    [els.welcome, els.loading, els.error, els.empty, els.resultsWrap];
  const detailsSections = () =>
    [els.detailsLoading, els.detailsError, els.detailsContent, els.sourcesView];

  function showSearch(section) {
    els.details.classList.add('hidden');
    searchSections().forEach((el) => el.classList.add('hidden'));
    if (section) section.classList.remove('hidden');
  }

  function showDetails(section) {
    searchSections().forEach((el) => el.classList.add('hidden'));
    detailsSections().forEach((el) => el.classList.add('hidden'));
    els.details.classList.remove('hidden');
    if (section) section.classList.remove('hidden');
  }

  // Kept for the search flow (used by runSearch / scheduleSearch)
  const show = (section) => showSearch(section);

  // ── Sources scan (episode click) ───────────────────────────────────────
  function stopScan() {
    if (streamsRequestId != null) {
      streamsRequestId = null;
      if (window.fluxAPI && typeof window.fluxAPI.cancelStreams === 'function') {
        window.fluxAPI.cancelStreams();
      }
    }
  }

  function setChipStatus(name, status, count) {
    const chip = providerRowEls[name];
    if (!chip) return;
    const dot = chip.querySelector('.pchip-dot');
    const label = chip.querySelector('.pchip-status');
    chip.classList.remove('scanning', 'ok', 'empty', 'error');
    if (status === 'scanning') {
      chip.classList.add('scanning');
      label.textContent = '…';
    } else if (status === 'ok') {
      chip.classList.add('ok');
      label.textContent = String(count);
    } else if (status === 'empty') {
      chip.classList.add('empty');
      label.textContent = '0';
    } else {
      chip.classList.add('error');
      label.textContent = '!';
    }
    if (dot) dot.textContent = status === 'ok' ? '\u2713' : (status === 'error' ? '\u00d7' : '·');
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

  function appendSource(src) {
    els.sourcesEmpty.classList.add('hidden');
    sourcesCache.push(src);
    const row = makeSourceRow(src);
    // Direct links first, embeds pinned below them
    if (src.format === 'Embed') {
      els.sourcesList.appendChild(row);
    } else {
      const firstEmbed = els.sourcesList.querySelector('.source-row.embed');
      if (firstEmbed) els.sourcesList.insertBefore(row, firstEmbed);
      else els.sourcesList.appendChild(row);
    }
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
      els.providerChips.innerHTML = '';
      providerRowEls = {};
      for (const name of evt.providers) {
        const chip = document.createElement('div');
        chip.className = 'pchip scanning';

        const dot = document.createElement('span');
        dot.className = 'pchip-dot';
        dot.textContent = '\u00b7';

        const nm = document.createElement('span');
        nm.className = 'pchip-name';
        nm.textContent = name;

        const st = document.createElement('span');
        st.className = 'pchip-status';
        st.textContent = '\u2026';

        chip.appendChild(dot);
        chip.appendChild(nm);
        chip.appendChild(st);
        els.providerChips.appendChild(chip);
        providerRowEls[name] = chip;
      }
      updateSourcesStatus('Scanning ' + evt.providers.length + ' providers\u2026');
      return;
    }

    if (evt.kind === 'provider') {
      setChipStatus(evt.provider, evt.status, evt.count);
      for (const src of evt.sources || []) appendSource(src);
      return;
    }

    if (evt.kind === 'done') {
      streamsRequestId = null;          // scan finished
      const direct = evt.directCount || 0;
      const embeds = evt.embedCount || 0;
      if (direct + embeds === 0) {
        els.sourcesEmpty.classList.remove('hidden');
        updateSourcesStatus('Scan complete \u2014 no sources found');
      } else {
        const parts = [];
        if (direct) parts.push(direct + (direct === 1 ? ' direct link' : ' direct links'));
        if (embeds) parts.push(embeds + (embeds === 1 ? ' embed player' : ' embed players'));
        updateSourcesStatus('Scan complete \u2014 ' + parts.join(', '));
      }
    }
  }

  async function openSources(ep) {
    if (!currentMeta) return;
    lastEpisode = ep;
    sourcesCache = [];
    showDetails(els.sourcesView);
    els.sourcesList.innerHTML = '';
    els.sourcesEmpty.classList.add('hidden');
    els.providerChips.innerHTML = '';
    providerRowEls = {};
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
      hls = new Hls({ enableWorker: true, backBufferLength: 90, maxBufferLength: 30 });
      hls.on(Hls.Events.MANIFEST_PARSED, () => { video.play().catch(() => {}); });
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

    applyPlayerRules(src);

    if (src.format === 'Embed') playEmbed(src);
    else playDirect(src);
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

    els.playerBuffering.classList.add('hidden');
    els.playerFail.classList.add('hidden');
    els.playerView.classList.add('hidden');
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
    });

    video.addEventListener('play', () => setPlayIcon(true));
    video.addEventListener('pause', () => setPlayIcon(false));
    video.addEventListener('loadedmetadata', () => {
      els.pcDur.textContent = fmtTime(video.duration);
    });
    video.addEventListener('timeupdate', () => {
      els.pcCur.textContent = fmtTime(video.currentTime);
      const d = video.duration;
      if (Number.isFinite(d) && d > 0) {
        els.pcSeek.value = String((video.currentTime / d) * 100);
      }
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

  // ── Search rendering ──────────────────────────────────────────────────
  function renderResults(query, items) {
    els.resultsTitle.textContent = 'Results for \u201C' + query + '\u201D';
    els.resultsCount.textContent =
      items.length + (items.length === 1 ? ' title' : ' titles');
    els.grid.innerHTML = '';

    for (const item of items) {
      const card = document.createElement('div');
      card.className = 'card';
      card.title = item.name;
      card.addEventListener('click', () => openDetails(item));

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
      els.grid.appendChild(card);
    }

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
  async function openDetails(item) {
    const seq = ++detailsSeq;
    currentMeta = null;
    stopScan();
    resultsScrollTop = els.content.scrollTop;
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
    showSearch(els.resultsWrap);
    els.content.scrollTop = resultsScrollTop;
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
      showSearch(els.welcome);
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

  // Global Esc: player → sources → episodes → results (Helix-like back nav)
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!els.playerView.classList.contains('hidden')) {
      closePlayer();                 // Esc in player → back to sources
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
})();
