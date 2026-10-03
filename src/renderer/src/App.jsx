/* ── Flux app shell: view machine + orchestration ────────────────────────
 * Views: home | loading | error | empty | results | details-loading |
 *        details-error | details | sources        (+ player overlay)
 * Esc chain (Helix pattern): subtitle menu → player → sources →
 * details → clear search back to home.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import TitleBar from './components/TitleBar.jsx';
import TopBar from './components/TopBar.jsx';
import SideBar from './components/SideBar.jsx';
import HomeView from './components/HomeView.jsx';
import DiscoverView from './components/DiscoverView.jsx';
import WatchedView from './components/WatchedView.jsx';
import ResultsView from './components/ResultsView.jsx';
import DetailsView from './components/DetailsView.jsx';
import DetailTopBar from './components/DetailTopBar.jsx';
import SourcesView from './components/SourcesView.jsx';
import PlayerView from './components/PlayerView.jsx';
import { LoadingPane, ErrorPane, EmptyPane } from './components/ui.jsx';
import { useHome } from './hooks/useHome.js';
import { useSearch } from './hooks/useSearch.js';
import { useStreams } from './hooks/useStreams.js';
import { useSubtitles } from './hooks/useSubtitles.js';
import { getMeta } from './lib/cinemeta.js';

export default function App() {
  const [view, setView] = useState('home');
  const [query, setQuery] = useState('');
  const [meta, setMeta] = useState(null);
  const [episode, setEpisode] = useState(null);
  const [activeSource, setActiveSource] = useState(null);
  const [submenuOpen, setSubmenuOpen] = useState(false);
  const [homeTab, setHomeTab] = useState('feed');   // home sidebar: feed|discover|watched|want

  const home = useHome();
  const search = useSearch();
  const streams = useStreams();
  const subs = useSubtitles();

  const contentRef = useRef(null);
  const homeScrollRef = useRef(0);
  const resultsScrollRef = useRef(0);
  const detailsSeqRef = useRef(0);
  const detailsReturnRef = useRef('results');
  const resumeEntryRef = useRef(null);       // history entry behind a resumed player
  const [resumeSec, setResumeSec] = useState(0);   // seek target for the player

  // mirrors for the stable Esc handler
  const viewRef = useRef(view);
  const activeSourceRef = useRef(activeSource);
  const submenuOpenRef = useRef(submenuOpen);
  const homeTabRef = useRef(homeTab);
  useEffect(() => { viewRef.current = view; }, [view]);
  useEffect(() => { activeSourceRef.current = activeSource; }, [activeSource]);
  useEffect(() => { submenuOpenRef.current = submenuOpen; }, [submenuOpen]);
  useEffect(() => { homeTabRef.current = homeTab; }, [homeTab]);

  // ── view entry effects (scroll restore + home lazy load) ──────────────
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    if (view === 'home') {
      el.scrollTop = homeScrollRef.current;
      if (!home.loadedRef.current && !home.loadingRef.current) home.load();
    } else if (view === 'results') {
      el.scrollTop = resultsScrollRef.current;
    } else if (view === 'details') {
      el.scrollTop = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  useEffect(() => {
    if (view === 'home' && !home.loadedRef.current && !home.loadingRef.current) {
      home.load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── search orchestration ───────────────────────────────────────────────
  const beginSearchLoad = useCallback(() => {
    detailsSeqRef.current++;               // close/invalidate details view
    setActiveSource(null);
    streams.stopScan();
    setView('loading');
    // The details-layer search field unmounts with the details flow — move
    // focus to the freshly mounted top bar input so typing continues.
    setTimeout(() => {
      const input = document.getElementById('search');
      if (input) input.focus();
    }, 120);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streams]);

  const finishSearch = useCallback((q, found, err) => {
    if (err) {
      search.setErrorMsg(err);
      setView('error');
      return;
    }
    if (!found.length) {
      setView('empty');
      return;
    }
    search.setItems(found);
    setView('results');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const goHome = useCallback(() => {
    setView('home');
  }, []);

  // ── sidebar navigation: Home / Watched jump straight to their view ────
  const handleSideTab = useCallback((id) => {
    detailsSeqRef.current++;               // invalidate in-flight detail loads
    streams.stopScan();
    setHomeTab(id);
    setView('home');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streams]);

  const handleQueryChange = useCallback((q) => {
    setQuery(q);
    search.scheduleSearch(q, {
      onLoading: beginSearchLoad,
      onDone: finishSearch,
      onEmpty: goHome
    });
  }, [search, beginSearchLoad, finishSearch, goHome]);

  const handleQueryEnter = useCallback(() => {
    search.cancelDebounce();
    const q = query.trim();
    if (q) search.runSearch(q, { onLoading: beginSearchLoad, onDone: finishSearch });
  }, [search, query, beginSearchLoad, finishSearch]);

  const handleQueryClear = useCallback(() => {
    search.cancelDebounce();
    setQuery('');
    goHome();
    const input = document.getElementById('search');
    if (input) input.focus();
  }, [search, goHome]);

  // ── details orchestration ──────────────────────────────────────────────
  const openDetails = useCallback(async (item, from) => {
    const seq = ++detailsSeqRef.current;
    setMeta(null);
    streams.stopScan();
    detailsReturnRef.current = from === 'home' ? 'home' : 'results';
    if (contentRef.current) {
      if (from === 'home') homeScrollRef.current = contentRef.current.scrollTop;
      else resultsScrollRef.current = contentRef.current.scrollTop;
      contentRef.current.scrollTop = 0;
    }
    setView('details-loading');
    try {
      const m = await getMeta(item.type, item.id);
      if (seq !== detailsSeqRef.current) return;   // another title opened meanwhile
      if (!m) throw new Error('no meta');
      setMeta(m);
      setView('details');
    } catch (_err) {
      if (seq !== detailsSeqRef.current) return;
      setView('details-error');
    }
  }, [streams]);

  const closeDetails = useCallback(() => {
    detailsSeqRef.current++;                 // invalidate in-flight loads
    setActiveSource(null);
    streams.stopScan();
    if (detailsReturnRef.current === 'home') setView('home');
    else setView('results');                 // scroll restored by view effect
  }, [streams]);

  // ── sources orchestration ──────────────────────────────────────────────
  const openSources = useCallback((ep) => {
    if (!meta) return;
    setEpisode(ep);
    streams.reset();
    // New episode → the previously loaded subtitles belong to the old one
    subs.resetForEpisode();
    setView('sources');
    streams.startScan({
      type: meta.type,
      imdbId: meta.id,
      title: meta.name,
      year: meta.year,
      season: ep.season ?? 1,
      episode: ep.episode ?? 1
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, streams, subs]);

  const closeSources = useCallback(() => {
    setActiveSource(null);                   // player can't be open here, stay safe
    streams.stopScan();
    setView('details');
  }, [streams]);

  const openPlayer = useCallback((src) => {
    setActiveSource(src);
    resumeEntryRef.current = null;           // fresh playback, not a resume
    setResumeSec(0);

    // Continue watching: record this playback in the history (one entry per
    // title; series entries carry the season/episode, the episode still,
    // and the source identity so the row can resume the SAME source).
    const api = typeof window !== 'undefined' ? window.fluxAPI : null;
    if (meta && meta.id && /^tt\d+$/.test(meta.id) &&
        api && typeof api.historyAdd === 'function') {
      const isSeries = meta.type === 'series';
      const epMeta = isSeries && Array.isArray(meta.videos) && episode
        ? meta.videos.find((v) =>
            (v.season ?? 1) === (episode.season ?? 1) &&
            (v.episode ?? 1) === (episode.episode ?? 1))
        : null;
      Promise.resolve(api.historyAdd({
        imdbId: meta.id,
        type: meta.type,
        title: meta.name,
        poster: meta.poster || null,
        season: isSeries && episode ? (episode.season ?? 1) : null,
        episode: isSeries && episode ? (episode.episode ?? 1) : null,
        episodeTitle: epMeta ? epMeta.title : null,
        // card art: the episode's own still for series, backdrop for movies
        still: isSeries ? (epMeta ? epMeta.thumbnail : null) : (meta.background || null),
        backdrop: meta.background || null,
        // fresh playback: reset the resume point + record the source
        positionSec: 0,
        sourceUrl: src && src.url ? String(src.url) : null,
        sourceProvider: src && src.provider ? String(src.provider) : null,
        sourceTitle: src && src.title ? String(src.title) : null,
        sourceFormat: src && src.format ? String(src.format) : null,
        sourceHeaders: src && src.headers ? src.headers : null
      })).catch(() => {});
    }
  }, [meta, episode]);

  // ── trailer playback (YouTube via the browser-native iframe path) ──────
  // YouTube's 2025 anti-anonymous-embed policy (error 153) requires the
  // player to sit in a real-origin host page — the main process serves one
  // on http://127.0.0.1 and hands us the URL. Trailer sessions never touch
  // the watch history.
  const openTrailer = useCallback(async (ytId) => {
    if (!ytId) return;
    detailsSeqRef.current++;
    streams.stopScan();
    resumeEntryRef.current = null;
    setResumeSec(0);
    let url = null;
    const api = typeof window !== 'undefined' ? window.fluxAPI : null;
    if (api && typeof api.trailerUrl === 'function') {
      url = await Promise.resolve(api.trailerUrl(ytId)).catch(() => null);
    }
    if (!url) {
      // Plain-browser fallback (vite dev outside Electron): from a real
      // http origin the standard embed iframe carries its referrer anyway.
      url = 'https://www.youtube.com/embed/' + ytId + '?autoplay=1&rel=0';
    }
    setActiveSource({
      url,
      format: 'Embed',
      provider: 'YouTube',
      title: 'Official Trailer',
      trailer: true
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streams]);

  // ── resume from the Continue watching row ─────────────────────────────
  // Same source you were on, starting where you left off. Entries without a
  // stored direct source (embeds / legacy) fall back to the details view.
  const resumeHistory = useCallback((entry) => {
    if (!entry || !entry.imdbId) return;
    const api = typeof window !== 'undefined' ? window.fluxAPI : null;
    const resumable = entry.sourceUrl && entry.sourceFormat &&
      entry.sourceFormat !== 'Embed' && /^tt\d+$/.test(entry.imdbId);

    if (!resumable || !api) {
      openDetails({ id: entry.imdbId, type: entry.type, name: entry.title, poster: entry.poster }, 'home');
      return;
    }

    // Bump the entry to the front, keeping its saved position + source
    if (typeof api.historyAdd === 'function') {
      Promise.resolve(api.historyAdd({
        imdbId: entry.imdbId, type: entry.type, title: entry.title,
        poster: entry.poster, season: entry.season, episode: entry.episode,
        episodeTitle: entry.episodeTitle, still: entry.still,
        backdrop: entry.backdrop, positionSec: entry.positionSec || 0,
        sourceUrl: entry.sourceUrl, sourceProvider: entry.sourceProvider,
        sourceTitle: entry.sourceTitle, sourceFormat: entry.sourceFormat,
        sourceHeaders: entry.sourceHeaders
      })).catch(() => {});
    }

    detailsSeqRef.current++;                 // invalidate pending detail loads
    streams.stopScan();
    resumeEntryRef.current = entry;
    setMeta(null);
    setActiveSource({
      url: entry.sourceUrl,
      format: entry.sourceFormat,
      provider: entry.sourceProvider || 'Resumed source',
      title: entry.sourceTitle || 'Resumed source',
      headers: entry.sourceHeaders || null
    });
    setEpisode(entry.type === 'series'
      ? { season: entry.season ?? 1, episode: entry.episode ?? 1, title: entry.episodeTitle || '' }
      : null);
    setResumeSec(entry.positionSec > 5 ? entry.positionSec : 0);
    // meta loads in the background — feeds the player header, subtitle
    // context and the sources fallback ("Change source")
    getMeta(entry.type, entry.imdbId)
      .then((m) => {
        if (m && resumeEntryRef.current === entry) setMeta(m);
      })
      .catch(() => {});
  }, [openDetails, streams]);

  const closePlayer = useCallback(() => {
    setSubmenuOpen(false);
    const src = activeSourceRef.current;
    setActiveSource(null);
    // Trailer session → straight back to the details screen
    if (src && src.trailer) {
      setView('details');
      return;
    }
    // Resumed playback backed by meta + episode → back opens the source
    // list for this title (fresh scan) instead of dropping to home
    const entry = resumeEntryRef.current;
    if (entry && meta && meta.id === entry.imdbId) {
      openSources(entry.type === 'series'
        ? { season: entry.season ?? 1, episode: entry.episode ?? 1, title: entry.episodeTitle || '' }
        : { title: meta.name, season: 1, episode: 1 });
    }
  }, [meta, openSources]);

  // ── global Esc chain ───────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (activeSourceRef.current) {
        if (submenuOpenRef.current) {
          setSubmenuOpen(false);             // Esc in subtitle menu → close it
          return;
        }
        closePlayer();                       // Esc in player → same as Back
        return;
      }
      if (viewRef.current === 'sources') {
        closeSources();                      // Esc in sources → back to episodes
        return;
      }
      if (viewRef.current.startsWith('details')) {
        closeDetails();                      // Esc in details → back to results/home
        return;
      }
      if (homeTabRef.current !== 'feed') {
        setHomeTab('feed');                  // Esc in Discover/Watched/Want → Home feed
        return;
      }
      setQuery('');
      goHome();
      const input = document.getElementById('search');
      if (input) input.focus();
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [closePlayer, closeSources, closeDetails, goHome]);

  const inDetailsFlow = view === 'details-loading' || view === 'details-error' ||
    view === 'details' || view === 'sources';

  // Breadcrumb for the details-layer top bar (Stitch screens:
  // "Movies | Sci-Fi & Fantasy | Interstellar")
  const detailCrumbs = (() => {
    if ((view === 'details' || view === 'sources') && meta) {
      const kind = meta.type === 'series' ? 'TV Shows' : 'Movies';
      if (view === 'sources' && episode) {
        const epLabel = meta.type === 'series'
          ? 'S' + (episode.season ?? 1) + ' E' + (episode.episode ?? 1) +
            (episode.title ? ' \u00b7 ' + episode.title : '')
          : (episode.title || 'Now playing');
        return [kind, meta.name, epLabel].filter(Boolean);
      }
      return [kind, (meta.genres || [])[0], meta.name].filter(Boolean);
    }
    if (view === 'details-loading') return ['Loading\u2026'];
    return ['Details unavailable'];
  })();

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-bg text-ink font-sans">
      {/* Custom frameless-window chrome: black bar, FLUX brand, custom
          minimize / maximize / close (the OS title bar is gone) */}
      <TitleBar />

      <div className="flex flex-1 min-h-0">
        <SideBar active={homeTab} onTab={handleSideTab} />

        <div className="flex-1 flex flex-col min-w-0">
        {/* The app top bar lives ONLY on non-details views — the movie/TV
            screen is ONE layer with its own controls inside the content. */}
        {!inDetailsFlow ? (
          <TopBar
            query={query}
            onQueryChange={handleQueryChange}
            onEnter={handleQueryEnter}
            onClear={handleQueryClear}
          />
        ) : null}

        <main
          ref={contentRef}
          className={
            'flex-1 overflow-y-auto scroll-dark relative ' +
            (inDetailsFlow ? 'flex flex-col p-0' : 'px-8 pt-3 pb-2')
          }
        >
          {view === 'home' ? (
            homeTab === 'discover' ? (
              <DiscoverView onOpen={(item) => openDetails(item, 'home')} />
            ) : homeTab === 'watched' ? (
              <WatchedView list="watched" onOpen={(item) => openDetails(item, 'home')} />
            ) : homeTab === 'want' ? (
              <WatchedView list="want" onOpen={(item) => openDetails(item, 'home')} />
            ) : (
              <HomeView
                home={home}
                onOpen={(item) => openDetails(item, 'home')}
                onResume={resumeHistory}
              />
            )
          ) : null}

          {view === 'loading' ? <LoadingPane label={'Searching\u2026'} testid="loading" /> : null}

          {view === 'error' ? (
            <ErrorPane
              title="Something went wrong"
              message={search.errorMsg || 'Couldn\u2019t reach the search service. Check your connection and try again.'}
              testid="error"
            />
          ) : null}

          {view === 'empty' ? <EmptyPane /> : null}

          {view === 'results' ? (
            <ResultsView query={query} items={search.items} onOpen={openDetails} />
          ) : null}

          {inDetailsFlow ? (
            <section
              data-testid="details"
              className="detail-page flex flex-col min-h-full shrink-0"
            >
              {/* One layer: back / breadcrumb / search are part of the
                  content layer (Stitch detail screens), not app chrome. */}
              <DetailTopBar
                crumbs={detailCrumbs}
                query={query}
                onQueryChange={handleQueryChange}
                onEnter={handleQueryEnter}
                onClear={handleQueryClear}
                onBack={() => {
                  if (view === 'sources') closeSources();
                  else closeDetails();
                }}
              />

              {view === 'details-loading' ? (
                <LoadingPane label={'Loading details\u2026'} testid="details-loading" />
              ) : null}

              {view === 'details-error' ? (
                <ErrorPane
                  title="Couldn't load details"
                  message="Try going back and opening it again."
                  testid="details-error"
                />
              ) : null}

              {view === 'details' && meta ? (
                <DetailsView
                  meta={meta}
                  onFindSources={openSources}
                  onPlayTrailer={openTrailer}
                />
              ) : null}

              {view === 'sources' && meta && episode ? (
                <SourcesView meta={meta} episode={episode} scan={streams} onPlay={openPlayer} />
              ) : null}
            </section>
          ) : null}
        </main>
        </div>
      </div>

      {activeSource ? (
        <PlayerView
          key={activeSource.url || activeSource.title}
          source={activeSource}
          sources={streams.sources}
          meta={meta}
          episode={episode}
          subs={subs}
          resumeSec={resumeSec}
          onBack={closePlayer}
          submenuOpen={submenuOpen}
          onToggleSubmenu={() => setSubmenuOpen((v) => !v)}
          onCloseSubmenu={() => setSubmenuOpen(false)}
        />
      ) : null}
    </div>
  );
}
