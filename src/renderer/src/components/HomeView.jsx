/* ── Home feed: rows of Stitch backdrop cards ─────────────────────────────
 * Rows (top → bottom):
 *   1. "Continue watching"        — local watch history (S/E badge + X)
 *   2. API rows                   — TMDB trending + Cinemeta addon catalogs
 *                                   (Popular / New / Featured / Last videos —
 *                                   Helix AddonManager port, keyless)
 * The "Because you watched …" rows moved to the For You screen in
 * v0.26.0 (user request — one row here, many there).
 * The hero banner was removed in v0.13.0 (user preference).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import PosterCard, { BackdropCard } from './PosterCard.jsx';
import { getMeta } from '../lib/cinemeta.js';
import { fmtLeft } from '../lib/format.js';
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

export function CarouselRow({ title, children, testid, first }) {
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
    <section data-testid={testid || 'home-row'} className={first ? 'mt-3' : 'mt-6'}>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[13.5px] font-semibold tracking-wide text-[#ededed]">{title}</h2>
        {noScroll ? null : (
          <div className="flex gap-1.5">
            <ArrowBtn dir="left" disabled={!canLeft}
              onClick={() => scrollerRef.current?.scrollBy({ left: -page(), behavior: 'smooth' })} />
            <ArrowBtn dir="right" disabled={!canRight}
              onClick={() => scrollerRef.current?.scrollBy({ left: page(), behavior: 'smooth' })} />
          </div>
        )}
      </div>
      <div ref={scrollerRef} className="row-scroll flex gap-[3px] py-2.5 -my-1 overflow-x-auto -mx-1 px-1">
        {children}
      </div>
    </section>
  );
}

// ── Continue watching (watch history) ─────────────────────────────────────

function HistoryCard({ entry, onResume, onRemove }) {
  const left = fmtLeft(entry.positionSec, entry.durationSec);
  const badge = entry.type === 'series'
    ? 'S' + (entry.season ?? 1) + ' E' + (entry.episode ?? 1) + (left ? ' \u00b7 ' + left : '')
    : (left || null);
  return (
    <div className="w-[236px] shrink-0 snap-start">
      {/* wrapper carries the group class so the hover X actually reveals
          (the X is a SIBLING of the card, not a descendant of it) */}
      <div className="group relative">
        <BackdropCard
          item={{
            id: entry.imdbId, type: entry.type, name: entry.title,
            poster: entry.poster,
            backdrop: entry.still || entry.backdrop || null,
            year: entry.type === 'movie' ? (entry.year || '') : ''
          }}
          badge={badge || undefined}
          badgeTestid="cw-badge"
          progress={entry.durationSec > 0
            ? entry.positionSec / entry.durationSec
            : null}
          onClick={() => onResume(entry)}
          title={'Resume' + (badge ? ' \u00b7 ' + badge : '')}
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

// Older entries (pre-v0.15) have no episode/movie still saved — pull the
// wide art from Cinemeta once, patch the store, and refresh the row cards.
function useStillEnrichment(items, setItems) {
  const busyRef = useRef(false);
  const triedRef = useRef(null);
  if (!triedRef.current) triedRef.current = new Set();
  useEffect(() => {
    if (busyRef.current) return;                 // one enrichment sweep at a time
    const missing = items.filter((e) =>
      !e.still && !triedRef.current.has(e.imdbId));
    if (!missing.length) return;
    busyRef.current = true;
    let alive = true;
    const queue = [...missing];
    for (const entry of queue) triedRef.current.add(entry.imdbId);
    const next = () => {
      const entry = queue.shift();
      if (!entry || !alive) {
        busyRef.current = false;
        return;
      }
      getMeta(entry.type, entry.imdbId)
        .then((meta) => {
          if (!meta || !alive) return;
          let still = meta.background || null;
          if (entry.type === 'series' && Array.isArray(meta.videos)) {
            const ep = meta.videos.find((v) =>
              (v.season ?? 1) === (entry.season ?? 1) &&
              (v.episode ?? 1) === (entry.episode ?? 1) && v.thumbnail);
            if (ep) still = ep.thumbnail;
          }
          if (!still) return;
          const api = window.fluxAPI;
          if (api && typeof api.historyProgress === 'function') {
            api.historyProgress(entry.imdbId, {
              still, backdrop: meta.background || null
            }).catch(() => {});
          }
          setItems((list) => list.map((it) =>
            it.imdbId === entry.imdbId
              ? { ...it, still, backdrop: meta.background || it.backdrop }
              : it
          ));
        })
        .catch(() => {})
        .finally(next);
    };
    next();
    return () => { alive = false; };
  }, [items, setItems]);
}

function ContinueRow({ active, onOpen, onResume, first }) {
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

  useStillEnrichment(items, setItems);

  const remove = useCallback(async (entry) => {
    const api = window.fluxAPI;
    if (api && typeof api.historyRemove === 'function') {
      try { await api.historyRemove(entry.imdbId); } catch (_err) { /* ignore */ }
    }
    setItems((list) => list.filter((it) => it.imdbId !== entry.imdbId));
  }, []);

  if (!items.length) return null;
  return (
    <CarouselRow title="Continue Watching" testid="continue-row" first={first}>
      {items.map((entry) => (
        <HistoryCard
          key={entry.imdbId + entry.type}
          entry={entry}
          onResume={onResume || onOpen}
          onRemove={remove}
        />
      ))}
    </CarouselRow>
  );
}

// ── States ────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div data-testid="home-loading" className="-mt-6">
      <div className="skeleton h-3.5 w-40 mt-8" />
      <div className="flex gap-[3px] mt-4 overflow-hidden">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="skeleton w-[236px] aspect-[16/9] shrink-0" />
        ))}
      </div>
      <div className="skeleton h-3.5 w-40 mt-8" />
      <div className="flex gap-[3px] mt-4 overflow-hidden pb-6">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="skeleton w-[236px] aspect-[16/9] shrink-0" />
        ))}
      </div>
    </div>
  );
}

function ErrorCard({ errorMsg, onRetry }) {
  return (
    <div data-testid="home-error" className="flex justify-center py-24 px-6">
      <div className="max-w-xl bg-raised border border-edge p-8 text-center">
        <h2 className="text-xl font-semibold mb-3">Couldn&rsquo;t load the home page</h2>
        <p data-testid="home-error-msg" className="text-dim text-[15px]">{errorMsg}</p>
        <button
          data-testid="home-retry"
          onClick={onRetry}
          className="mt-6 bg-accent px-5 py-2.5 font-bold text-white hover:bg-[#f6121d] transition-colors"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

// ── Feed body ─────────────────────────────────────────────────────────────

function HomeBody({ data, onOpen, active, onResume }) {
  return (
    <div data-testid="home-body">
      <ContinueRow active={active} onOpen={onOpen} onResume={onResume} first />
      {data.notice ? (
        <p
          data-testid="home-notice"
          className="mt-4 border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-gold"
        >
          {data.notice}
        </p>
      ) : null}
      {(data.rows || []).map((row, ri) =>
        row.items && row.items.length ? (
          <CarouselRow key={row.key || ri} title={row.title} first={ri === 0 && !(data.rows || []).slice(0, ri).some((r) => r.items && r.items.length) && !data.notice}>
            {row.items.map((item, ii) => (
              <div key={ii} className="w-[236px] shrink-0 snap-start">
                <BackdropCard item={item} onClick={() => onOpen(item)} />
              </div>
            ))}
          </CarouselRow>
        ) : null
      )}
    </div>
  );
}

// ── HomeView ──────────────────────────────────────────────────────────────

export default function HomeView({ home, onOpen, onResume }) {
  return (
    <div className="min-h-full">
      {home.status === 'loading' || home.status === 'idle' ? (
        <Skeleton />
      ) : home.status === 'error' ? (
        <ErrorCard errorMsg={home.errorMsg} onRetry={() => home.load(true)} />
      ) : (
        <HomeBody data={home.data} onOpen={onOpen} active onResume={onResume} />
      )}
    </div>
  );
}
