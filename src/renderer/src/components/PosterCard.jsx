/* ── Cards: poster (grids) + backdrop (home rows, Stitch style) ─────────── */

import { useState } from 'react';
import { FilmIcon } from './icons.jsx';

/* Poster card — 2:3 art for search results and the Watched grid */
export default function PosterCard({ item, onClick, testid }) {
  const [imgOk, setImgOk] = useState(true);
  const hasPoster = Boolean(item.poster);
  const showImg = hasPoster && imgOk;

  return (
    <div
      data-testid={testid || 'card'}
      title={item.name}
      onClick={onClick}
      className="w-full cursor-pointer group"
    >
      <div className="relative aspect-[2/3] overflow-hidden bg-inner border border-edge/70 shadow-[0_4px_14px_rgba(0,0,0,0.35)] transition-shadow duration-150 group-hover:shadow-[0_12px_24px_-6px_rgba(0,0,0,0.7)]">
        {showImg ? (
          <img
            src={item.poster}
            alt={item.name + ' poster'}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgOk(false)}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-dim">
            <FilmIcon size={34} />
          </div>
        )}

        {item.rank ? (
          <span className="rank-badge">{String(item.rank)}</span>
        ) : null}

        {item.imdbRating && item.imdbRating !== 'null' ? (
          <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/75 px-1.5 py-0.5 text-[11px] font-semibold text-gold">
            ★ {item.imdbRating}
          </span>
        ) : null}

        <span
          className={
            'absolute top-1.5 right-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white ' +
            (item.type === 'series' ? 'bg-series/80 !text-[#1c2230]' : 'bg-black/70')
          }
        >
          {item.type === 'series' ? 'Series' : 'Movie'}
        </span>
      </div>

      <div className="pt-2">
        <div className="text-[13px] font-medium text-ink truncate">{item.name}</div>
        <div className="text-xs text-muted truncate">{item.year || ''}</div>
      </div>
    </div>
  );
}

/* Backdrop card — 16:9 art with bottom gradient + uppercase title overlay
   (the Stitch home-row card). SQUARE corners and flush edges — matches the
   reference mock exactly (no rounding, no gaps between cards). Prefers the
   wide still/backdrop art, falls back to the poster cropped in.
   opts: { badge } renders the S/E + time-left chip,
         { progress } 0..1 renders the red progress bar. */
export function BackdropCard({ item, onClick, testid, badge, badgeTestid, progress }) {
  const [artOk, setArtOk] = useState(true);
  const art = item.backdrop || item.poster;
  const showArt = Boolean(art) && artOk;
  const pct = Number.isFinite(progress) && progress > 0 && progress < 1
    ? Math.min(1, progress) : null;

  return (
    <div
      data-testid={testid || 'card'}
      title={item.name}
      onClick={onClick}
      className="w-full cursor-pointer group relative hover:z-10"
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-inner transition-transform duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] group-hover:scale-[1.05] group-hover:shadow-[0_12px_24px_-6px_rgba(0,0,0,0.7)]">
        {showArt ? (
          <img
            src={art}
            alt={item.name}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setArtOk(false)}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center px-3 text-center text-[12.5px] font-bold uppercase tracking-wide text-[#454e66] bg-gradient-to-br from-[#1f2638] to-[#232c44]">
            {item.name}
          </div>
        )}

        <div className="absolute inset-0 backdrop-shade" />

        {badge ? (
          <span data-testid={badgeTestid} className="cw-badge">{badge}</span>
        ) : null}

        {item.rank ? (
          <span className="rank-badge">{String(item.rank)}</span>
        ) : null}

        <span className="backdrop-label">{item.name}</span>
        {item.year ? (
          <span className="backdrop-year">{item.year}</span>
        ) : null}

        {pct != null ? (
          <span className="cw-progress" aria-hidden="true">
            <span data-testid="cw-progress-fill" className="cw-progress-fill" style={{ width: (pct * 100).toFixed(1) + '%' }} />
          </span>
        ) : null}
      </div>
    </div>
  );
}
