/* ── Search results grid (Stitch style) ─────────────────────────────────── */

import PosterCard from './PosterCard.jsx';

export default function ResultsView({ query, items, onOpen }) {
  return (
    <section data-testid="results-wrap" className="px-8 py-6">
      <div className="flex items-center gap-3 mb-5">
        <h2
          data-testid="results-title"
          className="text-[14px] font-bold uppercase tracking-[0.12em] text-[#ededed]"
        >
          Results for &ldquo;{query}&rdquo;
        </h2>
        <span
          data-testid="results-count"
          className="text-xs font-semibold text-dim bg-search border border-edge rounded-full px-2.5 py-0.5"
        >
          {items.length} {items.length === 1 ? 'title' : 'titles'}
        </span>
      </div>
      <div
        data-testid="results-grid"
        className="grid gap-x-[3px] gap-y-6 grid-cols-[repeat(auto-fill,minmax(150px,1fr))]"
      >
        {items.map((item, i) => (
          <PosterCard key={item.type + item.id + i} item={item} onClick={() => onOpen(item, 'results')} />
        ))}
      </div>
    </section>
  );
}
