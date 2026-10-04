/* ── Library tab (sidebar): Watched + Want to watch ────────────────────────
 * One view serves both lists: search a title (Cinemeta, same source as the
 * topbar search), add it, remove entries from the grid. The "watched" list
 * drives the TMDB suggestion rows on the home page ("Because you watched").
 * The "want" list is the Want-to-watch backlog (mutually exclusive with
 * watched — handled in the main-process library).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PosterCard from './PosterCard.jsx';
import { CloseIcon, SearchIcon } from './icons.jsx';

const TYPE_LABEL = (t) => (t === 'series' ? 'Series' : 'Movie');

function WatchedHit({ item, added, onAdd }) {
  return (
    <div data-testid="watched-hit" className="watched-hit flex items-center gap-3 px-3 py-2">
      {item.poster ? (
        <img
          src={item.poster}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="w-[34px] h-[50px] object-cover bg-hover shrink-0"
          onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
        />
      ) : (
        <div className="w-[34px] h-[50px] bg-hover shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold truncate">{item.name}</div>
        <div className="text-xs text-dim">
          {[item.year, TYPE_LABEL(item.type)].filter(Boolean).join(' \u00b7 ')}
        </div>
      </div>
      <button
        data-testid="watched-add"
        onClick={() => { if (!added) onAdd(item); }}
        className={
          'shrink-0 px-3.5 py-1.5 text-xs font-bold text-white transition-colors ' +
          (added
            ? 'bg-[#1f8b4d] pointer-events-none'
            : 'bg-accent hover:bg-[#f6121d]')
        }
      >
        {added ? 'Added \u2713' : 'Add'}
      </button>
    </div>
  );
}

export default function WatchedView({ list = 'watched', onOpen }) {
  const isWant = list === 'want';
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [items, setItems] = useState([]);
  const seqRef = useRef(0);
  const debounceRef = useRef(null);
  const queryRef = useRef('');

  const refreshList = useCallback(() => {
    const api = window.fluxAPI;
    if (!api) return;
    const fetcher = isWant ? api.wantList : api.watchedList;
    if (typeof fetcher !== 'function') return;
    Promise.resolve(fetcher())
      .then((rows) => setItems(Array.isArray(rows) ? rows : []))
      .catch(() => {});
  }, [isWant]);

  useEffect(() => { refreshList(); }, [refreshList]);

  const isAdded = useCallback(
    (item) => items.some((w) => w.imdbId === item.id && w.type === item.type),
    [items]
  );

  const runSearch = useCallback(async (q) => {
    queryRef.current = q;
    const seq = ++seqRef.current;
    try {
      const api = window.fluxAPI;
      const rows = api && typeof api.search === 'function'
        ? await api.search(q)
        : [];
      if (seq !== seqRef.current) return;
      setResults(Array.isArray(rows) ? rows.slice(0, 12) : []);
    } catch (_err) {
      if (seq === seqRef.current) setResults([]);
    }
  }, []);

  const handleInput = useCallback((q) => {
    setQuery(q);
    clearTimeout(debounceRef.current);
    if (!q.trim()) {
      seqRef.current++;
      queryRef.current = '';
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => runSearch(q.trim()), 350);
  }, [runSearch]);

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const add = useCallback(async (item) => {
    const api = window.fluxAPI;
    if (!api) return;
    const adder = isWant ? api.wantAdd : api.watchedAdd;
    if (typeof adder !== 'function') return;
    try {
      const payload = {
        imdbId: item.id,
        type: item.type,
        title: item.name,
        poster: item.poster || null
      };
      if (!isWant) payload.genres = Array.isArray(item.genres) ? item.genres : [];
      const res = await adder(payload);
      const fresh = res && (isWant ? res.want : res.watched);
      if (fresh) setItems(fresh);
      else refreshList();
    } catch (_err) { /* leave the row as-is on failure */ }
  }, [isWant, refreshList]);

  const remove = useCallback(async (entry) => {
    const api = window.fluxAPI;
    if (!api) return;
    const remover = isWant ? api.wantRemove : api.watchedRemove;
    if (typeof remover !== 'function') return;
    try {
      const res = await remover(entry.imdbId);
      const fresh = res && (isWant ? res.want : res.watched);
      if (fresh) setItems(fresh);
      else setItems((rows) => rows.filter((w) => w.imdbId !== entry.imdbId));
    } catch (_err) { /* ignore */ }
  }, [isWant]);

  const sections = useMemo(() => {
    // Series first, movies underneath — for both lists.
    const series = items.filter((w) => w.type === 'series');
    const movies = items.filter((w) => w.type !== 'series');
    return [
      { key: 'series', label: 'Series', rows: series },
      { key: 'movie', label: 'Movies', rows: movies }
    ].filter((s) => s.rows.length > 0);
  }, [items]);

  return (
    <div data-testid="watched-view" className="max-w-[1060px]">
      <h2 className="text-[22px] font-extrabold mt-1">
        {isWant ? 'Want to Watch' : 'Watched'}
      </h2>

      <div className="relative max-w-md mt-4">
        <SearchIcon size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
        <input
          data-testid="watched-search"
          type="text"
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          placeholder="Search a movie or show to add..."
          autoComplete="off"
          spellCheck={false}
          className="w-full border border-transparent bg-search py-2.5 pl-9 pr-3.5 text-[13.5px] text-[#d4d4d4] outline-none placeholder:text-muted focus:border-[#3d3d3d]"
        />
      </div>

      {results.length ? (
        <div
          data-testid="watched-results"
          className="max-w-md mt-3 bg-raised border border-edge overflow-hidden divide-y divide-edge"
        >
          {results.map((item) => (
            <WatchedHit
              key={item.id + item.type}
              item={item}
              added={isAdded(item)}
              onAdd={add}
            />
          ))}
        </div>
      ) : null}

      <div className="flex items-baseline gap-2.5 mt-7 mb-3">
        <h3 className="text-[15.5px] font-bold">Your list</h3>
        {items.length ? (
          <span className="text-[12.5px] text-muted">
            {items.length} {items.length === 1 ? 'title' : 'titles'}
          </span>
        ) : null}
      </div>
      {items.length ? (
        sections.map((section) => (
          <section key={section.key} className="pb-2">
            <div className="flex items-baseline gap-2.5 mt-2 mb-3">
              <h3 data-testid={'watched-section-' + section.key} className="text-[15.5px] font-bold">
                {section.label}
              </h3>
              <span className="text-[12.5px] text-muted">
                {section.rows.length} {section.rows.length === 1 ? 'title' : 'titles'}
              </span>
            </div>
            <div data-testid="watched-grid" className="grid grid-cols-[repeat(auto-fill,138px)] gap-4 pb-4">
              {section.rows.map((entry) => (
                <div key={entry.imdbId + entry.type} className="w-[138px]">
                  <div className="relative group">
                    <PosterCard
                      item={{ id: entry.imdbId, type: entry.type, name: entry.title, poster: entry.poster, year: null }}
                      onClick={() => onOpen({
                        id: entry.imdbId, type: entry.type,
                        name: entry.title, poster: entry.poster
                      })}
                    />
                    <button
                      data-testid="watched-remove"
                      title={isWant ? 'Remove from Want to watch' : 'Remove from Watched'}
                      aria-label={isWant ? 'Remove from Want to watch' : 'Remove from Watched'}
                      onClick={(e) => { e.stopPropagation(); remove(entry); }}
                      className="card-x z-10"
                    >
                      <CloseIcon size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))
      ) : (
        <div data-testid="watched-empty" className=" border border-dashed border-edge bg-raised px-5 py-8 text-center">
          <h4 className="text-[15px] font-semibold mb-1.5">Nothing here yet</h4>
          <p className="text-[13px] text-dim m-0">
            {isWant
              ? 'Search above and add what you want to watch later.'
              : 'Search above and add what you\u2019ve watched to unlock recommendations.'}
          </p>
        </div>
      )}
    </div>
  );
}
