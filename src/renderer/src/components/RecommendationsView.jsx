/* ── For You screen — stacked "Because you watched X" rows ────────────────
 * The home page used to carry a single suggestion row; this screen expands
 * the idea: one TMDB recommendations row per title you've watched (most
 * recent first, up to 20). Rows load independently — a title whose lookup
 * fails never blocks the rest. Cards open details through the shared
 * TMDB→IMDb bridge, exactly like the old home suggestion cards.
 */

import { useCallback, useEffect, useState } from 'react';
import { BackdropCard } from './PosterCard.jsx';
import { CarouselRow } from './HomeView.jsx';

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

function RecsSkeleton() {
  return (
    <div data-testid="recs-loading">
      {[...Array(3)].map((_, r) => (
        <div key={r} className="mt-6">
          <div className="skeleton h-3.5 w-56" />
          <div className="flex gap-[3px] mt-4 overflow-hidden">
            {[...Array(6)].map((__, i) => (
              <div key={i} className="skeleton w-[236px] aspect-[16/9] shrink-0" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function RecommendationsView({ active, onOpen }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const [watchedCount, setWatchedCount] = useState(null);

  useEffect(() => {
    if (!active) return undefined;
    let alive = true;
    setLoading(true);
    setNotice(null);

    const api = window.fluxAPI;
    if (!api || typeof api.recommendations !== 'function') {
      setLoading(false);
      setWatchedCount(0);
      return undefined;
    }

    // How many titles are watched → empty state copy (no watched list vs
    // TMDB having no suggestions for what you watched are different cases).
    Promise.resolve(typeof api.watchedList === 'function' ? api.watchedList() : [])
      .then((list) => { if (alive) setWatchedCount(Array.isArray(list) ? list.length : 0); })
      .catch(() => { if (alive) setWatchedCount(0); });

    Promise.resolve(api.recommendations())
      .then((data) => {
        if (!alive) return;
        if (data && data.error) setNotice(data.error);
        setRows(data && Array.isArray(data.rows)
          ? data.rows.filter((r) => r.items && r.items.length)
          : []);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => { alive = false; };
  }, [active]);

  return (
    <div data-testid="recs-view" className="min-h-full">
      <div className="flex items-end justify-between flex-wrap gap-2 mt-1 mb-1">
        <div>
          <h1 data-testid="recs-title" className="text-xl font-bold text-white flex items-center gap-2.5">
            <span className="text-accent"><SparkGlyph /></span>
            For You
          </h1>
          <p className="text-xs text-muted mt-0.5">
            Because you watched — a row of picks for everything you&rsquo;ve watched
          </p>
        </div>
        {notice ? (
          <span data-testid="recs-notice" className="text-xs px-3 py-1 bg-gold/10 text-gold border border-gold/40">
            {notice}
          </span>
        ) : null}
      </div>

      {loading ? (
        <RecsSkeleton />
      ) : rows.length ? (
        <div data-testid="recs-rows">
          {rows.map((row, ri) => (
            <CarouselRow
              key={row.title + ri}
              title={row.title}
              testid="recs-row"
              first={ri === 0}
            >
              {row.items.map((item, i) => (
                <SuggestionCard
                  key={(item.tmdbType || '') + '-' + (item.tmdbId || item.name) + '-' + i}
                  item={item}
                  onOpen={onOpen}
                />
              ))}
            </CarouselRow>
          ))}
        </div>
      ) : (
        <div data-testid="recs-empty" className="py-20 text-center">
          <h2 className="text-lg font-semibold text-white">Nothing here yet</h2>
          <p className="text-dim mt-2 max-w-md mx-auto text-sm">
            {watchedCount === 0
              ? 'Add titles to your Watched list and this page fills up with picks inspired by each one.'
              : 'No recommendations landed for what you\u2019ve watched. Add more titles or try again later.'}
          </p>
        </div>
      )}
    </div>
  );
}

/* Tiny inline sparkle so the header matches the sidebar icon */
function SparkGlyph() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden="true">
      <path fill="currentColor" d="M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25z" />
    </svg>
  );
}
