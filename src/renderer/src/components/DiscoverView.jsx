/* ── Discover tab: genre-driven browse (Stitch style) ─────────────────────
 * One screen to find what to watch:
 *   • Type toggle   Movies | Series            (season-pill family)
 *   • Sort toggle   Popular | Top Rated | New  (season-pill family)
 *   • Genre chips   from the Cinemeta manifest, horizontally scrollable
 *                   with edge arrows, "All" first — red active state
 *   • Poster grid   same dense grid as search results, infinite scroll
 *
 * Data (main process, src/main/discover.js):
 *   Popular/Top Rated → Cinemeta catalogs (native imdb ids)
 *   New               → TMDB discover + imdb enrichment (trending pipeline)
 *
 * The view unmounts on every tab/details switch, so the last selection +
 * loaded pages are memoized at module scope (only while the fetch was in a
 * clean, ready state) and rehydrated instantly on remount — the grid never
 * flashes empty when hopping tabs.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PosterCard from './PosterCard.jsx';
import { ChevronLeftIcon, ChevronRightIcon, FilmIcon } from './icons.jsx';

const SORTS = [
  { id: 'popular', label: 'Popular' },
  { id: 'rating', label: 'Top Rated' },
  { id: 'new', label: 'New' }
];

// Filter persistence — the picked type/sort/genre survive a full app
// refresh (localStorage), not just tab switches (the module memo).
const LS_FILTERS_KEY = 'flux.discover.filters.v1';

function loadSavedFilters() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_FILTERS_KEY) || 'null');
    if (!raw || typeof raw !== 'object') return null;
    return {
      type: raw.type === 'series' ? 'series' : 'movie',
      sort: ['popular', 'rating', 'new'].includes(raw.sort) ? raw.sort : 'popular',
      genre: typeof raw.genre === 'string' ? raw.genre : ''
    };
  } catch (_err) {
    return null;
  }
}

// Module-scope snapshot (survives unmount/remount of this component only).
let memo = null;

// ── Genre chips row: chips pan between fixed row-member arrows ───────────
function ChipsRow({ children, testid }) {
  const ref = useRef(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const [noScroll, setNoScroll] = useState(true);

  const sync = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setNoScroll(max <= 4);
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft < max - 4);
  }, []);

  useEffect(() => {
    sync();
    const el = ref.current;
    if (!el) return undefined;
    el.addEventListener('scroll', sync, { passive: true });
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    const t = setTimeout(sync, 600);
    return () => { el.removeEventListener('scroll', sync); ro.disconnect(); clearTimeout(t); };
  }, [sync, children]);

  const page = () =>
    Math.max((ref.current ? ref.current.clientWidth : 500) * 0.8, 260);

  return (
    <div className="flex items-center gap-1.5">
      {!noScroll ? (
        <button data-testid="disc-chips-left" aria-label="Scroll genres left"
          className={'h-arrow dir-left my-[2px] shrink-0' + (!canLeft ? ' dim' : '')}
          onClick={() => ref.current?.scrollBy({ left: -page(), behavior: 'smooth' })}>
          <ChevronLeftIcon size={14} />
        </button>
      ) : null}
      <div ref={ref} data-testid={testid} className="row-scroll flex gap-1.5 overflow-x-auto py-0.5 min-w-0 flex-1">
        {children}
      </div>
      {!noScroll ? (
        <button data-testid="disc-chips-right" aria-label="Scroll genres right"
          className={'h-arrow dir-right my-[2px] shrink-0' + (!canRight ? ' dim' : '')}
          onClick={() => ref.current?.scrollBy({ left: page(), behavior: 'smooth' })}>
          <ChevronRightIcon size={14} />
        </button>
      ) : null}
    </div>
  );
}

// ── States ────────────────────────────────────────────────────────────────

function GridSkeleton() {
  return (
    <div data-testid="disc-loading" className="grid gap-x-[3px] gap-y-6 grid-cols-[repeat(auto-fill,minmax(150px,1fr))] mt-5">
      {[...Array(18)].map((_, i) => (
        <div key={i}>
          <div className="skeleton aspect-[2/3]" />
          <div className="skeleton h-3 w-3/4 mt-2" />
        </div>
      ))}
    </div>
  );
}

function ErrorCard({ errorMsg, onRetry }) {
  return (
    <div data-testid="disc-error" className="flex justify-center py-20 px-6">
      <div className="max-w-xl bg-raised border border-edge p-8 text-center">
        <h2 className="text-xl font-semibold mb-3">Couldn&rsquo;t load Discover</h2>
        <p data-testid="disc-error-msg" className="text-dim text-[15px]">{errorMsg}</p>
        <button
          data-testid="disc-retry"
          onClick={onRetry}
          className="mt-6 bg-accent px-5 py-2.5 font-bold text-white hover:bg-[#f6121d] transition-colors"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

function EmptyPane({ genre, sortLabel }) {
  return (
    <div data-testid="disc-empty" className="border border-dashed border-edge bg-raised px-5 py-12 mt-5 text-center">
      <div className="flex justify-center mb-3 text-[#4f4f4f]"><FilmIcon size={30} /></div>
      <h4 className="text-[15px] font-semibold mb-1.5">Nothing here right now</h4>
      <p className="text-[13px] text-dim m-0">
        {genre
          ? <>No {genre} titles turned up for &ldquo;{sortLabel}&rdquo;. Try another genre or sort.</>
          : 'Try another sort or check your connection.'}
      </p>
    </div>
  );
}

// ── DiscoverView ──────────────────────────────────────────────────────────

export default function DiscoverView({ onOpen }) {
  // Hydrate from the module memo (tab switch), then localStorage (refresh),
  // then the defaults.
  const saved = useMemo(loadSavedFilters, []);
  const [type, setType] = useState(() => (memo && memo.type) || (saved && saved.type) || 'movie');
  const [sort, setSort] = useState(() => (memo && memo.sort) || (saved && saved.sort) || 'popular');
  const [genre, setGenre] = useState(() =>
    memo ? memo.genre : (saved && saved.genre) || '');
  const [genres, setGenres] = useState(() => (memo && memo.genres) || null);
  const [items, setItems] = useState(() => (memo && memo.items) || []);
  const [status, setStatus] = useState(() => (memo ? 'ready' : 'idle'));
  const [errorMsg, setErrorMsg] = useState('');
  const [note, setNote] = useState(() => (memo && memo.note) || '');
  const [hasMore, setHasMore] = useState(() => Boolean(memo && memo.hasMore));
  const [loadingMore, setLoadingMore] = useState(false);
  const [nonce, setNonce] = useState(0);      // Retry bumps this

  const seqRef = useRef(0);          // invalidates in-flight page loads
  const cursorRef = useRef(null);    // { skip, page } of the LAST loaded page
  const filterKeyRef = useRef(null); // dedupes fetches for the same filter
  const firstRunRef = useRef(true);  // mount → hydrate instead of refetch
  const sentinelRef = useRef(null);

  const sortLabel = (SORTS.find((s) => s.id === sort) || SORTS[0]).label;

  // Persist the picked filters (survives a full app refresh).
  useEffect(() => {
    try {
      localStorage.setItem(LS_FILTERS_KEY, JSON.stringify({ type, sort, genre }));
    } catch (_err) { /* private mode / storage full — filters just won't persist */ }
  }, [type, sort, genre]);

  // Persist the snapshot whenever a clean state settles. While a page is
  // loading (or errored) the memo is dropped — a remount then starts fresh
  // instead of restoring half a browse. The unmount cleanup captures the
  // scroll position for the restore effect below.
  const syncMemo = useCallback((scrollY) => {
    if (status !== 'ready') { memo = null; return; }
    memo = {
      type, sort, genre, genres, items, note, hasMore,
      cursor: cursorRef.current,
      filterKey: type + '|' + sort + '|' + genre,
      scrollY: scrollY != null ? scrollY : ((memo && memo.scrollY) || 0)
    };
  }, [type, sort, genre, genres, items, note, hasMore, status]);
  useEffect(() => { syncMemo(); }, [syncMemo]);
  useEffect(() => () => {
    const el = document.querySelector('main');
    syncMemo(el ? el.scrollTop : 0);
  }, [syncMemo]);

  // Restore the scroll position on a hydrated remount (tab switches; the
  // details round-trip is handled by App's own scroll restore).
  useEffect(() => {
    if (!memo || !memo.scrollY) return undefined;
    const raf = requestAnimationFrame(() => {
      const el = document.querySelector('main');
      if (el) el.scrollTop = memo.scrollY;
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // Genres (manifest-driven, disk-cached in main). Refresh silently even
  // when hydrated from the memo.
  useEffect(() => {
    const api = window.fluxAPI;
    if (!api || typeof api.discoverGenres !== 'function') {
      if (!memo) setGenres({ movie: [], series: [] });
      return undefined;
    }
    let alive = true;
    Promise.resolve(api.discoverGenres())
      .then((g) => {
        if (!alive || !g || g.error) return;
        if (Array.isArray(g.movie) && Array.isArray(g.series)) {
          setGenres({ movie: g.movie, series: g.series });
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // First page whenever the filter triple (or Retry) changes. On mount the
  // hydrated memo wins — no refetch, no flash.
  useEffect(() => {
    const fkey = type + '|' + sort + '|' + genre;
    if (firstRunRef.current) {
      firstRunRef.current = false;
      if (memo && memo.filterKey === fkey && memo.items) {
        filterKeyRef.current = fkey;
        cursorRef.current = memo.cursor || { skip: 0, page: 1 };
        return undefined;
      }
      memo = null;
      filterKeyRef.current = null;
    }
    if (filterKeyRef.current === fkey) return undefined;
    filterKeyRef.current = fkey;

    const seq = ++seqRef.current;
    setStatus('idle');
    setErrorMsg('');
    setNote('');
    setItems([]);
    setHasMore(false);
    setLoadingMore(false);
    cursorRef.current = null;

    const api = window.fluxAPI;
    if (!api || typeof api.discoverPage !== 'function') {
      setStatus('error');
      setErrorMsg('Discover is unavailable in this build.');
      return undefined;
    }
    setStatus('loading');
    Promise.resolve(api.discoverPage({ type, sort, genre, skip: 0, page: 1 }))
      .then((res) => {
        if (seq !== seqRef.current) return;
        if (!res || res.error) {
          setStatus('error');
          setErrorMsg((res && res.error) ||
            'Couldn\u2019t reach the catalogs. Check your connection and try again.');
          return;
        }
        setItems(res.items || []);
        setNote(res.note || '');
        setHasMore(Boolean(res.hasMore));
        cursorRef.current = { skip: 0, page: 1 };
        setStatus('ready');
      })
      .catch(() => {
        if (seq !== seqRef.current) return;
        setStatus('error');
        setErrorMsg('Couldn\u2019t reach the catalogs. Check your connection and try again.');
      });
    return undefined;
  }, [type, sort, genre, nonce]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || status !== 'ready') return;
    const cur = cursorRef.current || { skip: 0, page: 1 };
    const seq = ++seqRef.current;
    setLoadingMore(true);
    const api = window.fluxAPI;
    if (!api || typeof api.discoverPage !== 'function') {
      setLoadingMore(false);
      return;
    }
    const next = sort === 'popular'
      ? { skip: (cur.skip || 0) + 50, page: 1 }
      : { skip: 0, page: (cur.page || 1) + 1 };
    Promise.resolve(api.discoverPage({ type, sort, genre, ...next }))
      .then((res) => {
        if (seq !== seqRef.current) return;
        setLoadingMore(false);
        if (!res || res.error) { setHasMore(false); return; }
        const fresh = res.items || [];
        setItems((list) => {
          const seen = new Set(list.map((it) => it.type + it.id));
          return list.concat(fresh.filter((it) => !seen.has(it.type + it.id)));
        });
        setNote(res.note || '');
        setHasMore(Boolean(res.hasMore) && fresh.length > 0);
        cursorRef.current = next;
      })
      .catch(() => {
        if (seq !== seqRef.current) return;
        setLoadingMore(false);
        setHasMore(false);
      });
  }, [loadingMore, hasMore, status, sort, type, genre]);

  // Infinite scroll: sentinel just past the grid.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || status !== 'ready') return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadMore();
    }, { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [status, loadMore, items.length]);

  const genreList = genres ? (type === 'series' ? genres.series : genres.movie) : [];
  const chipKey = (g) => 'disc-chip-' + (g || 'all');

  const setFilter = (patch) => {
    memo = null;
    filterKeyRef.current = null;
    if (patch.type !== undefined) setType(patch.type);
    if (patch.sort !== undefined) setSort(patch.sort);
    if (patch.genre !== undefined) setGenre(patch.genre);
  };

  const retry = () => {
    memo = null;
    filterKeyRef.current = null;
    firstRunRef.current = false;
    setNonce((n) => n + 1);
  };

  return (
    <div data-testid="disc-view">
      <h2 className="text-[22px] font-extrabold mt-1">Discover</h2>

      {/* Type + sort segmented toggles (season-pill family, red active) */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 mt-4">
        <div className="flex" role="group" aria-label="Type">
          <button
            data-testid="disc-type-movie"
            onClick={() => setFilter({ type: 'movie' })}
            className={'season-pill ' + (type === 'movie' ? 'active' : '')}
          >
            Movies
          </button>
          <button
            data-testid="disc-type-series"
            onClick={() => setFilter({ type: 'series' })}
            className={'season-pill ' + (type === 'series' ? 'active' : '')}
          >
            Series
          </button>
        </div>
        <span className="w-px h-5 bg-edge" aria-hidden="true" />
        <div className="flex" role="group" aria-label="Sort">
          {SORTS.map((s) => (
            <button
              key={s.id}
              data-testid={'disc-sort-' + s.id}
              onClick={() => setFilter({ sort: s.id })}
              className={'season-pill ' + (sort === s.id ? 'active' : '')}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Genre chips */}
      <div className="mt-3.5">
        {genreList.length ? (
          <ChipsRow testid="disc-chips">
            <button
              data-testid={chipKey('')}
              onClick={() => setFilter({ genre: '' })}
              className={'genre-pill ' + (genre === '' ? 'active' : '')}
            >
              All
            </button>
            {genreList.map((g) => (
              <button
                key={g}
                data-testid={chipKey(g)}
                onClick={() => setFilter({ genre: g })}
                className={'genre-pill ' + (genre === g ? 'active' : '')}
              >
                {g}
              </button>
            ))}
          </ChipsRow>
        ) : (
          <div className="flex gap-1.5">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="skeleton h-[30px] w-[76px]" />
            ))}
          </div>
        )}
      </div>

      {status === 'loading' || status === 'idle' ? <GridSkeleton /> : null}

      {status === 'error' ? (
        <ErrorCard errorMsg={errorMsg} onRetry={retry} />
      ) : null}

      {status === 'ready' && note ? (
        <p data-testid="disc-note" className="mt-5 border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-gold">
          {note}
        </p>
      ) : null}

      {status === 'ready' && !note && !items.length ? (
        <EmptyPane genre={genre} sortLabel={sortLabel} />
      ) : null}

      {status === 'ready' && items.length ? (
        <>
          <div data-testid="disc-grid" className="grid gap-x-[3px] gap-y-6 grid-cols-[repeat(auto-fill,minmax(150px,1fr))] mt-5">
            {items.map((item, i) => (
              <PosterCard
                key={item.type + item.id + i}
                testid="disc-card"
                item={item}
                onClick={() => onOpen({ id: item.id, type: item.type, name: item.name, poster: item.poster }, 'home')}
              />
            ))}
          </div>
          <div ref={sentinelRef} data-testid="disc-sentinel" className="h-2" />
          {loadingMore ? (
            <div data-testid="disc-more" className="flex justify-center py-6">
              <div className="spinner" role="status" />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
