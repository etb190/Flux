/* ── Home page (Streaming Availability API + TMDB trending) ────────────── */

import { useEffect, useState } from 'react';
import PosterCard from './PosterCard.jsx';

function HeroBackdrop({ hero }) {
  // backdrop → poster → nothing (same fallback chain the vanilla renderer used)
  const initial = hero.backdrop || hero.poster || '';
  const [src, setSrc] = useState(initial);
  useEffect(() => { setSrc(hero.backdrop || hero.poster || ''); }, [hero.backdrop, hero.poster]);

  const handleError = () => {
    if (hero.poster && src !== hero.poster) setSrc(hero.poster);
    else setSrc('');
  };

  if (!src) return null;
  return (
    <img
      src={src}
      alt={hero.name + ' backdrop'}
      referrerPolicy="no-referrer"
      onError={handleError}
      className="absolute inset-0 w-full h-full object-cover object-top"
    />
  );
}

function Hero({ hero, onOpen }) {
  const bits = [];
  if (hero.year) bits.push(hero.year);
  if (hero.imdbRating && hero.imdbRating !== 'null') bits.push('\u2605 ' + hero.imdbRating);
  bits.push(hero.type === 'series' ? 'Series' : 'Movie');
  if (hero.genres && hero.genres.length) bits.push(hero.genres.slice(0, 3).join(' \u00b7 '));

  return (
    <section
      data-testid="home-hero"
      onClick={() => onOpen(hero)}
      className="relative h-[420px] -mx-8 -mt-6 cursor-pointer overflow-hidden"
    >
      <HeroBackdrop hero={hero} />
      <div className="hero-shade absolute inset-0" />
      <div className="absolute bottom-0 left-0 right-0 px-8 pb-8 max-w-3xl">
        {(hero.services || []).length ? (
          <div className="flex items-center gap-2 mb-2">
            {hero.services.slice(0, 3).map((s, i) => (
              <span
                key={i}
                className="hero-chip rounded-full bg-white/10 backdrop-blur border border-white/15 px-3 py-1 text-xs font-medium text-ink"
              >
                {s.name}
              </span>
            ))}
          </div>
        ) : null}
        <h1 className="text-4xl font-bold leading-tight drop-shadow">{hero.name}</h1>
        <div className="mt-2 text-sm text-dim flex flex-wrap items-center gap-x-2">
          {bits.map((b, i) => (
            <span key={i} className="whitespace-nowrap">{b}</span>
          ))}
        </div>
        {hero.overview ? (
          <p className="mt-3 text-[15px] leading-relaxed text-ink/90 line-clamp-3">
            {hero.overview}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function Skeleton() {
  return (
    <div data-testid="home-loading" className="px-8 -mt-6">
      <div className="skeleton h-[420px] -mx-8 w-[calc(100%+4rem)] rounded-none" />
      <div className="skeleton h-6 w-56 mt-8" />
      <div className="flex gap-4 mt-4 overflow-hidden">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="skeleton w-[150px] h-[225px] shrink-0" />
        ))}
      </div>
      <div className="skeleton h-6 w-56 mt-8" />
      <div className="flex gap-4 mt-4 overflow-hidden pb-6">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="skeleton w-[150px] h-[225px] shrink-0" />
        ))}
      </div>
    </div>
  );
}

function SetupCard({ onOpenSettings }) {
  return (
    <div data-testid="home-setup" className="flex justify-center py-24 px-6">
      <div className="max-w-xl bg-raised border border-edge rounded-2xl p-8 text-center">
        <h2 className="text-xl font-semibold mb-3">Set up the home page</h2>
        <p className="text-dim text-[15px] leading-relaxed">
          The home page mixes the Streaming Availability API (daily Top&nbsp;10
          lists, popular titles per service, new &amp; leaving soon) with TMDB
          trending. Flux ships with a working key, so you only see this if the
          key was cleared — paste your own (free at{' '}
          <a
            className="text-accent hover:underline"
            href="https://developers.movieofthenight.com"
            title="Get a free API key"
          >
            developers.movieofthenight.com
          </a>
          ) in Settings.
        </p>
        <button
          data-testid="home-setup-btn"
          onClick={onOpenSettings}
          className="mt-6 rounded-xl bg-accent px-5 py-2.5 font-medium text-white hover:brightness-110"
        >
          Open Settings
        </button>
        <p className="mt-4 text-sm text-dim">Search keeps working without a key.</p>
      </div>
    </div>
  );
}

function ErrorCard({ errorMsg, onRetry }) {
  return (
    <div data-testid="home-error" className="flex justify-center py-24 px-6">
      <div className="max-w-xl bg-raised border border-edge rounded-2xl p-8 text-center">
        <h2 className="text-xl font-semibold mb-3">Couldn&rsquo;t load the home page</h2>
        <p data-testid="home-error-msg" className="text-dim text-[15px]">{errorMsg}</p>
        <button
          data-testid="home-retry"
          onClick={onRetry}
          className="mt-6 rounded-xl bg-accent px-5 py-2.5 font-medium text-white hover:brightness-110"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

function HomeBody({ data, onOpen }) {
  return (
    <div data-testid="home-body">
      {data.hero ? <Hero hero={data.hero} onOpen={onOpen} /> : null}
      {data.notice ? (
        <p
          data-testid="home-notice"
          className="mx-8 mt-4 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-gold"
        >
          {data.notice}
        </p>
      ) : null}
      <div className="px-8 pb-2">
        {(data.rows || []).map((row, ri) =>
          row.items && row.items.length ? (
            <section key={ri} data-testid="home-row" className="mt-7">
              <h2 className="text-lg font-semibold mb-3">{row.title}</h2>
              <div className="scroll-dark flex gap-4 overflow-x-auto pb-3 -mx-1 px-1">
                {row.items.map((item, ii) => (
                  <div key={ii} className="w-[150px] shrink-0 snap-start">
                    <PosterCard item={item} onClick={() => onOpen(item)} />
                  </div>
                ))}
              </div>
            </section>
          ) : null
        )}
      </div>
      <p className="px-8 py-6 text-xs leading-relaxed text-dim/80">
        Home data by the Streaming Availability API (Movie of the Night) &middot;
        Trending by TMDB. This product uses the TMDB API but is not endorsed or
        certified by TMDB.
      </p>
    </div>
  );
}

export default function HomeView({ home, onOpen, onOpenSettings }) {
  if (home.status === 'loading' || home.status === 'idle') return <Skeleton />;
  if (home.status === 'setup') return <SetupCard onOpenSettings={onOpenSettings} />;
  if (home.status === 'error') return <ErrorCard errorMsg={home.errorMsg} onRetry={() => home.load(true)} />;
  return <HomeBody data={home.data} onOpen={onOpen} />;
}
