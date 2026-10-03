/* ── Details-flow top bar — INSIDE the content layer (Stitch detail screens).
 * When a movie/TV screen is open there is no separate app chrome floating
 * above it: this row IS the top of the content, holding the circle back
 * button, the breadcrumb (Movies | Genre | Title), the search field and the
 * settings gear — exactly like the Stitch "Movie Details"/"TV Show Details"
 * screens. Also the frameless-window drag region for the details flow. */

import { SearchIcon, GearIcon, ChevronLeftIcon } from './icons.jsx';

export default function DetailTopBar({
  crumbs, query, onQueryChange, onEnter, onClear, onOpenSettings, onBack
}) {
  return (
    <header className="app-drag flex items-center gap-4 bg-[#0f1117] px-8 py-3 shrink-0">
      <button
        data-testid="back-btn"
        title="Back"
        aria-label="Back"
        onClick={onBack}
        className="app-no-drag flex items-center justify-center w-9 h-9 rounded-full bg-white/[0.06] border border-white/10 text-[#c3cad9] hover:bg-white/[0.14] hover:text-white transition-colors shrink-0"
      >
        <ChevronLeftIcon size={18} />
      </button>

      <nav className="app-no-drag flex items-center gap-2 min-w-0 text-[12.5px] font-semibold">
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-2 min-w-0">
            {i > 0 ? <span className="text-white/20 font-normal select-none">|</span> : null}
            <span
              className={
                (i === crumbs.length - 1
                  ? 'text-white '
                  : 'text-[#8b94a9] ') + 'truncate max-w-[240px]'
              }
            >
              {c}
            </span>
          </span>
        ))}
      </nav>

      <div className="flex-1 min-w-2" />

      <div className="app-no-drag relative w-[300px] max-w-[36vw] shrink-0">
        <SearchIcon
          size={13}
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
          className="w-full rounded-md bg-[#161a26] border border-transparent px-9 py-1.5 text-[13px] text-[#c3cad9] outline-none transition-[border-color,background] duration-150 placeholder:text-muted focus:border-[#3a445c] focus:bg-[#1e2436]"
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
        className="app-no-drag flex items-center justify-center w-9 h-9 rounded-full bg-white/[0.06] border border-white/10 text-[#c3cad9] hover:bg-white/[0.14] hover:text-white transition-colors shrink-0"
      >
        <GearIcon size={17} />
      </button>
    </header>
  );
}
