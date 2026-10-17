/* ── Sidebar (Stitch design): nav buttons + brand footer ─────────────────
 * Persistent left rail visible on every view (home, watched, want, results,
 * details). Home / Watched / Want to watch are the only destinations.
 * The FLUX brand lives in the custom title bar, so the rail is buttons only
 * (no "Menu" label — user request). The footer keeps the FLUX wordmark
 * (no version number — user request) with the black Discord mark across
 * from it; clicking the mark resets the Rich Presence connection.
 */

import { useCallback, useRef, useState } from 'react';
import { HomeIcon, DiscoverIcon, SparkIcon, EyeIcon, BookmarkIcon, DiscordIcon } from './icons.jsx';

export default function SideBar({ active, onTab }) {
  // Clicking the Discord badge resets Rich Presence (full RPC teardown +
  // reconnect, ending idle) — a manual fix for a stuck presence.
  const [resetting, setResetting] = useState(false);
  const resettingRef = useRef(false);
  const resetPresence = useCallback(() => {
    const api = typeof window !== 'undefined' ? window.fluxAPI : null;
    if (!api || typeof api.discordReset !== 'function' || resettingRef.current) return;
    resettingRef.current = true;             // double-click guard
    setResetting(true);
    Promise.resolve(api.discordReset())
      .catch(() => {})
      .finally(() => {
        resettingRef.current = false;
        setResetting(false);
      });
  }, []);

  const item = (id, label, icon) => (
    <button
      data-testid={'side-' + id}
      onClick={() => onTab(id)}
      className={
        'flex items-center gap-2.5 px-3 py-2 text-[13.5px] text-left transition-colors ' +
        (active === id
          ? 'bg-hover/70 font-semibold text-white'
          : 'font-medium text-dim hover:text-ink hover:bg-hover/40')
      }
    >
      <span className={active === id ? 'text-accent' : ''}>{icon}</span>
      <span>{label}</span>
    </button>
  );

  return (
    <aside
      data-testid="home-sidebar"
      className="w-[196px] shrink-0 flex flex-col justify-between bg-rail border-r border-white/[0.04] z-20"
    >
      <div className="px-4 pt-5 overflow-y-auto scroll-dark">
        <nav className="flex flex-col gap-1">
          {item('feed', 'Home', <HomeIcon size={16} />)}
          {item('recs', 'For You', <SparkIcon size={16} />)}
          {item('discover', 'Discover', <DiscoverIcon size={16} />)}
          {item('watched', 'Watched', <EyeIcon size={16} />)}
          {item('want', 'Want to watch', <BookmarkIcon size={16} />)}
        </nav>
      </div>

      <div className="px-4 py-4 border-t border-white/[0.05] flex items-center justify-between">
        <p className="px-2 text-[10.5px] font-semibold tracking-[0.1em] text-muted/70 select-none">
          FLUX
        </p>
        {/* Black Discord mark on a light chip — visible on the dark rail.
            Clicking it resets the Rich Presence connection. */}
        <button
          type="button"
          data-testid="sidebar-discord"
          title="Discord — click to reset Rich Presence"
          aria-label="Reset Discord Rich Presence"
          onClick={resetPresence}
          className={
            'w-7 h-7 rounded-full bg-[#f5f5f5] text-black flex items-center justify-center select-none transition-opacity ' +
            (resetting ? 'opacity-50' : 'hover:opacity-80 active:opacity-60')
          }
        >
          <DiscordIcon size={16} />
        </button>
      </div>
    </aside>
  );
}
