/* ── Custom frameless-window title bar (replaces the Windows chrome) ──────
 * Black bar, FLUX wordmark in Netflix red on the left, custom
 * minimize / maximize-restore / close buttons on the right. The whole bar
 * is a drag region; the buttons opt out. Double-click toggles maximize.
 */

import { useEffect, useState } from 'react';
import {
  WinMinimizeIcon, WinMaximizeIcon, WinRestoreIcon, WinCloseIcon
} from './icons.jsx';

export default function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const api = window.fluxAPI;
    if (!api) return undefined;
    if (typeof api.winIsMaximized === 'function') {
      Promise.resolve(api.winIsMaximized())
        .then((v) => setMaximized(Boolean(v)))
        .catch(() => {});
    }
    if (typeof api.onWinState === 'function') {
      api.onWinState(({ maximized: m }) => setMaximized(Boolean(m)));
    }
    return undefined;
  }, []);

  const btn = (label, testid, onClick, cls) => (
    <button
      data-testid={testid}
      title={label}
      aria-label={label}
      onClick={onClick}
      className={'app-no-drag w-12 h-full flex items-center justify-center text-[#c7c7c7] transition-colors ' + cls}
    >
      {testid === 'win-min' ? <WinMinimizeIcon size={13} />
        : testid === 'win-max' ? (maximized ? <WinRestoreIcon size={13} /> : <WinMaximizeIcon size={13} />)
          : <WinCloseIcon size={13} />}
    </button>
  );

  return (
    <header
      data-testid="title-bar"
      onDoubleClick={() => window.fluxAPI?.winMaximize?.()}
      className="app-drag flex items-center justify-between h-9 shrink-0 bg-[#050505] border-b border-white/[0.06] select-none z-40 relative"
    >
      {/* Brand — FLUX in Netflix red on black */}
      <div className="flex items-center gap-2.5 pl-4">
        <span
          data-testid="titlebar-brand"
          className="text-[14.5px] font-black uppercase tracking-[0.22em] text-accent leading-none"
          style={{ textShadow: '0 0 16px rgba(229, 9, 20, 0.45)' }}
        >
          Flux
        </span>
      </div>

      {/* Window controls */}
      <div className="flex items-stretch h-full">
        {btn('Minimize', 'win-min', () => window.fluxAPI?.winMinimize?.(),
          'hover:bg-white/10 hover:text-white')}
        {btn(maximized ? 'Restore' : 'Maximize', 'win-max',
          () => window.fluxAPI?.winMaximize?.(),
          'hover:bg-white/10 hover:text-white')}
        {btn('Close', 'win-close', () => window.fluxAPI?.winClose?.(),
          'hover:bg-[#e50914] hover:text-white')}
      </div>
    </header>
  );
}
