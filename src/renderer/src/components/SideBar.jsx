/* ── Sidebar (Stitch design): nav buttons + version footer ─────────────────
 * Persistent left rail visible on every view (home, watched, want, results,
 * details). Home / Watched / Want to watch are the only destinations.
 * The FLUX brand lives in the custom title bar, so the rail is buttons only
 * (no "Menu" label — user request).
 */

import { useEffect, useState } from 'react';
import { HomeIcon, EyeIcon, BookmarkIcon, DiscordIcon } from './icons.jsx';

export default function SideBar({ active, onTab }) {
  const [version, setVersion] = useState('');
  // Discord Rich Presence toggle (Helix settings tile, default ON).
  // Flips live via flux:settings:set — main applies setEnabled on change.
  const [discordOn, setDiscordOn] = useState(true);
  useEffect(() => {
    const api = window.fluxAPI;
    if (api && typeof api.appVersion === 'function') {
      Promise.resolve(api.appVersion())
        .then((v) => { if (v) setVersion('v' + v); })
        .catch(() => {});
    }
    if (api && typeof api.getSettings === 'function') {
      Promise.resolve(api.getSettings())
        .then((s) => { if (s && typeof s.discordRpcEnabled === 'boolean') setDiscordOn(s.discordRpcEnabled); })
        .catch(() => {});
    }
  }, []);

  const toggleDiscord = () => {
    const next = !discordOn;
    setDiscordOn(next);                       // optimistic
    const api = window.fluxAPI;
    if (api && typeof api.saveSettings === 'function') {
      Promise.resolve(api.saveSettings({ discordRpcEnabled: next }))
        .then((saved) => { if (saved && typeof saved.discordRpcEnabled === 'boolean') setDiscordOn(saved.discordRpcEnabled); })
        .catch(() => setDiscordOn(!next));    // revert on failure
    }
  };

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
          {item('watched', 'Watched', <EyeIcon size={16} />)}
          {item('want', 'Want to watch', <BookmarkIcon size={16} />)}
        </nav>
      </div>

      <div className="px-4 py-4 border-t border-white/[0.05]">
        <button
          data-testid="discord-toggle"
          onClick={toggleDiscord}
          title={discordOn
            ? 'Discord Rich Presence is broadcasting your activity — click to disable'
            : 'Discord Rich Presence is off — click to enable'}
          className={'flex items-center gap-2.5 px-3 py-2 w-full text-left text-[13.5px] font-medium transition-colors cursor-pointer ' +
            (discordOn ? 'text-[#5865F2] hover:bg-hover/40' : 'text-muted hover:text-dim hover:bg-hover/40')}
        >
          <DiscordIcon size={16} />
          <span>Discord RPC</span>
          <span
            data-testid="discord-state"
            className={'ml-auto text-[10px] font-semibold tracking-[0.08em] uppercase ' +
              (discordOn ? 'text-[#5865F2]' : 'text-muted/70')}
          >
            {discordOn ? 'On' : 'Off'}
          </span>
        </button>
        <p className="px-2 mt-3 text-[10.5px] font-semibold tracking-[0.1em] text-muted/70 select-none">
          FLUX {version}
        </p>
      </div>
    </aside>
  );
}
