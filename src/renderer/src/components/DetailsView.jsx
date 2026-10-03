/* ── Details page — Stitch "Netflix Movie Details Page" + "Netflix TV Show
 * Details & Episodes" screens (darker cinematic surface, split hero,
 * storyline + info card, season dropdown + episode rows) ──────────────── */

import { useEffect, useMemo, useRef, useState } from 'react';
import { buildSeasonTabs, formatAirDate, fmtLeft } from '../lib/format.js';
import {
  PlayIcon, PlusIcon, CheckIcon, ThumbUpIcon, ChevronDownIcon
} from './icons.jsx';

/* Netflix-style match percentage: IMDb 8.7 → 87% */
function matchPct(rating) {
  const n = parseFloat(rating);
  return Number.isFinite(n) && n > 0 && n <= 10 ? Math.round(n * 10) : null;
}

/* ── Hero: full-bleed backdrop + tag pills + huge title + meta + play ───── */

function Hero({ meta, onPlayPrimary, onToggleWatched, inWatched, resume }) {
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
      className="relative w-full overflow-hidden bg-[#0c0e14]"
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
      <div className="absolute inset-0 bg-gradient-to-t from-[#0f1117] via-[#0f1117]/60 to-transparent" />
      <div className="absolute inset-0 w-3/4 bg-gradient-to-r from-[#0f1117] via-[#0f1117]/85 to-transparent" />
      <div className="absolute -top-32 -left-20 w-96 h-96 bg-accent/15 rounded-full blur-3xl pointer-events-none" />

      {/* Content */}
      <div className="relative z-10 px-8 pt-14 pb-9 max-w-4xl">
        {/* Tag pill row */}
        <div className="flex items-center gap-2.5 mb-3 flex-wrap">
          <span className="text-accent font-black tracking-widest text-[11px] uppercase bg-black/40 px-2 py-0.5 rounded shadow-sm">
            F <span className="text-gray-300 font-semibold tracking-wider ml-1">
              {isSeries ? 'Series' : 'Movie'}
            </span>
          </span>
          {pct != null ? (
            <span
              data-testid="details-match"
              className="flex items-center gap-1 text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded"
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
            <span className="px-1.5 py-0.5 text-[10px] font-bold tracking-wider bg-slate-800/80 text-amber-300 rounded flex items-center gap-1">
              <span className="text-black font-black bg-amber-400 px-1 rounded text-[9px]">IMDb</span>
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

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            data-testid="find-sources"
            onClick={onPlayPrimary}
            className="flex items-center gap-2 px-6 py-2.5 bg-accent hover:bg-red-700 text-white font-bold rounded-lg shadow-xl shadow-red-950/40 transition-transform active:scale-95"
          >
            <PlayIcon size={20} />
            <span className="text-sm">
              {resume
                ? 'Resume ' + resume
                : isSeries ? 'Play S1:E1' : 'Play Movie'}
            </span>
          </button>
          <button
            data-testid="details-add-watched"
            title={inWatched ? 'In your Watched list' : 'Add to Watched list'}
            aria-label={inWatched ? 'In your Watched list' : 'Add to Watched list'}
            onClick={onToggleWatched}
            className={
              'w-10 h-10 flex items-center justify-center rounded-full border transition-colors ' +
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
  const rows = [
    ['Cast:', (meta.cast || []).slice(0, 6).join(', ')],
    ['Director:', meta.director],
    ['Writer:', meta.writer],
    ['Country:', meta.country],
    ['Genres:', (meta.genres || []).join(', ')]
  ].filter(([, v]) => v);

  return (
    <section
      data-testid="details-overview"
      className="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-8 border-b border-white/5"
    >
      <div className="lg:col-span-2 space-y-4 min-w-0">
        <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-400">
          {isSeries ? (
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
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
                className="px-2.5 py-1 text-xs font-medium text-gray-300 bg-[#1c1f2c] rounded-full"
              >
                {g}
              </span>
            ))}
          </div>
        ) : facts.length ? (
          <div className="flex flex-wrap items-center gap-5 text-xs text-gray-400 pt-2">
            {facts.map((g) => (
              <span key={g} className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                {g}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-3 text-xs bg-[#14161f] p-5 rounded-xl border border-white/5">
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

/* ── Episodes (season dropdown + sort + rows per the Stitch TV screen) ──── */

function EpisodeThumb({ src, alt, fallback }) {
  const [imgOk, setImgOk] = useState(true);
  const showImg = Boolean(src) && imgOk;
  return (
    <div className="relative w-full md:w-52 aspect-video md:h-28 shrink-0 overflow-hidden rounded-lg bg-slate-900">
      {showImg ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImgOk(false)}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-xl text-dim font-semibold">
          {fallback || '\uD83C\uDFAC'}
        </div>
      )}
      <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors flex items-center justify-center">
        <div className="w-10 h-10 rounded-full bg-black/70 flex items-center justify-center text-white group-hover:bg-accent group-hover:scale-110 transition-all shadow-lg">
          <PlayIcon size={20} />
        </div>
      </div>
    </div>
  );
}

function EpisodeRow({ ep, index, onOpen }) {
  return (
    <div
      data-testid="episode-row"
      title="Find sources for this episode"
      onClick={() => onOpen(ep)}
      className="group detail-card p-4 rounded-xl transition-all duration-200 flex flex-col md:flex-row items-start md:items-center gap-4 shadow-sm hover:shadow-md cursor-pointer"
    >
      <span className="text-lg md:text-xl font-black text-gray-500 w-6 text-center group-hover:text-accent transition-colors shrink-0">
        {index}
      </span>
      <EpisodeThumb
        src={ep.thumbnail}
        alt={ep.title}
        fallback={ep.episode != null ? String(ep.episode) : null}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <h3 className="text-sm font-bold text-white group-hover:text-red-400 transition-colors truncate">
            {ep.title}
          </h3>
        </div>
        {ep.overview ? (
          <p title={ep.overview} className="text-xs text-gray-400 leading-relaxed line-clamp-2 mb-2">
            {ep.overview}
          </p>
        ) : null}
        <div className="flex items-center gap-3 text-[11px] text-gray-500 font-medium">
          {ep.season != null && ep.episode != null ? (
            <span className="text-gray-400 font-semibold">S{ep.season} E{ep.episode}</span>
          ) : null}
          {formatAirDate(ep.released) ? (
            <>
              <span>&bull;</span>
              <span>Air date: {formatAirDate(ep.released)}</span>
            </>
          ) : null}
        </div>
      </div>
      <div className="flex items-center pr-2 text-gray-500 group-hover:text-white transition-colors">
        <PlayIcon size={20} />
      </div>
    </div>
  );
}

function Episodes({ meta, onFindSources }) {
  const seasonTabs = useMemo(() => buildSeasonTabs(meta.videos || []), [meta]);
  const [currentTab, setCurrentTab] = useState(0);
  const [reverse, setReverse] = useState(false);

  const tab = seasonTabs[currentTab] || seasonTabs[0];
  const episodes = useMemo(() => {
    if (!tab) return [];
    return reverse ? [...tab.episodes].reverse() : tab.episodes;
  }, [tab, reverse]);

  if (!seasonTabs.length) {
    return (
      <div className="mt-8 rounded-xl bg-[#14161f] border border-white/5 px-5 py-4 text-gray-400">
        No episode data available for this series yet.
      </div>
    );
  }

  return (
    <section data-testid="details-episodes" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-white tracking-wide">Episodes</h2>
          <div className="relative">
            <select
              data-testid="season-select"
              value={currentTab}
              onChange={(e) => setCurrentTab(Number(e.target.value))}
              className="detail-select pr-9"
            >
              {seasonTabs.map((t, idx) => (
                <option key={idx} value={idx}>
                  {t.label} ({t.episodes.length} Episode{t.episodes.length > 1 ? 's' : ''})
                </option>
              ))}
            </select>
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              <ChevronDownIcon size={15} />
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span className="text-gray-500">Sort:</span>
          <button
            data-testid="sort-original"
            onClick={() => setReverse(false)}
            className={
              'px-2.5 py-1 rounded transition-colors ' +
              (!reverse
                ? 'bg-[#161922] text-white font-medium'
                : 'hover:bg-slate-800/70 text-gray-400 hover:text-white')
            }
          >
            Original
          </button>
          <button
            data-testid="sort-reverse"
            onClick={() => setReverse(true)}
            className={
              'px-2.5 py-1 rounded transition-colors ' +
              (reverse
                ? 'bg-[#161922] text-white font-medium'
                : 'hover:bg-slate-800/70 text-gray-400 hover:text-white')
            }
          >
            Reverse
          </button>
        </div>
      </div>

      <div data-testid="episodes-list" className="space-y-3">
        {episodes.map((ep, i) => (
          <EpisodeRow
            key={ep.id + i}
            ep={ep}
            index={reverse ? episodes.length - i : i + 1}
            onOpen={onFindSources}
          />
        ))}
      </div>
    </section>
  );
}

/* ── DetailsView ─────────────────────────────────────────────────────────── */

export default function DetailsView({ meta, onFindSources }) {
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
    <div data-testid="details-content" className="detail-page flex-1 flex flex-col pb-12 min-h-full">
      <Hero
        meta={meta}
        resume={resume}
        inWatched={inWatched}
        onToggleWatched={toggleWatched}
        onPlayPrimary={playPrimary}
      />

      <div className="px-8 py-8 space-y-9">
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
