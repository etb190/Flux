/* ── Sources view — Stitch "Available Streaming Sources & Mirrors" section ─
 * Section header with the red server glyph + operational badge, filter row,
 * and uniform server cards: icon tile, name, format/quality chips, meta line
 * and a red "Stream Now" action.
 * Ordering (user spec): FSOnline first, then Movy, then sources with a
 * known size, then everything else — embed players are gone entirely. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { GB, fmtSize } from '../lib/format.js';
import {
  PlayIcon, SearchIcon, DnsIcon, BoltIcon, CloudIcon, FilmIcon,
  ChevronDownIcon, CheckIcon
} from './icons.jsx';

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (_err) {
    return '';
  }
}

/* ── Size filter — custom square dropdown ─────────────────────────────
 * The native <select> popup is drawn by Windows and stays ROUNDED no
 * matter what CSS says, so the dropdown is rebuilt as a button + popup
 * list inside the DOM (the zero-border-radius rule covers it).
 */
const SIZE_OPTIONS = [
  { id: 'all', label: 'All sizes' },
  { id: 'gt1gb', label: 'Greater than 1 GB' },
  { id: 'lt1gb', label: 'Less than 1 GB' }
];

function SizeSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const current = SIZE_OPTIONS.find((o) => o.id === value) || SIZE_OPTIONS[0];

  // Outside click closes; Esc closes ONLY the popup (capture handler
  // swallows the keydown so the app-level Esc chain doesn't fire too).
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        id="sources-size"
        data-testid="sources-size"
        title="Filter by size"
        aria-label="Filter by size"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="detail-select-btn"
      >
        <span>{current.label}</span>
        <ChevronDownIcon
          size={14}
          className={'text-dim transition-transform duration-150 ' + (open ? 'rotate-180' : '')}
        />
      </button>

      {open ? (
        <ul
          data-testid="sources-size-menu"
          role="listbox"
          aria-label="Filter by size"
          className="absolute left-0 top-full mt-1 min-w-full z-40 bg-[#1c1c1c] border border-edge py-1 shadow-2xl shadow-black/70"
        >
          {SIZE_OPTIONS.map((opt) => (
            <li key={opt.id} role="presentation">
              <button
                data-testid="sources-size-option"
                data-value={opt.id}
                role="option"
                aria-selected={opt.id === value}
                onClick={() => { onChange(opt.id); setOpen(false); }}
                className={
                  'w-full flex items-center gap-2 whitespace-nowrap text-left px-3.5 py-2 text-[13px] transition-colors ' +
                  (opt.id === value
                    ? 'text-white bg-hover font-semibold'
                    : 'text-[#d4d4d4] hover:bg-hover/70 hover:text-white')
                }
              >
                {opt.id === value
                  ? <CheckIcon size={13} className="text-accent shrink-0" />
                  : <span className="w-[13px] shrink-0" />}
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function SourceRow({ src, onPlay }) {
  const formatClass =
    src.format === 'HLS'
      ? 'bg-accent/15 text-accent'
      : src.format === 'DASH'
        ? 'bg-gold/15 text-gold'
        : 'bg-movie/15 text-movie';
  const sizeLabel = fmtSize(src.sizeBytes);
  const host = hostOf(src.url);
  const tile = src.format === 'HLS'
    ? <BoltIcon size={20} />
    : src.format === 'DASH'
      ? <FilmIcon size={20} />
      : <CloudIcon size={20} />;

  return (
    <div
      data-testid="source-row"
      data-provider={src.provider || ''}
      onClick={() => onPlay(src)}
      className="group relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 p-4 sm:p-5 bg-[#161616] hover:bg-[#1d1d1d] border border-white/5 hover:border-white/15 cursor-pointer transition-all duration-200"
    >
      <div className="flex items-center gap-4 min-w-0">
        <div className="w-11 h-11 flex items-center justify-center shrink-0 bg-[#232323] text-[#9b9b9b]">
          {tile}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-white truncate max-w-full">
              {src.title || src.provider || 'Source'}
            </span>
            <span className={'px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ' + formatClass}>
              {src.format || 'LINK'}
            </span>
            {src.quality ? (
              <span className="px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400 bg-emerald-500/20">
                {src.quality}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2 text-xs text-[#6f6f6f] mt-1.5 flex-wrap">
            {src.description ? (
              <span className="text-[#b8b8b8] font-medium">{src.description}</span>
            ) : null}
            {host ? (
              <>
                {src.description ? <span>&bull;</span> : null}
                <span>{host}</span>
              </>
            ) : null}
            {sizeLabel ? (
              <>
                <span>&bull;</span>
                <span className="font-mono">{sizeLabel}</span>
              </>
            ) : null}
          </div>
        </div>
      </div>
      <button
        data-testid="source-play"
        title="Play this source"
        className="px-4 sm:px-5 py-2.5 bg-accent hover:bg-red-700 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors shrink-0 self-start sm:self-auto"
      >
        <PlayIcon size={15} />
        Stream Now
      </button>
    </div>
  );
}

export default function SourcesView({ meta, episode, scan, onPlay }) {
  const [query, setQuery] = useState('');
  const [sizeFilter, setSizeFilter] = useState('all');

  const normalizedQuery = query.trim().toLowerCase();

  // Rank groups (stable within a group — arrival order preserved):
  //   0 FSOnline · 1 Movy · 2 has a known size · 3 everything else
  const rank = (src) => {
    const p = String(src.provider || '').toLowerCase();
    if (p === 'fsonline') return 0;
    if (p === 'movy') return 1;
    if (src.sizeBytes != null) return 2;
    return 3;
  };

  const { rows, shown } = useMemo(() => {
    const matches = (src) => {
      if (normalizedQuery) {
        const hay = ((src.title || '') + ' ' + (src.provider || '') + ' ' +
          (src.description || '')).toLowerCase();
        if (!hay.includes(normalizedQuery)) return false;
      }
      if (sizeFilter === 'gt1gb' && (src.sizeBytes == null || src.sizeBytes <= GB)) return false;
      if (sizeFilter === 'lt1gb' && (src.sizeBytes == null || src.sizeBytes >= GB)) return false;
      return true;
    };
    const kept = [];
    for (const src of scan.sources) {
      if (matches(src)) kept.push(src);
    }
    // Array.sort is stable in V8 — FSOnline/Movy keep their internal order
    kept.sort((a, b) => rank(a) - rank(b));
    return { rows: kept, shown: kept.length };
  }, [scan.sources, normalizedQuery, sizeFilter]);

  const isSeries = meta.type === 'series';
  const title = isSeries
    ? 'S' + (episode.season ?? 1) + ' E' + (episode.episode ?? 1) + ' \u00b7 ' + episode.title
    : episode.title;

  // Status line: scanning → summary → error, plus filter info.
  let status;
  if (scan.scanError) {
    status = scan.scanError;
  } else if (scan.summaryText !== null) {
    status = scan.summaryText;
  } else {
    status = 'Scanning ' + scan.providerCount + ' providers\u2026';
  }
  if (scan.sources.length > 0 && (normalizedQuery || sizeFilter !== 'all')) {
    status += ' \u00b7 showing ' + shown + ' of ' + scan.sources.length;
  }

  const showEmpty = scan.summaryText !== null && scan.sources.length === 0;
  const showNomatch = scan.sources.length > 0 && shown === 0;
  const scanning = scan.summaryText === null && !scan.scanError;

  return (
    <div data-testid="sources-view" className="detail-page flex-1 px-8 py-7">
      {/* Section header (Stitch "Available Streaming Sources & Mirrors") */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="min-w-0">
          <h2
            data-testid="sources-title"
            className="text-lg font-bold text-white flex items-center gap-2"
          >
            <span className="text-accent shrink-0"><DnsIcon size={20} /></span>
            <span className="truncate">Available Streaming Sources &amp; Mirrors</span>
          </h2>
          <p data-testid="sources-sub" className="text-xs text-[#9b9b9b] mt-0.5 truncate">
            {isSeries ? title + ' \u2014 ' + meta.name : meta.name}
            {' '}
            &middot; pick a node for the best playback quality
          </p>
        </div>
        {scan.sources.length > 0 && !scanning ? (
          <span className="text-xs px-3 py-1 bg-emerald-500/10 text-emerald-400 font-medium flex items-center gap-2 border border-emerald-500/20 shrink-0">
            <span className="w-2 h-2 bg-emerald-400 animate-pulse" />
            {scan.sources.length} source{scan.sources.length > 1 ? 's' : ''} operational
          </span>
        ) : scanning ? (
          <span className="text-xs px-3 py-1 bg-amber-500/10 text-amber-300 font-medium flex items-center gap-2 border border-amber-500/20 shrink-0">
            <span className="w-2 h-2 bg-amber-300 animate-pulse" />
            Scanning
          </span>
        ) : null}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 my-4">
        <div className="relative flex-1 max-w-sm">
          <SearchIcon size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim pointer-events-none" />
          <input
            data-testid="sources-search"
            type="text"
            value={query}
            placeholder="Filter sources..."
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-search border border-edge pl-8 pr-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-[#3d3d3d]"
          />
        </div>
        <SizeSelect value={sizeFilter} onChange={setSizeFilter} />
      </div>

      <div data-testid="sources-status" className="text-sm text-dim mb-3">
        {status}
      </div>

      {showEmpty ? (
        <div data-testid="sources-empty" className="py-16 text-center">
          <h3 className="text-lg font-semibold">No sources found</h3>
          <p className="text-dim mt-1">None of the providers had this episode. Try another one.</p>
        </div>
      ) : null}
      {showNomatch ? (
        <div data-testid="sources-nomatch" className="py-10 text-center text-dim">
          No sources match the current filter.
        </div>
      ) : null}

      {/* Server cards stack */}
      <div data-testid="sources-list" className="flex flex-col gap-3">
        {rows.map((src, i) => (
          <SourceRow
            key={src.url + i}
            src={src}
            onPlay={onPlay}
          />
        ))}
      </div>
    </div>
  );
}
