/* ── Flux renderer: search + poster grid ─────────────────────────────── */
(() => {
  'use strict';

  const CINEMETA_BASE = 'https://v3-cinemeta.strem.io';

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
    grid: document.getElementById('grid')
  };

  let debounceTimer = null;
  let searchSeq = 0;          // guards against stale responses
  let lastQuery = '';

  // ── Data layer ────────────────────────────────────────────────────────
  // In Electron, search runs in the main process (no CORS, future-proof
  // for stream scraping). Outside Electron (plain browser), fall back to
  // direct fetch — Cinemeta is CORS-enabled.

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

  // ── Rendering ─────────────────────────────────────────────────────────
  function show(section) {
    [els.welcome, els.loading, els.error, els.empty, els.resultsWrap]
      .forEach((el) => el.classList.add('hidden'));
    section.classList.remove('hidden');
  }

  function renderResults(query, items) {
    els.resultsTitle.textContent = 'Results for \u201C' + query + '\u201D';
    els.resultsCount.textContent =
      items.length + (items.length === 1 ? ' title' : ' titles');
    els.grid.innerHTML = '';

    for (const item of items) {
      const card = document.createElement('div');
      card.className = 'card';
      card.title = item.name;

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

    show(els.resultsWrap);
  }

  // ── Search orchestration ──────────────────────────────────────────────
  async function runSearch(query) {
    const seq = ++searchSeq;
    lastQuery = query;

    show(els.loading);
    try {
      const items = await doSearch(query);
      if (seq !== searchSeq) return;      // a newer search superseded this one
      if (items.length === 0) {
        show(els.empty);
      } else {
        renderResults(query, items);
      }
    } catch (err) {
      if (seq !== searchSeq) return;
      els.errorMsg.textContent =
        'Couldn\u2019t reach the search service. Check your connection and try again.';
      show(els.error);
    }
  }

  function scheduleSearch(query) {
    clearTimeout(debounceTimer);
    if (!query) {
      searchSeq++;                       // invalidate in-flight searches
      els.clear.classList.remove('visible');
      show(els.welcome);
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
    } else if (e.key === 'Escape') {
      els.input.value = '';
      scheduleSearch('');
    }
  });

  els.clear.addEventListener('click', () => {
    els.input.value = '';
    scheduleSearch('');
    els.input.focus();
  });
})();
