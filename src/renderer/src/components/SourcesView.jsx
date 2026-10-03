/* ── Sources view — Stitch "Available Streaming Sources & Mirrors" section ─
 * Section header with the red server glyph + operational badge, filter row,
 * and server cards: icon tile, name, format/quality chips, meta line and a
 * red "Stream Now" action. The first direct source gets the recommended
 * red-gradient treatment from the Stitch screen. */

import { useMemo, useState } from 'react';
import { GB, fmtSize } from '../lib/format.js';
import { PlayIcon, SearchIcon, DnsIcon, BoltIcon, CloudIcon, LinkIcon, FilmIcon } from './icons.jsx';

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (_err) {
    return '';
  }
}

function SourceRow({ src, recommended, onPlay }) {
  const formatClass =
    src.format === 'Embed'
      ? 'bg-series/15 text-series'
      : src.format === 'HLS'
        ? 'bg-accent/15 text-accent'
        : src.format === 'DASH'
          ? 'bg-gold/15 text-gold'
          : 'bg-movie/15 text-movie';
  const sizeLabel = fmtSize(src.sizeBytes);
  const host = hostOf(src.url);
  const tile = src.format === 'Embed'
    ? <LinkIcon size={20} />
    : src.format === 'HLS'
      ? <BoltIcon size={20} />
      : src.format === 'DASH'
        ? <FilmIcon size={20} />
        : <CloudIcon size={20} />;

  return (
    <div
      data-testid="source-row"
      onClick={() => onPlay(src)}
      className={
        'group relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 p-4 sm:p-5 rounded-xl border cursor-pointer transition-all duration-200 ' +
        (recommended
          ? 'bg-gradient-to-r from-red-950/30 via-[#161a26] to-[#161a26] border-red-500/30 hover:border-red-500/60'
          : 'bg-[#14161f] hover:bg-[#191d2c] border-white/5 hover:border-white/15') +
        (src.format === 'Embed' ? ' opacity-90' : '')
      }
    >
      <div className="flex items-center gap-4 min-w-0">
        <div
          className={
            'w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ' +
            (recommended
              ? 'bg-accent/20 text-accent'
              : 'bg-[#1c2233] text-[#8b94a9]')
          }
        >
          {tile}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-white truncate max-w-full">
              {src.title || src.provider || 'Source'}
            </span>
            {recommended ? (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-accent text-white uppercase tracking-wider">
                Recommended
              </span>
            ) : null}
            <span className={'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ' + formatClass}>
              {src.format || 'LINK'}
            </span>
            {src.quality ? (
              <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">
                {src.quality}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2 text-xs text-[#677189] mt-1.5 flex-wrap">
            {src.description ? (
              <span className="text-[#aab2c5] font-medium">{src.description}</span>
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
        className="px-4 sm:px-5 py-2.5 rounded-lg bg-accent hover:bg-red-700 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors shadow-sm shadow-red-600/20 shrink-0 self-start sm:self-auto"
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

  const { direct, embeds, shown } = useMemo(() => {
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
    const d = [];
    const e = [];
    let shown = 0;
    for (const src of scan.sources) {
      if (!matches(src)) continue;
      shown++;
      (src.format === 'Embed' ? e : d).push(src);
    }
    return { direct: d, embeds: e, shown };
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
  const rows = direct.concat(embeds);
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
          <p data-testid="sources-sub" className="text-xs text-[#8b94a9] mt-0.5 truncate">
            {title} &mdash; {meta.name} &middot; pick a node for the best playback quality
          </p>
        </div>
        {scan.sources.length > 0 && !scanning ? (
          <span className="text-xs px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 font-medium flex items-center gap-2 border border-emerald-500/20 shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            {scan.sources.length} source{scan.sources.length > 1 ? 's' : ''} operational
          </span>
        ) : scanning ? (
          <span className="text-xs px-3 py-1 rounded-full bg-amber-500/10 text-amber-300 font-medium flex items-center gap-2 border border-amber-500/20 shrink-0">
            <span className="w-2 h-2 rounded-full bg-amber-300 animate-pulse" />
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
            className="w-full rounded-lg bg-search border border-edge pl-8 pr-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-[#3a445c]"
          />
        </div>
        <select
          data-testid="sources-size"
          title="Filter by size"
          aria-label="Filter by size"
          value={sizeFilter}
          onChange={(e) => setSizeFilter(e.target.value)}
          className="detail-select"
        >
          <option value="all">All sizes</option>
          <option value="gt1gb">Greater than 1 GB</option>
          <option value="lt1gb">Less than 1 GB</option>
        </select>
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
            recommended={i === 0 && src.format !== 'Embed' && !showNomatch}
            onPlay={onPlay}
          />
        ))}
      </div>
    </div>
  );
}
