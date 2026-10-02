// ── Flux shared HTTP helpers for stream providers ────────────────────────
// Used by streams.js (original providers) and providers2.js (expanded set).
// All requests register their AbortController here so cancelStreams() from
// streams.js aborts everything, exactly like Helix's ScraperManager.

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const activeControllers = new Set();

function fetchPage(url, { headers = {}, timeoutMs = 8000, method, body } = {}) {
  const controller = new AbortController();
  activeControllers.add(controller);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { headers, signal: controller.signal, method, body }).finally(() => {
    clearTimeout(timer);
    activeControllers.delete(controller);
  });
}

async function fetchJson(url, opts) {
  let res;
  try {
    res = await fetchPage(url, opts);
  } catch (_) {
    return null;            // abort / network error / bad DNS
  }
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch (_) {
    return null;
  }
}

async function fetchText(url, opts) {
  let res;
  try {
    res = await fetchPage(url, opts);
  } catch (_) {
    return null;            // abort / network error / bad DNS
  }
  if (!res.ok) return null;
  try {
    return await res.text();
  } catch (_) {
    return null;
  }
}

async function fetchRaw(url, opts) {
  // Returns { ok, status, text } without throwing on HTTP errors
  try {
    const res = await fetchPage(url, opts);
    let text = null;
    try { text = await res.text(); } catch (_) {}
    return { ok: res.ok, status: res.status, text };
  } catch (_) {
    return { ok: false, status: 0, text: null };
  }
}

function fmtOf(url) {
  if (url.includes('.m3u8')) return 'HLS';
  if (url.includes('.mpd')) return 'DASH';
  return 'MP4';
}

// Collapse "same stream, different token" duplicates: same host + first
// path segment + filename (e.g. three master.m3u8 token variants from one
// vaplayer CDN count as ONE source).
function streamKey(url) {
  try {
    const u = new URL(url);
    const segs = u.pathname.split('/').filter(Boolean);
    const file = segs.pop() || '';
    return u.hostname + '/' + (segs[0] || '') + '/' + file;
  } catch (_) {
    return url;
  }
}

function cancelAll() {
  const controllers = activeControllers;
  activeControllers.clear();
  for (const c of controllers) {
    try { c.abort(); } catch (_) {}
  }
}

module.exports = { UA, fetchPage, fetchJson, fetchText, fetchRaw, fmtOf, streamKey, cancelAll };
