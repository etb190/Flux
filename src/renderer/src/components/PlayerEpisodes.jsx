/* ── Player episodes sidebar (in-player episode switcher) ──────────────────
 * Concept ported from the original repo's player_episodes_panel.dart: a
 * seasons strip on top (auto-centered on the season you are watching) with
 * the episode list stacked underneath (scrolls up and down, auto-scrolled to
 * the episode you are watching). The styling is Flux's own — black surface,
 * zero radius, red accent. Picking an episode hands it to the app, which
 * drops you on its sources screen.
 *
 * Season arrows: row members, not overlays — they sit INSIDE the strip as
 * pill-styled blocks at each end (same #1c1c1c family as the pills, same
 * gap as between pills), with real space built for them. They never move,
 * however many times you click; a direction with nothing left just dims.
 *
 * Layout: a right-hand drawer, double the width of the nav rail (392px).
 * It slides in from the right and slides back out to the right; clicking
 * the video retracts it (PlayerView swallows that click so playback is
 * not toggled). The panel stays mounted while a series is playing so the
 * open/close transition can always play out.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildSeasonTabs } from '../lib/format.js';
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from './icons.jsx';

export default function PlayerEpisodes({ open, meta, episode, onPick, onClose }) {
  const seasonTabs = useMemo(() => buildSeasonTabs(meta.videos || []), [meta]);

  // Index of the season tab that holds the episode currently playing
  const activeTabIdx = useMemo(() => {
    if (!episode) return 0;
    const i = seasonTabs.findIndex((t) =>
      (t.episodes || []).some((v) =>
        (v.season ?? 1) === (episode.season ?? 1) &&
        (v.episode ?? 1) === (episode.episode ?? 1)));
    return i >= 0 ? i : 0;
  }, [seasonTabs, episode]);

  const [tabIdx, setTabIdx] = useState(activeTabIdx);
  // A new playback session remounts the panel — follow the playing season.
  useEffect(() => { setTabIdx(activeTabIdx); }, [activeTabIdx]);

  const seasonsRef = useRef(null);    // scrollable season pill strip
  const activeRowRef = useRef(null);  // the currently-playing episode row
  const [stripOverflow, setStripOverflow] = useState(false);
  const [canL, setCanL] = useState(false);
  const [canR, setCanR] = useState(false);

  const tab = seasonTabs[tabIdx] || seasonTabs[0];
  const isCurrent = (v) => episode &&
    (v.season ?? 1) === (episode.season ?? 1) &&
    (v.episode ?? 1) === (episode.episode ?? 1);

  // Open → center the active season pill, then land the list on the
  // episode being watched (the reason this panel exists). Wait for the
  // slide-in so the browser lays the drawer out at its resting position.
  useEffect(() => {
    if (!open) return undefined;
    const pill = seasonsRef.current &&
      seasonsRef.current.querySelector('[data-active="true"]');
    if (pill && typeof pill.scrollIntoView === 'function') {
      pill.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
    const t = setTimeout(() => {
      if (activeRowRef.current && typeof activeRowRef.current.scrollIntoView === 'function') {
        activeRowRef.current.scrollIntoView({ block: 'center' });
      }
    }, 90);
    return () => clearTimeout(t);
  }, [tabIdx, open]);

  const pageScroll = (dir) => {
    const el = seasonsRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(el.clientWidth * 0.8, 200), behavior: 'smooth' });
  };

  // Track strip overflow + edge position → arrows show/hide and dim.
  const syncStrip = useCallback(() => {
    const el = seasonsRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setStripOverflow(max > 4);
    setCanL(el.scrollLeft > 4);
    setCanR(el.scrollLeft < max - 4);
  }, []);

  useEffect(() => {
    syncStrip();
    const el = seasonsRef.current;
    if (!el) return undefined;
    el.addEventListener('scroll', syncStrip, { passive: true });
    const ro = new ResizeObserver(syncStrip);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', syncStrip);
      ro.disconnect();
    };
  }, [syncStrip, seasonTabs, tabIdx]);

  return (
    <div
      data-testid="player-episodes-panel"
      data-open={open || undefined}
      onClick={(e) => e.stopPropagation()}
      className={
        'absolute top-0 bottom-0 right-0 z-30 w-[392px] max-w-[86%] flex flex-col ' +
        'bg-[#0a0a0a] border-l border-white/[0.08] ' +
        'shadow-[-18px_0_44px_rgba(0,0,0,0.6)] ' +
        'transition-transform duration-300 ease-[cubic-bezier(0.22,0.61,0.36,1)] will-change-transform ' +
        (open ? 'translate-x-0 pointer-events-auto' : 'translate-x-full pointer-events-none')
      }
    >
      <PanelHeader meta={meta} onClose={onClose} />

      {!seasonTabs.length ? (
        <div className="flex-1 flex items-center justify-center text-dim text-sm px-6 text-center">
          No episode data available for this series.
        </div>
      ) : (
        <>
          {/* Seasons strip — the scroll arrows are members of the pill row
              (pill-styled blocks at each end, space built for them), not
              floating overlays. The pills pan between the fixed arrows.
              my-[2px] cancels the strip's py-0.5 so the arrows are exactly
              pill-height (36px). */}
          <div className="flex items-center gap-2 px-4 mt-2">
            {stripOverflow ? (
              <button
                data-testid="pe-season-left"
                aria-label="Scroll seasons left"
                onClick={() => pageScroll(-1)}
                className={'h-arrow my-[2px] shrink-0' + (!canL ? ' dim' : '')}
              >
                <ChevronLeftIcon size={16} />
              </button>
            ) : null}
            <div
              ref={seasonsRef}
              data-testid="pe-season-row"
              className="epi-scroll flex gap-2 overflow-x-auto py-0.5 scroll-dark min-w-0 flex-1"
            >
              {seasonTabs.map((t, idx) => (
                <button
                  key={t.label + idx}
                  data-testid="pe-season-pill"
                  data-active={idx === tabIdx || undefined}
                  onClick={() => setTabIdx(idx)}
                  className={'season-pill shrink-0' + (idx === tabIdx ? ' active' : '')}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {stripOverflow ? (
              <button
                data-testid="pe-season-right"
                aria-label="Scroll seasons right"
                onClick={() => pageScroll(1)}
                className={'h-arrow my-[2px] shrink-0' + (!canR ? ' dim' : '')}
              >
                <ChevronRightIcon size={16} />
              </button>
            ) : null}
          </div>

          {/* Episodes — stacked vertically, scrolls up / down */}
          <div
            data-testid="pe-episode-list"
            className="flex-1 overflow-y-auto scroll-dark px-4 py-3"
          >
            <div className="flex flex-col gap-2">
              {tab.episodes.map((ep, i) => {
                const cur = isCurrent(ep);
                return (
                  <div
                    key={(ep.id || '') + i}
                    ref={cur ? activeRowRef : null}
                    data-testid="pe-episode-row"
                    data-current={cur || undefined}
                    onClick={() => onPick(ep)}
                    className={
                      'group flex items-center gap-3 p-2 cursor-pointer border transition-colors duration-150 ' +
                      (cur
                        ? 'border-accent/70 bg-accent/[0.08] hover:bg-accent/[0.14]'
                        : 'border-white/5 bg-[#141414] hover:bg-[#1e1e1e] hover:border-white/15')
                    }
                  >
                    <div className="relative w-[112px] aspect-video shrink-0 overflow-hidden bg-[#1d1d1d]">
                      {ep.thumbnail ? (
                        <img
                          src={ep.thumbnail}
                          alt=""
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="absolute inset-0 w-full h-full object-cover"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      ) : null}
                      {!ep.thumbnail ? (
                        <div className="absolute inset-0 flex items-center justify-center text-lg font-black text-[#4a4a4a]">
                          {ep.episode != null ? ep.episode : ''}
                        </div>
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10.5px] font-bold tracking-[0.08em] text-accent uppercase">
                          E{ep.episode ?? '?'}
                        </span>
                        {cur ? (
                          <span className="text-[9.5px] font-bold tracking-[0.1em] uppercase text-white bg-accent px-1.5 py-px">
                            Now watching
                          </span>
                        ) : null}
                      </div>
                      <div className="text-[13.5px] font-semibold text-white truncate mt-0.5">
                        {ep.title || 'Episode'}
                      </div>
                      {ep.overview ? (
                        <div className="text-xs text-[#9e9e9e] line-clamp-2 mt-0.5">
                          {ep.overview}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PanelHeader({ meta, onClose }) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.06] shrink-0">
      <div className="min-w-0">
        <h2 data-testid="pe-title" className="text-base font-bold text-white flex items-center gap-2.5">
          <span className="w-1.5 h-1.5 bg-accent shrink-0" />
          Episodes
        </h2>
        <p className="text-[11px] text-muted mt-0.5 truncate">{meta ? meta.name : ''}</p>
      </div>
      <button
        data-testid="pe-close"
        title="Close episodes"
        aria-label="Close episodes"
        onClick={onClose}
        className="w-9 h-9 flex items-center justify-center text-[#c7c7c7] hover:text-white hover:bg-white/10 transition-colors shrink-0"
      >
        <CloseIcon size={15} />
      </button>
    </div>
  );
}
