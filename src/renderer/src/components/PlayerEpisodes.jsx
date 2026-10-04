/* ── Player episodes panel (in-player episode switcher) ────────────────────
 * Concept ported from the original repo's player_episodes_panel.dart: a
 * seasons strip on top (arrow-scrollable, auto-centered on the season you
 * are watching) with the episode list stacked underneath (scrolls up and
 * down, auto-scrolled to the episode you are watching). The styling is
 * Flux's own — black surface, zero radius, red accent. Picking an episode
 * hands it to the app, which drops you on its sources screen.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { buildSeasonTabs } from '../lib/format.js';
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from './icons.jsx';

export default function PlayerEpisodes({ meta, episode, onPick, onClose }) {
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

  const tab = seasonTabs[tabIdx] || seasonTabs[0];
  const isCurrent = (v) => episode &&
    (v.season ?? 1) === (episode.season ?? 1) &&
    (v.episode ?? 1) === (episode.episode ?? 1);

  // Open → center the active season pill, then land the list on the
  // episode being watched (the reason this panel exists).
  useEffect(() => {
    const pill = seasonsRef.current &&
      seasonsRef.current.querySelector('[data-active="true"]');
    if (pill && typeof pill.scrollIntoView === 'function') {
      pill.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
    const t = setTimeout(() => {
      if (activeRowRef.current && typeof activeRowRef.current.scrollIntoView === 'function') {
        activeRowRef.current.scrollIntoView({ block: 'center' });
      }
    }, 80);
    return () => clearTimeout(t);
  }, [tabIdx]);

  const pageScroll = (dir) => {
    const el = seasonsRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(el.clientWidth * 0.8, 240), behavior: 'smooth' });
  };

  if (!seasonTabs.length) {
    return (
      <div
        data-testid="player-episodes-panel"
        className="absolute inset-0 z-20 flex flex-col bg-[#0a0a0a]/[0.96]"
      >
        <PanelHeader meta={meta} onClose={onClose} />
        <div className="flex-1 flex items-center justify-center text-dim text-sm">
          No episode data available for this series.
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="player-episodes-panel"
      className="absolute inset-0 z-20 flex flex-col bg-[#0a0a0a]/[0.96]"
    >
      <PanelHeader meta={meta} onClose={onClose} />

      {/* Seasons strip — arrows scroll it left / right */}
      <div className="relative px-5 mt-1">
        <div
          ref={seasonsRef}
          data-testid="pe-season-row"
          className="epi-scroll flex gap-2 overflow-x-auto py-0.5 scroll-dark"
        >
          {seasonTabs.map((t, idx) => (
            <button
              key={t.label + idx}
              data-testid="pe-season-pill"
              data-active={idx === tabIdx || undefined}
              onClick={() => setTabIdx(idx)}
              className={'season-pill' + (idx === tabIdx ? ' active' : '')}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          data-testid="pe-season-left"
          aria-label="Scroll seasons left"
          onClick={() => pageScroll(-1)}
          className="epi-arrow epi-arrow-left"
        >
          <ChevronLeftIcon size={18} />
        </button>
        <button
          data-testid="pe-season-right"
          aria-label="Scroll seasons right"
          onClick={() => pageScroll(1)}
          className="epi-arrow epi-arrow-right"
        >
          <ChevronRightIcon size={18} />
        </button>
      </div>

      {/* Episodes — stacked vertically, scrolls up / down */}
      <div
        data-testid="pe-episode-list"
        className="flex-1 overflow-y-auto scroll-dark px-5 py-4"
      >
        <div className="flex flex-col gap-2 max-w-5xl mx-auto">
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
                  'group flex items-center gap-4 p-2.5 cursor-pointer border transition-colors duration-150 ' +
                  (cur
                    ? 'border-accent/70 bg-accent/[0.08] hover:bg-accent/[0.14]'
                    : 'border-white/5 bg-[#141414] hover:bg-[#1e1e1e] hover:border-white/15')
                }
              >
                <div className="relative w-[150px] aspect-video shrink-0 overflow-hidden bg-[#1d1d1d]">
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
                  <div className="text-[14px] font-semibold text-white truncate mt-0.5">
                    {ep.title || 'Episode'}
                  </div>
                  {ep.overview ? (
                    <div className="text-xs text-[#9e9e9e] line-clamp-1 mt-0.5">
                      {ep.overview}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PanelHeader({ meta, onClose }) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06] shrink-0">
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
