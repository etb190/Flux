/* ── Subtitle system (port of the Helix PlayerSubtitleMenu block) ────────
 * External SRT/VTT/ASS variants (searched via main process) + embedded HLS
 * WebVTT tracks, rendered by our own overlay (styling + delay support).
 * Only en/fr/it/es/ar survive the whitelist (lib/subsParser.subLangLabel).
 *
 * Subtitle MEMORY: the last user choice is persisted per title
 * (userData/flux-subs.json via main) and re-applied automatically —
 * across RESUMES of the same video (the exact external file when it is
 * offered again) and across EPISODES of the same show (the remembered
 * language, external first, embedded as fallback). Turning subs off is
 * remembered too — last action wins. An explicit pick for the current
 * episode always beats the memory (the user already chose).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { subParse, findActiveCueIndex, subLangLabel, subMenuOrderIndex, subMenuCompare } from '../lib/subsParser.js';

function fluxApi() {
  return typeof window !== 'undefined' ? window.fluxAPI : null;
}

function subtitleSupports() {
  const api = fluxApi();
  return api && typeof api.searchSubtitles === 'function';
}

export function useSubtitles() {
  const [groups, setGroups] = useState([]);
  const [pending, setPending] = useState(0);
  const [loadingUrl, setLoadingUrl] = useState(null);
  const [embedded, setEmbedded] = useState([]);       // [{id, name, lang}]
  const [embeddedActive, setEmbeddedActiveState] = useState(null);
  const [delay, setDelayState] = useState(0);
  const [menuNotice, setMenuNotice] = useState(null);
  const [selectedUrl, setSelectedUrl] = useState(null); // downloadUrl of selected variant
  const [cuesVersion, setCuesVersion] = useState(0);    // bump → overlay recompute
  const [subsStyle, setSubsStyleState] = useState({ scale: 1, bg: 0 }); // overlay look — Classic White: no box, black outline

  const groupsRef = useRef([]);
  const selectedRef = useRef(null);
  const cuesRef = useRef([]);
  const delayRef = useRef(0);
  const embeddedActiveRef = useRef(null);
  const embeddedCuesRef = useRef(new Map());
  const episodeKeyRef = useRef('');
  const requestIdRef = useRef(null);
  const hlsRef = useRef(null);
  const ctxRef = useRef(null);        // {name, imdbId, season, episode, year, isEmbed}
  const eventHandlerRef = useRef(null);
  const maybeAutoApplyRef = useRef(() => {});   // mirrored below (defined later)

  // ── subtitle memory (persists across episodes + resumes) ──────────────
  const memoryRef = useRef(null);       // { titles: {ttId: choice}, last } | null until loaded
  const embeddedListRef = useRef([]);   // mirrors the `embedded` state for callbacks
  const userActedKeyRef = useRef('');   // episode key the user explicitly picked for

  // Stable episode key (same shape search() uses)
  const episodeKeyOf = useCallback(() => {
    const params = buildParams();
    return [params.imdbId || params.name, params.season ?? '', params.episode ?? ''].join(':');
  }, [buildParams]);

  // Load the persisted memory once per session (main reads flux-subs.json)
  useEffect(() => {
    const api = fluxApi();
    if (!api || typeof api.subsMemoryGet !== 'function') return;
    Promise.resolve(api.subsMemoryGet()).then((mem) => {
      if (mem && typeof mem === 'object') {
        memoryRef.current = { titles: mem.titles || {}, last: mem.last || null };
        // Memory landing AFTER results (slow disk / fast providers): apply now
        if (maybeAutoApplyRef.current) maybeAutoApplyRef.current();
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── context (which title/episode subs belong to) ──────────────────────
  const setContext = useCallback((ctx) => { ctxRef.current = ctx; }, []);

  const buildParams = useCallback(() => {
    const ctx = ctxRef.current || {};
    return {
      name: ctx.name || '',
      imdbId: ctx.imdbId || null,       // Cinemeta ids are imdb tt-ids
      season: ctx.isSeries ? ctx.season : null,
      episode: ctx.isSeries ? ctx.episode : null,
      year: ctx.year || null
    };
  }, []);

  // ── search (Helix _fetchInitialSubtitles / refresh) ────────────────────
  const search = useCallback((force) => {
    if (!subtitleSupports()) return;
    const ctx = ctxRef.current || {};
    if (ctx.isEmbed) return;            // embeds manage their own subs
    const params = buildParams();
    if (!params.name && !params.imdbId) return;

    const key = [params.imdbId || params.name, params.season ?? '', params.episode ?? ''].join(':');
    if (!force && key === episodeKeyRef.current && groupsRef.current.length) return;
    episodeKeyRef.current = key;
    userActedKeyRef.current = '';       // fresh search → nothing chosen for it yet
    groupsRef.current = [];
    setGroups([]);
    selectedRef.current = null;
    setSelectedUrl(null);
    cuesRef.current = [];
    setCuesVersion((v) => v + 1);
    setEmbedded([]);
    embeddedListRef.current = [];
    embeddedActiveRef.current = null;
    setEmbeddedActiveState(null);
    embeddedCuesRef.current = new Map();
    setMenuNotice(null);

    setPending(4);
    fluxApi().searchSubtitles(params).then((res) => {
      if (res && res.requestId != null) requestIdRef.current = res.requestId;
    }).catch(() => {
      setPending(0);
    });
  }, [buildParams]);

  // ── IPC progress events (batch merge — Helix _mergeSubtitleGroups) ─────
  useEffect(() => {
    eventHandlerRef.current = (payload) => {
      if (!payload || payload.kind === undefined) return;
      if (requestIdRef.current != null && payload.requestId !== requestIdRef.current) return;

      if (payload.kind === 'batch' && Array.isArray(payload.variants)) {
        const seen = new Set(
          groupsRef.current.flatMap((g) => g.variants.map((v) => String(v.downloadUrl).toLowerCase()))
        );
        let changed = false;
        const next = groupsRef.current.slice();
        for (const v of payload.variants) {
          if (!v || !v.downloadUrl) continue;
          const urlKey = String(v.downloadUrl).toLowerCase();
          if (seen.has(urlKey)) continue;
          seen.add(urlKey);
          changed = true;
          const lang = String(v.language || 'Unknown');
          let group = next.find((g) => g.language === lang);
          if (!group) {
            group = { language: lang, variants: [] };
            next.push(group);
          }
          group.variants.push(v);
        }
        if (changed) {
          // Menu order (English, French, Arabic, Italian, Spanish; unknown
          // last) — a plain localeCompare here is ALPHABETICAL, which is
          // exactly what put Arabic above English in the player's menu.
          next.sort((a, b) => subMenuCompare(a.language, b.language));
          groupsRef.current = next;
          setGroups(next);
          // New material landed — try the remembered choice (no-op when the
          // user already picked for this episode or something is playing).
          if (maybeAutoApplyRef.current) maybeAutoApplyRef.current();
        }
      } else if (payload.kind === 'done') {
        setPending(0);
        if (maybeAutoApplyRef.current) maybeAutoApplyRef.current();
      }
    };
  }, []);

  useEffect(() => {
    const api = fluxApi();
    if (api && typeof api.onSubsProgress === 'function') {
      api.onSubsProgress((payload) => {
        if (eventHandlerRef.current) eventHandlerRef.current(payload);
      });
    }
  }, []);

  // ── selection actions ──────────────────────────────────────────────────
  // `applyVariant` / `applyEmbedded` do the mechanical switch. The PUBLIC
  // actions (menu clicks / off) additionally mark the episode as user-chosen
  // (memory stops auto-applying there) and record the choice to disk.

  // Fire & forget persist of the user's subtitle choice. Keyed by the SHOW
  // id (covers every episode) when ctx has one, always also as the global
  // `last` fallback. Embeds manage their own subs — never recorded.
  const rememberChoice = useCallback((choice) => {
    const api = fluxApi();
    if (!api || typeof api.subsMemorySet !== 'function') return;
    const ctx = ctxRef.current || {};
    if (ctx.isEmbed) return;
    const key = ctx.imdbId || null;
    // optimistic local cache — a fast episode switch can already apply it
    if (memoryRef.current) {
      if (key) memoryRef.current.titles[key] = choice;
      memoryRef.current.last = choice;
    }
    Promise.resolve(api.subsMemorySet(key, choice)).then((mem) => {
      if (mem && typeof mem === 'object' && memoryRef.current) {
        memoryRef.current = { titles: mem.titles || {}, last: mem.last || null };
      }
    }).catch(() => {});
  }, []);

  const off = useCallback(() => {
    userActedKeyRef.current = episodeKeyOf();      // explicit off beats the memory here
    rememberChoice({ kind: 'off' });
    selectedRef.current = null;
    setSelectedUrl(null);
    cuesRef.current = [];
    setCuesVersion((v) => v + 1);
    if (hlsRef.current) { try { hlsRef.current.subtitleTrack = -1; } catch (_) {} }
    embeddedActiveRef.current = null;
    setEmbeddedActiveState(null);
    setMenuNotice(null);
  }, [episodeKeyOf, rememberChoice]);

  const applyVariant = useCallback(async (variant, auto) => {
    selectedRef.current = variant;                 // synchronous → maybeAutoApply re-entry guard
    setSelectedUrl(String(variant.downloadUrl));
    setLoadingUrl(String(variant.downloadUrl));
    setMenuNotice(null);
    try {
      const res = await fluxApi().downloadSubtitle(variant);
      if (selectedRef.current !== variant) return;   // user picked another meanwhile
      if (!res || !res.content) {
        setLoadingUrl(null);
        selectedRef.current = null;
        setSelectedUrl(null);
        if (!auto) setMenuNotice('Failed to download subtitle \u2014 try another one.');
        return;
      }
      cuesRef.current = subParse(res.content, res.format === 'vtt' || res.format === 'ass' ? res.format : null);
      if (hlsRef.current) { try { hlsRef.current.subtitleTrack = -1; } catch (_) {} }  // external replaces embedded
      embeddedActiveRef.current = null;
      setEmbeddedActiveState(null);
      setLoadingUrl(null);
      setCuesVersion((v) => v + 1);
    } catch (_err) {
      setLoadingUrl(null);
      selectedRef.current = null;
      setSelectedUrl(null);
    }
  }, []);

  const selectVariant = useCallback((variant) => {
    if (!variant || !variant.downloadUrl) return;
    userActedKeyRef.current = episodeKeyOf();
    rememberChoice({
      kind: 'external',
      language: String(variant.language || 'Unknown'),
      url: String(variant.downloadUrl)
    });
    return applyVariant(variant, false);
  }, [applyVariant, episodeKeyOf, rememberChoice]);

  const applyEmbedded = useCallback((id, auto) => {
    embeddedActiveRef.current = id;                // synchronous re-entry guard
    setEmbeddedActiveState(id);
    selectedRef.current = null;
    setSelectedUrl(null);
    cuesRef.current = [];
    setCuesVersion((v) => v + 1);
    if (hlsRef.current) {
      try { hlsRef.current.subtitleTrack = id; } catch (_) {}
    }
    setMenuNotice(null);
    return id;
  }, []);

  const selectEmbedded = useCallback((id) => {
    const track = embeddedListRef.current.find((t) => t.id === id);
    userActedKeyRef.current = episodeKeyOf();
    rememberChoice({ kind: 'embedded', language: (track && track.name) || '' });
    return applyEmbedded(id, false);
  }, [applyEmbedded, episodeKeyOf, rememberChoice]);

  // ── auto-apply the remembered choice ───────────────────────────────────
  // Runs whenever subtitle material lands (provider batch / embedded tracks
  // parsed / memory loaded). Applies the choice remembered for this title —
  // or the global last one — while the user hasn't picked anything for this
  // episode and nothing is playing yet:
  //   external memory → the EXACT file when offered again (same-video
  //                     resume), else the first variant of the language
  //                     (next episode of the show);
  //   embedded memory → the matching embedded track, else the external
  //                     language group as fallback;
  //   'off' memory    → nothing (subs stay off — last action wins).
  const maybeAutoApply = useCallback(() => {
    const ctx = ctxRef.current || {};
    if (ctx.isEmbed) return;                       // embeds manage their own subs
    if (!memoryRef.current) return;
    if (selectedRef.current || embeddedActiveRef.current != null) return;
    if (userActedKeyRef.current === episodeKeyOf()) return;
    const choice = (ctx.imdbId && memoryRef.current.titles[ctx.imdbId]) ||
      memoryRef.current.last;
    if (!choice || choice.kind === 'off') return;
    if (choice.kind === 'external') {
      if (choice.url) {
        const exact = groupsRef.current.flatMap((g) => g.variants)
          .find((v) => String(v.downloadUrl || '').toLowerCase() ===
                       String(choice.url).toLowerCase());
        if (exact) { applyVariant(exact, true); return; }
      }
      if (choice.language) {
        const group = groupsRef.current.find((g) => g.language === choice.language);
        if (group && group.variants.length) { applyVariant(group.variants[0], true); return; }
      }
    } else if (choice.kind === 'embedded' && choice.language) {
      const track = embeddedListRef.current.find((t) => t.name === choice.language);
      if (track) { applyEmbedded(track.id, true); return; }
      const group = groupsRef.current.find((g) => g.language === choice.language);
      if (group && group.variants.length) { applyVariant(group.variants[0], true); return; }
    }
  }, [applyEmbedded, applyVariant, episodeKeyOf]);
  useEffect(() => { maybeAutoApplyRef.current = maybeAutoApply; }, [maybeAutoApply]);

  const setDelay = useCallback((d) => {
    const clamped = Math.max(-30, Math.min(30, Math.round(d * 10) / 10));
    delayRef.current = clamped;
    setDelayState(clamped);
    setCuesVersion((v) => v + 1);     // re-evaluate the visible cue immediately
  }, []);

  // Overlay look (size + background) — a user preference, survives episode
  // and source switches; wired to the player's settings panel.
  const setSubsStyle = useCallback((patch) => {
    setSubsStyleState((prev) => ({ ...prev, ...patch }));
  }, []);

  // ── embedded HLS tracks (MANIFEST_PARSED / CUES_PARSED) ────────────────
  const setEmbeddedTracks = useCallback((hls) => {
    try {
      const tracks = (hls.subtitleTracks || [])
        .map((t) => ({
          id: t.id,
          name: subLangLabel(t.lang) || subLangLabel(t.name) || null,
          lang: t.lang
        }))
        .filter((t) => t.name)
        .map((t) => ({ id: t.id, name: t.name, lang: t.lang }))
        // Same menu order as the external-provider groups (English, French,
        // Arabic, Italian, Spanish) instead of manifest order.
        .sort((a, b) => subMenuOrderIndex(a.name) - subMenuOrderIndex(b.name) ||
                        a.name.localeCompare(b.name));
      embeddedListRef.current = tracks;
      setEmbedded(tracks);
    } catch (_err) {
      embeddedListRef.current = [];
      setEmbedded([]);
    }
    // Tracks arrive at MANIFEST_PARSED — often before/without provider
    // batches: this is the embedded-memory apply chance.
    maybeAutoApplyRef.current();
  }, []);

  const pushEmbeddedCues = useCallback((data) => {
    if (!data) return;
    const cues = (data.cues || []).map((c) => ({
      start: c.start ?? c.startTime ?? 0,
      end: c.end ?? c.endTime ?? 0,
      text: c.text || c.content || ''
    })).filter((c) => c.text);
    cues.sort((a, b) => a.start - b.start);
    embeddedCuesRef.current.set(data.track, cues);
    if (embeddedActiveRef.current === data.track) setCuesVersion((v) => v + 1);
  }, []);

  const attachHls = useCallback((hls) => { hlsRef.current = hls; }, []);
  const detachHls = useCallback(() => { hlsRef.current = null; }, []);

  // ── lifecycle resets ───────────────────────────────────────────────────
  // New episode opened (openSources): everything from the previous one goes;
  // the remembered choice re-applies automatically when the new results land.
  const resetForEpisode = useCallback(() => {
    const api = fluxApi();
    if (api && typeof api.cancelSubtitles === 'function') {
      api.cancelSubtitles().catch(() => {});
    }
    requestIdRef.current = null;
    setPending(0);
    groupsRef.current = [];
    setGroups([]);
    selectedRef.current = null;
    setSelectedUrl(null);
    cuesRef.current = [];
    setCuesVersion((v) => v + 1);
    episodeKeyRef.current = '';
    userActedKeyRef.current = '';       // nothing chosen for the new episode yet
    setLoadingUrl(null);
    setEmbedded([]);
    embeddedListRef.current = [];
    embeddedActiveRef.current = null;
    setEmbeddedActiveState(null);
    embeddedCuesRef.current = new Map();
    setMenuNotice(null);
    delayRef.current = 0;
    setDelayState(0);
  }, []);

  // Player closed: cancel in-flight search, drop embedded state. External
  // groups/selection survive a source switch (Helix keeps the variant across
  // sources for the same episode; search() skips while the key matches).
  const stopInFlight = useCallback(() => {
    const api = fluxApi();
    if (api && typeof api.cancelSubtitles === 'function') {
      api.cancelSubtitles().catch(() => {});
    }
    requestIdRef.current = null;
    setPending(0);
    setLoadingUrl(null);
    setEmbedded([]);
    embeddedListRef.current = [];
    embeddedActiveRef.current = null;
    setEmbeddedActiveState(null);
    embeddedCuesRef.current = new Map();
    setMenuNotice(null);
  }, []);

  // ── overlay text lookup (ref-based, called on every timeupdate) ────────
  const getOverlayText = useCallback((t) => {
    let cues = null;
    const active = embeddedActiveRef.current;
    if (active != null && embeddedCuesRef.current.has(active)) {
      cues = embeddedCuesRef.current.get(active);
    } else if (selectedRef.current && cuesRef.current.length) {
      cues = cuesRef.current;
    }
    if (!cues || !cues.length) return '';
    const idx = findActiveCueIndex(cues, t - delayRef.current);
    return idx !== -1 ? (cues[idx].text || '') : '';
  }, []);

  const hasActive = selectedUrl != null || embeddedActive != null;

  return {
    // state
    groups, pending, loadingUrl, embedded, embeddedActive, delay, menuNotice,
    selectedUrl, cuesVersion, hasActive, subsStyle,
    // actions
    setContext, search, off, selectVariant, selectEmbedded, setDelay, setSubsStyle,
    setEmbeddedTracks, pushEmbeddedCues, attachHls, detachHls,
    resetForEpisode, stopInFlight, getOverlayText
  };
}
