/* ── Details page — Stitch "Netflix Movie Details Page" + "Netflix TV Show
 * Details & Episodes" screens (darker cinematic surface, full-bleed hero
 * with play + trailer actions, storyline + info card, season pill buttons
 * and episode cards in horizontal scroller rows with edge arrows) ────────
 *
 * LAYOUT NOTE: this view is plain BLOCK flow on purpose. The previous
 * flex-1/min-h-full chain let the overflow-hidden hero shrink to 0px on
 * long pages, which pushed the storyline visually above the hero — fixed
 * by keeping the page in normal document flow inside the scrollable main.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildSeasonTabs, fmtLeft } from '../lib/format.js';
import {
  PlayIcon, PlusIcon, CheckIcon, ThumbUpIcon,
  ChevronLeftIcon, ChevronRightIcon
} from './icons.jsx';

/* Netflix-style match percentage: IMDb 8.7 → 87% */
function matchPct(rating) {
  const n = parseFloat(rating);
  return Number.isFinite(n) && n > 0 && n <= 10 ? Math.round(n * 10) : null;
}

/* ── Horizontal scroller row with edge arrows (seasons / episodes) ──────── */

function HScroller({ children, testid, scrollerTestid }) {
  const scrollerRef = useRef(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const sync = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft < max - 4);
  }, []);

  useEffect(() => {
    sync();
    const el = scrollerRef.current;
    if (!el) return undefined;
    el.addEventListener('scroll', sync, { passive: true });
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    const t1 = setTimeout(sync, 600);
    const t2 = setTimeout(sync, 2000);
    return () => {
      el.removeEventListener('scroll', sync);
      ro.disconnect();
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [sync, children]);

  const page = () =>
    Math.max((scrollerRef.current ? scrollerRef.current.clientWidth : 600) * 0.8, 280);

  return (
    <div data-testid={testid} className="relative">
      <div
        ref={scrollerRef}
        data-testid={scrollerTestid}
        className="epi-scroll flex gap-[3px] overflow-x-auto py-0.5 px-8 -mx-8"
      >
        {children}
      </div>
      <button
        data-testid={testid + '-arrow-left'}
        aria-label="Scroll left"
        disabled={!canLeft}
        onClick={() => scrollerRef.current?.scrollBy({ left: -page(), behavior: 'smooth' })}
        className="epi-arrow epi-arrow-left"
      >
        <ChevronLeftIcon size={20} />
      </button>
      <button
        data-testid={testid + '-arrow-right'}
        aria-label="Scroll right"
        disabled={!canRight}
        onClick={() => scrollerRef.current?.scrollBy({ left: page(), behavior: 'smooth' })}
        className="epi-arrow epi-arrow-right"
      >
        <ChevronRightIcon size={20} />
      </button>
    </div>
  );
}

/* ── Hero: full-bleed backdrop + tag pills + huge title + meta + play ───── */

function Hero({ meta, onPlayPrimary, onPlayTrailer, onToggleWatched, inWatched, resume }) {
  const isSeries = meta.type === 'series';
  const pct = matchPct(meta.imdbRating);

  // Stitch series title: last word gets the red gradient treatment
  const words = String(meta.name || '').trim().split(/\s+/);
  const lastWord = isSeries && words.length > 1 ? words.pop() : null;
  const head = words.join(' ');

  const seasons = isSeries
    ? new Set((meta.videos || []).map((v) => v.season ?? 1)).size
    : 0;

  return (
    <section
      data-testid="details-hero"
      className="relative w-full overflow-hidden bg-[#0a0a0a]"
    >
      {/* Backdrop art */}
      <div className="absolute inset-0 overflow-hidden">
        {meta.background || meta.poster ? (
          <img
            src={meta.background || meta.poster}
            alt=""
            referrerPolicy="no-referrer"
            onError={(e) => e.currentTarget.remove()}
            className="w-full h-full object-cover opacity-50"
          />
        ) : null}
      </div>
      {/* Cinematic scrims (to-t / to-r) + red bleed, per the Stitch screens */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/60 to-transparent" />
      <div className="absolute inset-0 w-3/4 bg-gradient-to-r from-[#0a0a0a] via-[#0a0a0a]/85 to-transparent" />
      <div className="absolute -top-32 -left-20 w-96 h-96 bg-accent/15 blur-3xl pointer-events-none" />

      {/* Content */}
      <div className="relative z-10 px-8 pt-14 pb-7 max-w-4xl">
        {/* Type pill — plain "Series" / "Movie" */}
        <div className="flex items-center gap-2.5 mb-3 flex-wrap">
          <span className="text-accent font-black tracking-widest text-[11px] uppercase bg-black/40 px-2 py-0.5 shadow-sm">
            {isSeries ? 'Series' : 'Movie'}
          </span>
          {pct != null ? (
            <span
              data-testid="details-match"
              className="flex items-center gap-1 text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5"
            >
              <ThumbUpIcon size={13} /> {pct}% Match
            </span>
          ) : null}
          {resume ? (
            <span className="text-xs text-red-400/90 font-medium tracking-wider uppercase">
              &bull; Resume {resume}
            </span>
          ) : null}
        </div>

        {/* Title */}
        <h1
          data-testid="details-title"
          className="text-4xl md:text-5xl font-black tracking-tight text-white uppercase drop-shadow-2xl mb-3 leading-none select-none"
        >
          {head}{lastWord ? ' ' : ''}
          {lastWord ? (
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-red-600 to-accent">
              {lastWord}
            </span>
          ) : null}
        </h1>

        {/* Meta pills */}
        <div className="flex flex-wrap items-center gap-2 mb-4 text-xs font-semibold text-gray-300">
          {meta.year ? <span className="text-white">{meta.year}</span> : null}
          {meta.year ? <span className="text-gray-500">&bull;</span> : null}
          {meta.runtime ? <span>{meta.runtime}</span> : null}
          {meta.runtime ? <span className="text-gray-500">&bull;</span> : null}
          {isSeries && seasons > 0 ? (
            <>
              <span>{seasons} Season{seasons > 1 ? 's' : ''}</span>
              <span className="text-gray-500">&bull;</span>
            </>
          ) : null}
          {meta.imdbRating && meta.imdbRating !== 'null' ? (
            <span className="px-1.5 py-0.5 text-[10px] font-bold tracking-wider bg-neutral-800/80 text-amber-300 flex items-center gap-1">
              <span className="text-black font-black bg-amber-400 px-1 text-[9px]">IMDb</span>
              {meta.imdbRating}
            </span>
          ) : null}
        </div>

        {/* Short synopsis */}
        {meta.description ? (
          <p className="text-sm md:text-[15px] text-gray-300 line-clamp-2 md:line-clamp-3 mb-6 max-w-2xl leading-relaxed">
            {meta.description}
          </p>
        ) : null}

        {/* Actions — kept tight together */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            data-testid="find-sources"
            onClick={onPlayPrimary}
            className="flex items-center gap-2 px-6 py-2.5 bg-accent hover:bg-red-700 text-white font-bold shadow-xl shadow-red-950/40 transition-transform active:scale-95"
          >
            <PlayIcon size={20} />
            <span className="text-sm">
              {resume
                ? 'Resume ' + resume
                : isSeries ? 'Play S1:E1' : 'Play Movie'}
            </span>
          </button>
          {meta.trailer ? (
            <button
              data-testid="details-trailer"
              title="Watch the trailer"
              onClick={() => onPlayTrailer(meta.trailer)}
              className="flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/20 border border-white/15 text-white font-bold transition-colors"
            >
              <PlayIcon size={16} />
              <span className="text-sm">Trailer</span>
            </button>
          ) : null}
          <button
            data-testid="details-add-watched"
            title={inWatched ? 'In your Watched list' : 'Add to Watched list'}
            aria-label={inWatched ? 'In your Watched list' : 'Add to Watched list'}
            onClick={onToggleWatched}
            className={
              'w-10 h-10 flex items-center justify-center border transition-colors ' +
              (inWatched
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400'
                : 'bg-white/10 hover:bg-white/20 text-white border-white/10')
            }
          >
            {inWatched ? <CheckIcon size={17} /> : <PlusIcon size={18} />}
          </button>
        </div>
      </div>
    </section>
  );
}

/* ── Storyline / overview + info card (grid per the Stitch screens) ─────── */

function Overview({ meta }) {
  const isSeries = meta.type === 'series';
  const facts = (meta.genres || []).slice(0, 3);
  // Info card: genre + country only (user request — no cast/writer block)
  const rows = [
    ['Country:', meta.country],
    ['Genres:', (meta.genres || []).join(', ')]
  ].filter(([, v]) => v);

  return (
    <section
      data-testid="details-overview"
      className="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-5 border-b border-white/5"
    >
      <div className="lg:col-span-2 space-y-4 min-w-0">
        <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-400">
          {isSeries ? (
            <span className="w-1.5 h-1.5 bg-accent" />
          ) : null}
          {isSeries ? 'Series Overview' : 'Storyline'}
        </h2>
        {meta.description ? (
          <p className="text-[15px] leading-relaxed text-gray-200">
            {meta.description}
          </p>
        ) : (
          <p className="text-sm text-gray-500">No storyline available yet.</p>
        )}

        {isSeries ? (
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <span className="text-xs text-gray-500 font-semibold mr-1">
              VIBE &amp; TAGS:
            </span>
            {(meta.genres || []).slice(0, 5).map((g) => (
              <span
                key={g}
                className="px-2.5 py-1 text-xs font-medium text-gray-300 bg-[#212121]"
              >
                {g}
              </span>
            ))}
          </div>
        ) : facts.length ? (
          <div className="flex flex-wrap items-center gap-5 text-xs text-gray-400 pt-2">
            {facts.map((g) => (
              <span key={g} className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-accent shrink-0" />
                {g}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-3 text-xs bg-[#161616] p-5 border border-white/5">
        {rows.map(([label, value]) => (
          <div key={label}>
            <span className="text-gray-500 block mb-0.5">{label}</span>
            <span className="text-gray-200 leading-normal font-medium">
              {value}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Episodes: season pill row + episode card row (both scrollable) ─────── */

function EpisodeCard({ ep, onOpen }) {
  const [imgOk, setImgOk] = useState(true);
  const showImg = Boolean(ep.thumbnail) && imgOk;
  return (
    <div
      data-testid="episode-card"
      title={'Find sources for EP ' + (ep.episode ?? '')}
      onClick={() => onOpen(ep)}
      className="group w-[200px] shrink-0 snap-start bg-[#161616] hover:bg-[#1d1d1d] border border-white/5 hover:border-white/15 cursor-pointer transition-colors duration-150"
    >
      {/* Banner — 16:9, fills the card width, identical on every card */}
      <div className="relative w-full aspect-video overflow-hidden bg-[#1d1d1d]">
        {showImg ? (
          <img
            src={ep.thumbnail}
            alt={ep.title}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgOk(false)}
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#1f1f1f] to-[#242424] text-xl font-black text-[#4a4a4a]">
            {ep.episode != null ? ep.episode : '\u25B6'}
          </div>
        )}
        <div className="absolute inset-0 bg-black/25 group-hover:bg-black/5 transition-colors flex items-center justify-center">
          <span className="w-9 h-9 flex items-center justify-center bg-black/70 text-white group-hover:bg-accent transition-colors opacity-90 group-hover:opacity-100">
            <PlayIcon size={18} />
          </span>
        </div>
      </div>

      {/* Text block — FIXED heights so every card is exactly as tall */}
      <div className="px-2.5 pt-2 pb-2.5">
        <div className="h-[14px] text-[11px] font-bold uppercase tracking-wider text-accent leading-[14px]">
          EP {ep.episode ?? '?'}
        </div>
        <div className="h-[18px] mt-0.5 text-[13px] font-bold text-white leading-[18px] truncate">
          {ep.title || 'Episode'}
        </div>
        <div className="h-[30px] mt-1 text-[11px] leading-[15px] text-[#9e9e9e] overflow-hidden">
          <span className="line-clamp-2">{ep.overview || ''}</span>
        </div>
      </div>
    </div>
  );
}

function Episodes({ meta, onFindSources }) {
  const seasonTabs = useMemo(() => buildSeasonTabs(meta.videos || []), [meta]);
  const [currentTab, setCurrentTab] = useState(0);

  const tab = seasonTabs[currentTab] || seasonTabs[0];

  // Reset to the first season whenever a new series mounts
  useEffect(() => { setCurrentTab(0); }, [meta]);

  if (!seasonTabs.length) {
    return (
      <div className="bg-[#161616] border border-white/5 px-5 py-4 text-gray-400">
        No episode data available for this series yet.
      </div>
    );
  }

  return (
    <section data-testid="details-episodes" className="flex flex-col gap-2">
      <h2 className="text-xl font-bold text-white tracking-wide">Episodes</h2>

      {/* Season buttons — one line, scrollable with edge arrows */}
      <HScroller testid="season-row" scrollerTestid="season-scroll">
        {seasonTabs.map((t, idx) => (
          <button
            key={t.label + idx}
            data-testid="season-pill"
            data-season={t.label}
            onClick={() => setCurrentTab(idx)}
            className={'season-pill' + (idx === currentTab ? ' active' : '')}
          >
            {t.label}
          </button>
        ))}
      </HScroller>

      {/* Episode cards — one line, scrollable with edge arrows. The row is
          keyed by season so switching seasons snaps back to the start. */}
      <HScroller key={currentTab} testid="episodes-row" scrollerTestid="episodes-scroll">
        {tab.episodes.map((ep, i) => (
          <EpisodeCard key={ep.id + i} ep={ep} onOpen={onFindSources} />
        ))}
      </HScroller>
    </section>
  );
}

/* ── DetailsView ─────────────────────────────────────────────────────── */

export default function DetailsView({ meta, onFindSources, onPlayTrailer }) {
  const isSeries = meta.type === 'series';
  const [inWatched, setInWatched] = useState(false);
  const [resume, setResume] = useState(null);   // "S2 E5 · 28m left" | "42m left"
  const resumeEpRef = useRef(null);

  // Watched-list state + resume hint (from the Continue watching entry)
  useEffect(() => {
    let alive = true;
    const api = window.fluxAPI;
    if (!api) return undefined;
    if (typeof api.watchedList === 'function') {
      Promise.resolve(api.watchedList())
        .then((list) => {
          if (alive) {
            setInWatched((Array.isArray(list) ? list : []).some((w) =>
              w.imdbId === meta.id && w.type === meta.type));
          }
        })
        .catch(() => {});
    }
    if (typeof api.historyList === 'function') {
      Promise.resolve(api.historyList())
        .then((list) => {
          if (!alive) return;
          const entry = (Array.isArray(list) ? list : []).find((h) =>
            h.imdbId === meta.id && h.type === meta.type &&
            h.positionSec > 5 && !(h.durationSec > 0 &&
              h.positionSec > h.durationSec * 0.95));
          if (!entry) return;
          const left = fmtLeft(entry.positionSec, entry.durationSec);
          resumeEpRef.current = isSeries
            ? { season: entry.season ?? 1, episode: entry.episode ?? 1, title: entry.episodeTitle || '' }
            : { title: meta.name, season: 1, episode: 1 };
          setResume(isSeries
            ? 'S' + (entry.season ?? 1) + ' E' + (entry.episode ?? 1) + (left ? ' \u00b7 ' + left : '')
            : (left || 'where you left off'));
        })
        .catch(() => {});
    }
    return () => { alive = false; };
  }, [meta, isSeries]);

  const toggleWatched = () => {
    const api = window.fluxAPI;
    if (!api || typeof api.watchedAdd !== 'function') return;
    if (!inWatched) {
      Promise.resolve(api.watchedAdd({
        imdbId: meta.id, type: meta.type, title: meta.name,
        poster: meta.poster, genres: (meta.genres || []).slice(0, 6)
      })).then(() => setInWatched(true)).catch(() => {});
    }
  };

  const playPrimary = () => {
    if (resumeEpRef.current) {
      onFindSources(resumeEpRef.current);
      return;
    }
    if (isSeries) {
      const firstSeason = buildSeasonTabs(meta.videos || [])[0];
      const ep = firstSeason ? firstSeason.episodes[0] : null;
      onFindSources(ep || { title: meta.name, season: 1, episode: 1 });
    } else {
      onFindSources({ title: meta.name, season: 1, episode: 1 });
    }
  };

  return (
    <div data-testid="details-content" className="pb-12">
      <Hero
        meta={meta}
        resume={resume}
        inWatched={inWatched}
        onToggleWatched={toggleWatched}
        onPlayPrimary={playPrimary}
        onPlayTrailer={onPlayTrailer}
      />

      <div className="px-8 py-6 space-y-5">
        <Overview meta={meta} />

        {isSeries ? (
          <Episodes meta={meta} onFindSources={onFindSources} />
        ) : (
          <p className="text-xs text-gray-500">
            Pick a source below to start streaming &mdash; Flux scans public
            providers automatically for this title.
          </p>
        )}
      </div>
    </div>
  );
}
