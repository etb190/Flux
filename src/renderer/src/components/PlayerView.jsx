/* ── Player — Artplayer engine (robust open source, MIT) ─────────────────
 * Playback chrome is Artplayer: play/pause, seek, volume, speed, aspect
 * ratio, flip, PiP, settings panel, hotkeys, auto-hiding controls — on top
 * of hls.js for HLS streams. Our custom subtitle pipeline is kept intact:
 * external SRT/VTT/ASS variants + embedded HLS WebVTT tracks rendered by
 * our own overlay, with delay / size / background wired into the
 * Artplayer settings panel. Embed sources still use a <webview>
 * (persist:embeds partition). Fullscreen targets the stage wrapper so the
 * subtitle overlay + menu stay visible.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Artplayer from 'artplayer';
import Hls from 'hls.js';
import SubtitleMenu from './SubtitleMenu.jsx';
import { fmtDelay } from '../lib/format.js';
import { BackIcon, SwitchIcon, WinMinimizeIcon, WinMaximizeIcon, WinRestoreIcon, WinCloseIcon } from './icons.jsx';

const CHROME_IDLE_MS = 2600;

// Artplayer statics: no double-click fullscreen (it would hide our overlay
// layer), no default context menu.
Artplayer.DBCLICK_FULLSCREEN = false;
Artplayer.CONTEXTMENU = false;

const SUB_SIZES = [
  { html: 'Small', scale: 0.85 },
  { html: 'Medium', scale: 1 },
  { html: 'Large', scale: 1.25 },
  { html: 'X-Large', scale: 1.5 }
];
const SUB_BGS = [
  { html: 'None', bg: 0 },
  { html: 'Dim', bg: 0.4 },
  { html: 'Dark', bg: 0.7 },
  { html: 'Solid', bg: 1 }
];
const SUB_DELAYS = [
  { html: '-2s', d: -2 }, { html: '-1s', d: -1 }, { html: '-0.5s', d: -0.5 },
  { html: 'Sync', d: 0 },
  { html: '+0.5s', d: 0.5 }, { html: '+1s', d: 1 }, { html: '+2s', d: 2 }
];

function ccSvg() {
  const d = 'M19 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm-8 7H9.5v-.5h-2v3h2V13H11v1a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1zm7 0h-1.5v-.5h-2v3h2V13H18v1a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1z';
  return '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="' + d + '"/></svg>';
}
function fsSvg() {
  const d = 'M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z';
  return '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="' + d + '"/></svg>';
}

function hostOf(url) {
  try { return new URL(url).hostname; } catch (_err) { return ''; }
}

/* ── Window controls in the player top bar (frameless chrome) ─────────────
 * The custom title bar sits behind the player overlay while watching, so
 * the same minimize / maximize-restore / close buttons live at the right
 * end of the player top bar (right of "Change source"). Mirrors TitleBar's
 * maximize-restore state; the bar itself is the drag region, buttons opt
 * out via app-no-drag. Negative margins let the buttons run edge-to-edge
 * (flush top/right/bottom) like a real title bar.
 */
function PlayerWindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const api = window.fluxAPI;
    if (!api) return undefined;
    if (typeof api.winIsMaximized === 'function') {
      Promise.resolve(api.winIsMaximized())
        .then((v) => setMaximized(Boolean(v)))
        .catch(() => {});
    }
    // onWinState returns an unsubscribe (player remounts per playback).
    const un = typeof api.onWinState === 'function'
      ? api.onWinState(({ maximized: m }) => setMaximized(Boolean(m)))
      : null;
    return () => { if (typeof un === 'function') un(); };
  }, []);

  const btn = (label, testid, onClick, cls) => (
    <button
      data-testid={testid}
      title={label}
      aria-label={label}
      onClick={onClick}
      className={'app-no-drag w-11 flex items-center justify-center text-[#c7c7c7] transition-colors ' + cls}
    >
      {testid === 'pwin-min' ? <WinMinimizeIcon size={13} />
        : testid === 'pwin-max' ? (maximized ? <WinRestoreIcon size={13} /> : <WinMaximizeIcon size={13} />)
          : <WinCloseIcon size={13} />}
    </button>
  );

  return (
    <div
      data-testid="player-win-controls"
      className="self-stretch flex items-stretch -my-3 -mr-5"
    >
      {btn('Minimize', 'pwin-min', () => window.fluxAPI?.winMinimize?.(),
        'hover:bg-white/10 hover:text-white')}
      {btn(maximized ? 'Restore' : 'Maximize', 'pwin-max',
        () => window.fluxAPI?.winMaximize?.(),
        'hover:bg-white/10 hover:text-white')}
      {btn('Close', 'pwin-close', () => window.fluxAPI?.winClose?.(),
        'hover:bg-[#e50914] hover:text-white')}
    </div>
  );
}

// Register Referer/UA injection + CORS passthrough for this playback.
function applyPlayerRules(src, sources) {
  const api = window.fluxAPI;
  if (!(api && typeof api.setPlayerRules === 'function')) return;
  const rules = { headers: [], corsHosts: [] };
  const host = hostOf(src.url);
  if (host && src.headers) {
    rules.headers.push({ host, headers: src.headers });
  }
  // CORS: any host the other sources point at may serve segments after a
  // redirect; whitelisting them all is harmless (renderer-only traffic).
  const hosts = new Set();
  for (const s of sources || []) {
    try { hosts.add(new URL(s.url).hostname); } catch (_err) {}
  }
  if (host) hosts.add(host);
  rules.corsHosts = [...hosts];
  api.setPlayerRules(rules);
}

export default function PlayerView({ source, sources, meta, episode, subs, resumeSec, onBack, submenuOpen, onToggleSubmenu, onCloseSubmenu }) {
  const containerRef = useRef(null);   // Artplayer mount point
  const stageRef = useRef(null);       // fullscreen target (art + overlays)
  const artRef = useRef(null);
  const videoRef = useRef(null);       // art.video (progress + chrome logic)
  const hlsRef = useRef(null);
  const webviewRef = useRef(null);
  const failTimerRef = useRef(null);
  const idleTimerRef = useRef(null);
  const playedOnceRef = useRef(false);
  const progressTimerRef = useRef(null);
  const resumeAppliedRef = useRef(false);
  const resumeSecRef = useRef(resumeSec || 0);
  useEffect(() => { resumeSecRef.current = resumeSec || 0; }, [resumeSec]);

  const [buffering, setBuffering] = useState(true);
  const [failMsg, setFailMsg] = useState(null);
  const [overlayText, setOverlayText] = useState('');
  const [idle, setIdle] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [videoReady, setVideoReady] = useState(false);   // Artplayer mounted

  const isEmbed = source.format === 'Embed';
  const isTrailer = Boolean(source.trailer);
  const isDash = source.format === 'DASH' || /\.mpd($|\?)/i.test(source.url);

  // refs mirroring state for use inside timers / event closures
  const submenuOpenRef = useRef(false);
  useEffect(() => { submenuOpenRef.current = submenuOpen; }, [submenuOpen]);
  const failMsgRef = useRef(null);
  const idleRef = useRef(false);
  useEffect(() => { failMsgRef.current = failMsg; }, [failMsg]);
  useEffect(() => { idleRef.current = idle; }, [idle]);
  const toggleSubmenuRef = useRef(() => {});
  const saveProgressRef = useRef(() => {});
  const updatePresenceRef = useRef(() => {});

  // ── Discord Rich Presence (Helix _updateDiscordRpc port) ───────────────
  // Reports what is playing to the main process, which owns the single
  // Discord connection. Mirrors Helix's triggers: presence is pushed on
  // play/pause changes, when the duration becomes known, and after seeks
  // (keeps the elapsed timestamp honest); timestamps encode the
  // progress, so no per-tick updates. Embeds/trailers never set presence.
  const updatePresence = useCallback((pausedOverride) => {
    const api = typeof window !== 'undefined' ? window.fluxAPI : null;
    if (!api || typeof api.discordSet !== 'function') return;
    if (isEmbed || isTrailer) return;
    const v = videoRef.current;
    if (!v) return;
    const title = (meta && meta.name) || source.title || '';
    if (!title) return;
    const isSeries = Boolean(meta && meta.type === 'series');
    const paused = typeof pausedOverride === 'boolean'
      ? pausedOverride
      : Boolean(v.paused);
    api.discordSet({
      kind: isSeries ? 'series' : 'movie',
      title,
      year: meta && meta.year ? String(meta.year) : null,
      season: isSeries && episode ? (episode.season ?? 1) : null,
      episode: isSeries && episode ? (episode.episode ?? 1) : null,
      episodeTitle: isSeries && episode ? (episode.title || '') : null,
      posterUrl: (meta && (meta.background || meta.poster)) || null,
      positionSec: Number.isFinite(v.currentTime) ? Math.floor(v.currentTime) : null,
      durationSec: Number.isFinite(v.duration) && v.duration > 0 ? Math.floor(v.duration) : null,
      paused
    }).catch(() => {});
  }, [meta, episode, source, isEmbed, isTrailer]);
  useEffect(() => { updatePresenceRef.current = updatePresence; }, [updatePresence]);

  // Late-landing meta (resume flow) / episode switches → refresh presence
  // once the video element exists (guard inside updatePresence handles it).
  useEffect(() => {
    updatePresenceRef.current();
  }, [meta, episode]);

  const showPlayerFail = useCallback((msg) => {
    clearTimeout(failTimerRef.current);
    failTimerRef.current = null;
    setBuffering(false);
    setFailMsg(msg || 'The stream may be offline or blocked. Try a different source below.');
  }, []);

  // ── chrome auto-hide (our top bar, fullscreen only — Artplayer hides its
  //    own control bar by itself) ──────────────────────────────────────────
  const chromeCanHide = useCallback(() => {
    if (!document.fullscreenElement) return false;
    if (failMsgRef.current) return false;
    if (submenuOpenRef.current) return false;
    const v = videoRef.current;
    if (!v || v.paused) return false;
    return true;
  }, []);

  const scheduleChromeHide = useCallback(() => {
    clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      if (chromeCanHide()) setIdle(true);
    }, CHROME_IDLE_MS);
  }, [chromeCanHide]);

  const wakeChrome = useCallback(() => {
    setIdle(false);
    scheduleChromeHide();
  }, [scheduleChromeHide]);

  const stopChromeHide = useCallback(() => {
    clearTimeout(idleTimerRef.current);
    setIdle(false);
  }, []);

  // ── continue-watching progress (same-source resume) ────────────────────
  const saveProgress = useCallback(() => {
    const video = videoRef.current;
    const api = window.fluxAPI;
    if (!video || !api || typeof api.historyProgress !== 'function') return;
    if (!meta || !meta.id || !/^tt\d+$/.test(meta.id)) return;
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    if (!Number.isFinite(video.currentTime) || video.currentTime < 3) return;
    // watched to the end → the next resume restarts from the top
    const pos = video.currentTime > video.duration * 0.95
      ? 0 : video.currentTime;
    api.historyProgress(meta.id, {
      positionSec: Math.round(pos),
      durationSec: Math.round(video.duration)
    }).catch(() => {});
  }, [meta]);
  useEffect(() => { saveProgressRef.current = saveProgress; }, [saveProgress]);

  useEffect(() => {
    progressTimerRef.current = setInterval(() => saveProgressRef.current(), 8000);
    return () => {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
      saveProgressRef.current();               // final tick on close/switch
    };
  }, []);

  // ── subtitle context (re-applied when meta lands late on a resume) ─────
  useEffect(() => {
    const ctx = meta
      ? {
          name: meta.name,
          imdbId: meta.id,
          isSeries: meta.type === 'series',
          season: episode ? episode.season : null,
          episode: episode ? episode.episode : null,
          year: meta.year,
          isEmbed: source.format === 'Embed'
        }
      : { name: source.title || '', imdbId: null, isEmbed: source.format === 'Embed' };
    subs.setContext(ctx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, episode, source]);

  // ── open one source (Artplayer + hls.js) ───────────────────────────────
  useEffect(() => {
    setBuffering(true);
    setFailMsg(null);
    setOverlayText('');
    setVideoReady(false);
    playedOnceRef.current = false;
    resumeAppliedRef.current = false;          // re-arm the same-source resume seek
    stopChromeHide();

    if (isEmbed) {
      // Trailer → a plain <iframe> pointing at our localhost host page
      // (YouTube error-153 fix, see App.openTrailer): the browser plays
      // the video natively, no Artplayer/webview chrome involved.
      if (isTrailer) setBuffering(false);
      // <webview> is rendered below; its event listeners attach in a
      // dedicated effect once the element exists.
      return undefined;
    }

    applyPlayerRules(source, sources);

    if (isDash) {
      showPlayerFail('DASH streams aren\u2019t supported by this player yet. Pick another source below.');
      return undefined;
    }

    const isHls = source.format === 'HLS' || /\.m3u8($|\?)/i.test(source.url);
    if (isHls && !Hls.isSupported()) {
      showPlayerFail('HLS playback is not supported in this environment.');
      return undefined;
    }

    // If nothing plays within 25s, treat the host as dead
    failTimerRef.current = setTimeout(() => {
      if (!playedOnceRef.current) {
        showPlayerFail('Timed out while contacting the stream host.');
      }
    }, 25000);

    const style = subs.subsStyle || { scale: 1, bg: 0.7 };
    const delayNow = subs.delay || 0;

    let art;
    try {
      art = new Artplayer({
        container: containerRef.current,
        url: source.url,
        type: isHls ? 'm3u8' : undefined,
        customType: isHls ? {
          m3u8: (video, url) => {
            const hls = new Hls({
              enableWorker: true,
              backBufferLength: 90,
              maxBufferLength: 30,
              // Subtitles are rendered by our own overlay (styling + delay
              // support) instead of native <track> elements.
              renderTextTracksNatively: false
            });
            hlsRef.current = hls;
            try { art.m3u8 = hls; } catch (_err) {}
            subs.attachHls(hls);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              // Embedded WebVTT subtitle tracks → menu
              subs.setEmbeddedTracks(hls);
              video.play().catch(() => {});
            });
            hls.on(Hls.Events.CUES_PARSED, (_e, data) => subs.pushEmbeddedCues(data));
            hls.on(Hls.Events.ERROR, (_e, data) => {
              if (!data || !data.fatal) return;
              if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                try { hls.recoverMediaError(); return; } catch (_err) {}
              }
              showPlayerFail('The stream host refused the request \u2014 it may be offline, geo-blocked, or require special headers.');
            });
            hls.loadSource(url);
            hls.attachMedia(video);
          }
        } : undefined,
        autoplay: true,
        volume: 1,
        theme: '#e50914',
        lang: 'en',
        setting: true,
        hotkey: true,
        playbackRate: true,
        aspectRatio: true,
        flip: true,
        pip: true,
        mutex: false,
        backdrop: true,
        miniProgressBar: true,
        autoMini: false,
        autoSize: false,
        moreVideoAttr: { playsInline: true },
        settings: [
          {
            html: 'Subtitle size',
            width: 230,
            tooltip: (SUB_SIZES.find((s) => s.scale === style.scale) || SUB_SIZES[1]).html,
            selector: SUB_SIZES.map((s) => ({
              html: s.html, scale: s.scale, default: s.scale === style.scale
            })),
            onSelect(item) {
              subs.setSubsStyle({ scale: item.scale });
              return item.html;
            }
          },
          {
            html: 'Subtitle background',
            width: 230,
            tooltip: (SUB_BGS.find((s) => s.bg === style.bg) || SUB_BGS[2]).html,
            selector: SUB_BGS.map((s) => ({
              html: s.html, bg: s.bg, default: s.bg === style.bg
            })),
            onSelect(item) {
              subs.setSubsStyle({ bg: item.bg });
              return item.html;
            }
          },
          {
            html: 'Subtitle delay',
            width: 230,
            tooltip: fmtDelay(delayNow),
            selector: SUB_DELAYS.map((s) => ({
              html: s.html, d: s.d, default: s.d === delayNow
            })),
            onSelect(item) {
              subs.setDelay(item.d);
              return item.html;
            }
          }
        ],
        controls: [
          {
            // index 200/210 → AFTER Artplayer's fullscreen (70) → the two
            // buttons sit at the FAR RIGHT edge of the control bar.
            // Clicks are bound in `mounted` (our own addEventListener) —
            // not via the config `click`, so the handler is guaranteed to
            // fire exactly once, unaffected by Artplayer's internals.
            name: 'flux-cc',
            position: 'right',
            index: 200,
            html: ccSvg(),
            tooltip: 'Subtitles',
            mounted: (el) => {
              el.addEventListener('click', (e) => {
                e.preventDefault();
                // Keep the click away from the app-level outside-click
                // closer on the player root — otherwise the same physical
                // click can open the menu and then immediately close it.
                e.stopPropagation();
                const now = Date.now();
                if (now - lastCcToggleRef.current < 250) return;
                lastCcToggleRef.current = now;
                toggleSubmenuRef.current();
              });
            }
          },
          {
            name: 'flux-fs',
            position: 'right',
            index: 210,
            html: fsSvg(),
            tooltip: 'Fullscreen',
            mounted: (el) => {
              el.addEventListener('click', (e) => {
                e.preventDefault();
                if (document.fullscreenElement) {
                  document.exitFullscreen().catch(() => {});
                } else if (stageRef.current) {
                  stageRef.current.requestFullscreen().catch(() => {});
                }
              });
            }
          }
        ]
      });
    } catch (err) {
      showPlayerFail('The player failed to start (' + (err && err.message ? err.message : 'unknown') + ').');
      return undefined;
    }

    artRef.current = art;

    // Resume seek target — applied once duration is known
    const tryResumeSeek = () => {
      const a = artRef.current;
      const v = a && a.video;
      if (!a || !v) return;
      if (!resumeAppliedRef.current && resumeSecRef.current > 5 &&
          Number.isFinite(v.duration) && v.duration > 0) {
        resumeAppliedRef.current = true;
        try {
          v.currentTime = Math.min(resumeSecRef.current, Math.max(0, v.duration - 5));
        } catch (_err) {}
      }
    };

    art.on('ready', () => {
      const v = art.video;
      videoRef.current = v;
      try { v.setAttribute('data-testid', 'player-video'); } catch (_err) {}
      // stable hooks for the UI tests (same ids as before)
      const tag = (sel, id) => {
        const el = containerRef.current && containerRef.current.querySelector(sel);
        if (el) el.id = id;
      };
      tag('.art-control-playAndPause', 'pc-play');
      tag('.art-control-flux-cc', 'pc-cc');
      tag('.art-control-flux-fs', 'pc-fs');
      tag('.art-controls', 'player-controls');
      setVideoReady(true);
      tryResumeSeek();
    });
    art.on('video:loadedmetadata', tryResumeSeek);
    art.on('video:seeked', () => { updatePresenceRef.current(); });
    art.on('video:playing', () => {
      playedOnceRef.current = true;
      clearTimeout(failTimerRef.current);
      failTimerRef.current = null;
      setBuffering(false);
      setFailMsg(null);
      updatePresenceRef.current(false);       // playing → presence w/ timestamps
    });
    art.on('video:waiting', () => {
      if (!failMsgRef.current) setBuffering(true);
    });
    art.on('video:pause', () => {
      saveProgressRef.current();
      updatePresenceRef.current(true);        // paused → (Paused), no elapsed timer
    });
    art.on('video:error', () => {
      const v = art.video;
      if (!v || !v.currentSrc) return;          // teardown clears src — ignore
      showPlayerFail('Playback failed \u2014 the file could not be decoded or reached. Try another source.');
    });

    // Auto-fetch subtitles for this episode/movie (Helix _fetchInitialSubtitles)
    if (!isTrailer) subs.search(false);

    return () => {
      clearTimeout(failTimerRef.current);
      failTimerRef.current = null;
      const hls = hlsRef.current;
      if (hls) { try { hls.destroy(); } catch (_err) {} hlsRef.current = null; }
      subs.detachHls();
      try { art.destroy(true); } catch (_err) {}
      artRef.current = null;
      videoRef.current = null;
      setVideoReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  // ── webview listeners (embed sources — trailers use a plain iframe and
  //    need none of these) ───────────────────────────────────────────────
  useEffect(() => {
    if (!isEmbed || isTrailer) return undefined;
    const wv = webviewRef.current;
    if (!wv) return undefined;
    const onReady = () => setBuffering(false);
    const onFinish = () => setBuffering(false);
    const onFail = (e) => {
      if (e.errorCode === -3) return;   // aborted navigation — ignore
      showPlayerFail('The embed player failed to load (' + (e.errorDescription || e.errorCode) + ').');
    };
    wv.addEventListener('dom-ready', onReady);
    wv.addEventListener('did-finish-load', onFinish);
    wv.addEventListener('did-fail-load', onFail);
    return () => {
      wv.removeEventListener('dom-ready', onReady);
      wv.removeEventListener('did-finish-load', onFinish);
      wv.removeEventListener('did-fail-load', onFail);
    };
  }, [isEmbed, isTrailer, showPlayerFail]);

  // ── teardown on unmount (closePlayer) ─────────────────────────────────
  useEffect(() => {
    return () => {
      clearTimeout(failTimerRef.current);
      clearTimeout(idleTimerRef.current);
      const wv = webviewRef.current;
      if (wv) { try { wv.stop(); } catch (_err) {} }
      subs.stopInFlight();
      const api = window.fluxAPI;
      if (api && typeof api.clearPlayerRules === 'function') api.clearPlayerRules();
      // Helix dispose(): leaving the player returns the presence to idle.
      if (api && typeof api.discordIdle === 'function') api.discordIdle().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── fullscreen change ──────────────────────────────────────────────────
  useEffect(() => {
    const onFsChange = () => {
      if (document.fullscreenElement) {
        setFullscreen(true);
        wakeChrome();
      } else {
        setFullscreen(false);
        stopChromeHide();           // leaving fullscreen always shows chrome
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, [wakeChrome, stopChromeHide]);

  // ── overlay text on timeupdate ─────────────────────────────────────────
  useEffect(() => {
    if (!videoReady) return undefined;
    const art = artRef.current;
    if (!art) return undefined;
    const onTime = () => {
      const v = art.video;
      if (!v) return;
      setOverlayText((prev) => {
        const next = subs.getOverlayText(v.currentTime);
        return next === prev ? prev : next;
      });
    };
    art.on('video:timeupdate', onTime);
    return () => {
      try { art.off('video:timeupdate', onTime); } catch (_err) {}
    };
  }, [videoReady, subs]);

  // ── overlay recompute when subs state changes ──────────────────────────
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    setOverlayText((prev) => {
      const next = subs.getOverlayText(v.currentTime);
      return next === prev ? prev : next;
    });
  }, [subs.cuesVersion, subs.delay, subs.selectedUrl, subs.embeddedActive, subs.subsStyle, subs]);

  // ── subtitle menu helpers (open state lifted to App for the Esc chain) ─
  const closeSubmenu = useCallback(() => {
    onCloseSubmenu();
    scheduleChromeHide();
  }, [onCloseSubmenu, scheduleChromeHide]);

  const toggleSubmenu = useCallback(() => {
    if (!submenuOpenRef.current) {
      wakeChrome();
      onToggleSubmenu();
    } else {
      closeSubmenu();
    }
  }, [wakeChrome, onToggleSubmenu, closeSubmenu]);
  useEffect(() => { toggleSubmenuRef.current = toggleSubmenu; }, [toggleSubmenu]);

  // Timestamp of the last CC activation — collapses the multi-click bursts
  // some platforms deliver (mousedown+up synthesis) into one toggle.
  const lastCcToggleRef = useRef(0);

  // Red tint on the CC control while the subtitle menu is open
  useEffect(() => {
    const el = document.querySelector('.art-control-flux-cc');
    if (el) el.classList.toggle('flux-ctl-active', !!submenuOpen);
  }, [submenuOpen, videoReady]);

  // ── header text ────────────────────────────────────────────────────────
  const isSeries = meta && meta.type === 'series';
  const se = isSeries && episode
    ? 'S' + (episode.season ?? 1) + ' E' + (episode.episode ?? 1) + ' \u00b7 ' + (episode.title || '')
    : '';
  const titleText = source.trailer
    ? 'Trailer \u00b7 ' + (meta ? meta.name : (source.title || 'Now playing'))
    : meta
      ? meta.name + (isSeries ? ' \u2014 ' + se.split(' \u00b7 ')[0] : '')
      : (source.title || 'Now playing');
  const subText = [
    se.split(' \u00b7 ').slice(1).join(' \u00b7 '),
    source.title || source.provider || 'Source'
  ].filter(Boolean).join('  \u2014  ');

  const chromeHidden = idle && fullscreen;
  const style = subs.subsStyle || { scale: 1, bg: 0.7 };

  return (
    <div
      data-testid="player-view"
      className="fixed inset-0 z-40 bg-black flex flex-col"
      onMouseMove={() => {
        if (idleRef.current || document.fullscreenElement) wakeChrome();
      }}
      onClick={(e) => {
        if (!submenuOpenRef.current) return;
        // composedPath: selecting a row unmounts it before the event finishes
        // bubbling, so a plain closest() would misread it as "outside".
        const path = e.composedPath ? e.composedPath() : [];
        for (const node of path) {
          if (node && (node.id === 'player-submenu' || node.id === 'pc-cc')) return;
        }
        closeSubmenu();
      }}
    >
      {/* top bar — doubles as a drag region for the frameless window */}
      <div
        data-testid="player-topbar"
        className={
          'app-drag flex items-center gap-4 px-5 py-3 bg-black/60 backdrop-blur z-10 transition-opacity duration-500 ' +
          (chromeHidden ? 'opacity-0 pointer-events-none' : 'opacity-100')
        }
      >
        <button
          data-testid="player-back"
          title="Return"
          aria-label="Return"
          onClick={onBack}
          className="app-no-drag flex items-center gap-1.5 border border-edge bg-raised/80 px-3 py-1.5 text-sm font-semibold text-ink hover:border-accent hover:text-white transition-colors shrink-0"
        >
          <BackIcon />
          <span>Return</span>
        </button>
        <div className="app-no-drag flex-1 min-w-0">
          <div data-testid="player-title" className="text-[15px] font-semibold truncate">{titleText}</div>
          <div data-testid="player-sub" className="text-xs text-dim truncate">{subText}</div>
        </div>
        {isTrailer ? (
          <button
            data-testid="trailer-external"
            title="Open this trailer on YouTube"
            onClick={() => {
              try {
                const v = new URL(source.url, location.href).searchParams.get('v');
                if (v && window.fluxAPI && typeof window.fluxAPI.openExternal === 'function') {
                  window.fluxAPI.openExternal('https://www.youtube.com/watch?v=' + v);
                }
              } catch (_err) {}
            }}
            className="app-no-drag flex items-center gap-1.5 border border-edge bg-raised/80 px-3 py-1.5 text-sm font-semibold text-ink hover:border-accent hover:text-white transition-colors shrink-0"
          >
            <span>Open on YouTube</span>
          </button>
        ) : null}
        <button
          data-testid="player-switch"
          title="Pick a different source"
          onClick={onBack}
          className="app-no-drag flex items-center gap-1.5 border border-edge bg-raised/80 px-3 py-1.5 text-sm text-ink hover:border-accent transition-colors shrink-0"
        >
          <SwitchIcon />
          <span>Change source</span>
        </button>
        <PlayerWindowControls />
      </div>

      {/* stage — the fullscreen target, holds the player AND the overlays */}
      <div ref={stageRef} data-testid="player-stage" className="relative flex-1 bg-black overflow-hidden">
        {!isEmbed ? (
          <div ref={containerRef} data-testid="player-art" className="absolute inset-0" />
        ) : isTrailer ? (
          /* Browser-native YouTube playback: our host page (real
             http://127.0.0.1 origin) iframes the embed so the player gets
             the referrer YouTube's error-153 policy demands. */
          <iframe
            data-testid="trailer-frame"
            src={source.url}
            title={titleText}
            referrerPolicy="strict-origin-when-cross-origin"
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
            className="player-webview"
          />
        ) : (
          <webview
            ref={webviewRef}
            partition="persist:embeds"
            allowfullscreen="true"
            useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
            src={source.url}
            className="player-webview"
          />
        )}

        {/* subtitle overlay */}
        {overlayText ? (
          <div
            data-testid="player-sub-overlay"
            className="absolute bottom-[84px] left-0 right-0 flex justify-center px-10 pointer-events-none z-10"
          >
            <span
              className="max-w-3xl px-4 py-1.5 text-center leading-snug text-white whitespace-pre-line"
              style={{
                fontSize: Math.round(18 * style.scale) + 'px',
                background: 'rgba(0, 0, 0, ' + style.bg + ')'
              }}
            >
              {overlayText}
            </span>
          </div>
        ) : null}

        {/* subtitle menu */}
        {submenuOpen ? (
          <SubtitleMenu
            subs={subs}
            onClose={closeSubmenu}
            onRefresh={() => { wakeChrome(); subs.search(true); }}
            onDelayMinus={() => { wakeChrome(); subs.setDelay(subs.delay - 0.1); }}
            onDelayPlus={() => { wakeChrome(); subs.setDelay(subs.delay + 0.1); }}
            onDelayReset={() => { wakeChrome(); subs.setDelay(0); }}
          />
        ) : null}

        {/* buffering */}
        {buffering && !failMsg ? (
          <div
            data-testid="player-buffering"
            className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-dim pointer-events-none"
          >
            <div className="spinner spinner-lg" />
            <p>Loading stream&hellip;</p>
          </div>
        ) : null}

        {/* fail card */}
        {failMsg ? (
          <div
            data-testid="player-fail"
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6 bg-black/70 z-10"
          >
            <h3 className="text-xl font-semibold">This source couldn&rsquo;t be played</h3>
            <p data-testid="player-fail-msg" className="text-dim max-w-md">{failMsg}</p>
            <button
              data-testid="player-fail-back"
              onClick={onBack}
              className="mt-2 bg-accent px-5 py-2.5 font-medium text-white hover:brightness-110"
            >
              Pick another source
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
