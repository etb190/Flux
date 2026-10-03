/* ── Home feed: rows of Stitch backdrop cards ─────────────────────────────
 * Rows (top → bottom):
 *   1. "Continue watching"        — local watch history (S/E badge + X)
 *   2. "Because you watched …"    — TMDB recommendations from the Watched list
 *   3. API rows                   — SA top 10s / popular / new + TMDB trending
 * The hero banner was removed in v0.13.0 (user preference).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import PosterCard, { BackdropCard } from './PosterCard.jsx';
import {
  ChevronLeftIcon, ChevronRightIcon, CloseIcon
} from './icons.jsx';

// ── Carousel row with arrow buttons (no scrollbar) ───────────────────────

function ArrowBtn({ dir, disabled, onClick }) {
  return (
    <button
      data-testid={'row-arrow-' + dir}
      aria-label={'Scroll ' + dir}
      disabled={disabled}
      onClick={onClick}
      className="row-arrow"
    >
      {dir === 'left' ? <ChevronLeftIcon size={15} /> : <ChevronRightIcon size={15} />}
    </button>
  );
}

function CarouselRow({ title, children, testid }) {
  const scrollerRef = useRef(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const [noScroll, setNoScroll] = useState(true);

  const sync = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setNoScroll(max <= 4);
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft < max - 4);
  }, []);

  useEffect(() => {
    sync();
    const el = scrollerRef.current;
    if (!el) return undefined;
    el.addEventListener('scroll', sync, { passive: true });
    // scrollWidth settles as art loads — re-check + observe resizes
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    const t1 = setTimeout(sync, 900);
    const t2 = setTimeout(sync, 2600);
    return () => {
      el.removeEventListener('scroll', sync);
      ro.disconnect();
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [sync, children]);

  const page = () =>
    Math.max((scrollerRef.current ? scrollerRef.current.clientWidth : 600) * 0.85, 320);

  return (
    <section data-testid={testid || 'home-row'} className="mt-7">
      <div className="flex items-center justify-between mb-2.5">
        <h2 className="text-[13.5px] font-semibold tracking-wide text-[#e2e6f0]">{title}</h2>
        {noScroll ? null : (
          <div className="flex gap-1.5">
            <ArrowBtn dir="left" disabled={!canLeft}
              onClick={() => scrollerRef.current?.scrollBy({ left: -page(), behavior: 'smooth' })} />
            <ArrowBtn dir="right" disabled={!canRight}
              onClick={() => scrollerRef.current?.scrollBy({ left: page(), behavior: 'smooth' })} />
          </div>
        )}
      </div>
      <div ref={scrollerRef} className="row-scroll flex gap-3.5 overflow-x-auto pb-2 -mx-1 px-1">
        {children}
      </div>
    </section>
  );
}

// ── Continue watching (watch history) ─────────────────────────────────────

function HistoryCard({ entry, onOpen, onRemove }) {
  const badge = entry.type === 'series'
    ? 'S' + (entry.season ?? 1) + ' E' + (entry.episode ?? 1)
    : null;
  return (
    <div className="w-[236px] shrink-0 snap-start">
      <div className="relative">
        <BackdropCard
          item={{
            id: entry.imdbId, type: entry.type, name: entry.title,
            poster: entry.poster, backdrop: entry.backdrop || null,
            year: entry.type === 'movie' ? (entry.year || '') : ''
          }}
          badge={badge}
          badgeTestid="cw-badge"
          onClick={() => onOpen({
            id: entry.imdbId, type: entry.type,
            name: entry.title, poster: entry.poster
          })}
        />
        <button
          data-testid="cw-remove"
          title="Remove from Continue watching"
          aria-label="Remove from Continue watching"
          onClick={(e) => { e.stopPropagation(); onRemove(entry); }}
          className="card-x z-10"
        >
          <CloseIcon size={13} />
        </button>
      </div>
    </div>
  );
}

function ContinueRow({ active, onOpen }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!active) return undefined;
    let alive = true;
    const api = window.fluxAPI;
    if (!api || typeof api.historyList !== 'function') return undefined;
    Promise.resolve(api.historyList())
      .then((list) => { if (alive) setItems(Array.isArray(list) ? list : []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [active]);

  const remove = useCallback(async (entry) => {
    const api = window.fluxAPI;
    if (api && typeof api.historyRemove === 'function') {
      try { await api.historyRemove(entry.imdbId); } catch (_err) { /* ignore */ }
    }
    setItems((list) => list.filter((it) => it.imdbId !== entry.imdbId));
  }, []);

  if (!items.length) return null;
  return (
    <CarouselRow title="Continue Watching" testid="continue-row">
      {items.map((entry) => (
        <HistoryCard
          key={entry.imdbId + entry.type}
          entry={entry}
          onOpen={onOpen}
          onRemove={remove}
        />
      ))}
    </CarouselRow>
  );
}

// ── Suggestions ("Because you watched …", TMDB) ───────────────────────────

function SuggestionCard({ item, onOpen }) {
  const open = useCallback(async () => {
    const api = window.fluxAPI;
    if (!api || typeof api.tmdbToImdb !== 'function') return;
    let imdbId = item.imdbId;
    if (!imdbId) {
      try {
        const res = await api.tmdbToImdb(item.tmdbId, item.tmdbType);
        imdbId = res && res.imdbId;
      } catch (_err) { return; }
    }
    if (!imdbId) return;
    onOpen({ id: imdbId, type: item.tmdbType, name: item.name, poster: item.poster });
  }, [item, onOpen]);

  return (
    <div className="w-[236px] shrink-0 snap-start">
      <BackdropCard
        item={{
          id: item.tmdbId, type: item.tmdbType, name: item.name,
          poster: item.poster, backdrop: item.backdrop || null,
          year: item.year || '', imdbRating: item.imdbRating
        }}
        onClick={open}
      />
    </div>
  );
}

function SuggestionRows({ active, onOpen }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (!active) return undefined;
    let alive = true;
    const api = window.fluxAPI;
    if (!api || typeof api.getSuggestions !== 'function') return undefined;
    Promise.resolve(api.getSuggestions())
      .then((data) => {
        if (!alive) return;
        setRows(data && Array.isArray(data.rows)
          ? data.rows.filter((r) => r.items && r.items.length)
          : []);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [active]);

  if (!rows.length) return null;
  return (
    <>
      {rows.map((row) => (
        <CarouselRow key={row.title} title={row.title} testid="suggestion-row">
          {row.items.map((item) => (
            <SuggestionCard
              key={(item.tmdbType || '') + (item.tmdbId || item.name)}
              item={item}
              onOpen={onOpen}
            />
          ))}
        </CarouselRow>
      ))}
    </>
  );
}

// ── States ────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div data-testid="home-loading" className="-mt-6">
      <div className="skeleton h-3.5 w-40 mt-8" />
      <div className="flex gap-3.5 mt-4 overflow-hidden">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="skeleton w-[236px] aspect-[16/9] shrink-0" />
        ))}
      </div>
      <div className="skeleton h-3.5 w-40 mt-8" />
      <div className="flex gap-3.5 mt-4 overflow-hidden pb-6">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="skeleton w-[236px] aspect-[16/9] shrink-0" />
        ))}
      </div>
    </div>
  );
}

function SetupCard({ onOpenSettings }) {
  return (
    <div data-testid="home-setup" className="flex justify-center py-24 px-6">
      <div className="max-w-xl bg-raised border border-edge rounded-xl p-8 text-center">
        <h2 className="text-xl font-semibold mb-3">Set up the home page</h2>
        <p className="text-dim text-[15px] leading-relaxed">
          The home page mixes the Streaming Availability API (daily Top&nbsp;10
          lists, popular titles per service, new &amp; leaving soon) with TMDB
          trending. Flux ships with a working key, so you only see this if the
          key was cleared — paste your own (free at{' '}
          <a
            className="text-accent hover:underline"
            href="https://developers.movieofthenight.com"
            title="Get a free API key"
          >
            developers.movieofthenight.com
          </a>
          ) in Settings.
        </p>
        <button
          data-testid="home-setup-btn"
          onClick={onOpenSettings}
          className="mt-6 rounded-lg bg-accent px-5 py-2.5 font-bold text-white hover:bg-[#f6121d] transition-colors"
        >
          Open Settings
        </button>
        <p className="mt-4 text-sm text-muted">Search keeps working without a key.</p>
      </div>
    </div>
  );
}

function ErrorCard({ errorMsg, onRetry }) {
  return (
    <div data-testid="home-error" className="flex justify-center py-24 px-6">
      <div className="max-w-xl bg-raised border border-edge rounded-xl p-8 text-center">
        <h2 className="text-xl font-semibold mb-3">Couldn&rsquo;t load the home page</h2>
        <p data-testid="home-error-msg" className="text-dim text-[15px]">{errorMsg}</p>
        <button
          data-testid="home-retry"
          onClick={onRetry}
          className="mt-6 rounded-lg bg-accent px-5 py-2.5 font-bold text-white hover:bg-[#f6121d] transition-colors"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

// ── Feed body ─────────────────────────────────────────────────────────────

function HomeBody({ data, onOpen, active }) {
  return (
    <div data-testid="home-body">
      <ContinueRow active={active} onOpen={onOpen} />
      <SuggestionRows active={active} onOpen={onOpen} />
      {data.notice ? (
        <p
          data-testid="home-notice"
          className="mt-4 rounded-lg border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-gold"
        >
          {data.notice}
        </p>
      ) : null}
      {(data.rows || []).map((row, ri) =>
        row.items && row.items.length ? (
          <CarouselRow key={row.key || ri} title={row.title}>
            {row.items.map((item, ii) => (
              <div key={ii} className="w-[236px] shrink-0 snap-start">
                <BackdropCard item={item} onClick={() => onOpen(item)} />
              </div>
            ))}
          </CarouselRow>
        ) : null
      )}
      <p className="py-6 text-[11px] leading-relaxed text-muted/80">
        Home data by the Streaming Availability API (Movie of the Night) &middot;
        Trending &amp; suggestions by TMDB. This product uses the TMDB API but
        is not endorsed or certified by TMDB.
      </p>
    </div>
  );
}

// ── HomeView ──────────────────────────────────────────────────────────────

export default function HomeView({ home, onOpen, onOpenSettings }) {
  return (
    <div className="min-h-full">
      {home.status === 'loading' || home.status === 'idle' ? (
        <Skeleton />
      ) : home.status === 'setup' ? (
        <SetupCard onOpenSettings={onOpenSettings} />
      ) : home.status === 'error' ? (
        <ErrorCard errorMsg={home.errorMsg} onRetry={() => home.load(true)} />
      ) : (
        <HomeBody data={home.data} onOpen={onOpen} active />
      )}
    </div>
  );
}
