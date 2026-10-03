/* ── Top bar: global search + settings (Stitch style; brand lives in the
 * sidebar). Also the frameless-window drag region. */

import { SearchIcon, GearIcon } from './icons.jsx';

export default function TopBar({ query, onQueryChange, onEnter, onClear, onOpenSettings }) {
  return (
    <header className="app-drag flex items-center justify-between gap-6 bg-bg border-b border-white/[0.05] px-7 py-3 shrink-0 z-10">
      <div className="app-no-drag relative flex-1 max-w-[560px]">
        <SearchIcon
          size={14}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dim pointer-events-none"
        />
        <input
          id="search"
          data-testid="search-input"
          type="text"
          value={query}
          placeholder="Search movies & series..."
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onEnter();
          }}
          className="w-full rounded-md bg-search border border-transparent px-9 py-2 text-[13.5px] text-[#c3cad9] outline-none transition-[border-color,background] duration-150 placeholder:text-muted focus:border-[#3a445c] focus:bg-[#1e2436]"
        />
        {query ? (
          <button
            data-testid="search-clear"
            title="Clear"
            aria-label="Clear search"
            onClick={onClear}
            className="app-no-drag absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full text-muted text-base leading-none hover:bg-hover hover:text-ink"
          >
            &times;
          </button>
        ) : null}
      </div>

      <button
        data-testid="settings-btn"
        title="Settings"
        aria-label="Settings"
        aria-haspopup="dialog"
        onClick={onOpenSettings}
        className="app-no-drag flex items-center justify-center w-[38px] h-[38px] rounded-lg text-dim hover:text-ink hover:bg-hover transition-colors"
      >
        <GearIcon size={19} />
      </button>
    </header>
  );
}
