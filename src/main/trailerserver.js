// ── Trailer host server (YouTube error 153 fix) ───────────────────────────
// Since late 2025 YouTube rejects "anonymous" embeds with
//   "Error 153: Video player configuration error"
// — any player loaded with NO referrer. Loading /embed/ID as a <webview>
// top-level document is exactly that (no parent page → no referrer).
//
// Fix: serve a tiny host page from a real http://127.0.0.1 origin. The
// renderer puts that page in a plain <iframe> (the browser-native way to
// play YouTube videos) and the host page iframes YouTube like any website
// does — the player then receives the origin referrer it requires.
//
// The server binds 127.0.0.1 only, serves exactly one route and echoes
// nothing but a strictly-validated 11-char YouTube id.

const http = require('http');

const HOST = '127.0.0.1';
const ID_RE = /^[A-Za-z0-9_-]{11}$/;

let server = null;
let base = null;          // "http://127.0.0.1:<port>/trailer"
let readyPromise = null;

function page(embedUrl) {
  // Static shell: black stage, 100% iframe, standard YouTube embed attrs.
  return [
    '<!DOCTYPE html>',
    '<html><head><meta charset="utf-8">',
    '<title>Flux Trailer</title>',
    '<style>',
    'html,body{margin:0;padding:0;width:100%;height:100%;background:#000;',
    '  overflow:hidden}iframe{position:absolute;inset:0;width:100%;height:100%;',
    '  border:0;background:#000}',
    '</style></head>',
    '<body>',
    '<iframe src="' + embedUrl + '"',
    '  referrerpolicy="strict-origin-when-cross-origin"',
    '  allow="autoplay; fullscreen; encrypted-media; picture-in-picture"',
    '  allowfullscreen></iframe>',
    '</body></html>'
  ].join('\n');
}

function handle(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  let url;
  try { url = new URL(req.url, base || ('http://' + HOST)); } catch (_e) {
    res.writeHead(400).end();
    return;
  }
  if (url.pathname !== '/trailer') {
    res.writeHead(404).end();
    return;
  }
  const id = url.searchParams.get('v') || '';
  if (!ID_RE.test(id)) {
    res.writeHead(400, { 'Content-Type': 'text/plain' }).end('bad video id');
    return;
  }
  const embed = 'https://www.youtube.com/embed/' + id +
    '?autoplay=1&rel=0&playsinline=1';
  const body = page(embed);
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

function start() {
  if (readyPromise) return readyPromise;
  readyPromise = new Promise((resolve) => {
    server = http.createServer(handle);
    server.on('error', () => {           // port race / loopback blocked — give up quietly
      server = null;
      base = null;
      resolve(null);
    });
    server.listen(0, HOST, () => {
      base = 'http://' + HOST + ':' + server.address().port + '/trailer';
      resolve(base);
    });
  });
  return readyPromise;
}

/** Resolve the host-page URL for one YouTube id (starts the server lazily). */
async function trailerUrl(ytId) {
  const id = String(ytId || '');
  if (!ID_RE.test(id)) return null;
  const b = (await start()) || base;
  return b ? b + '?v=' + encodeURIComponent(id) : null;
}

function stop() {
  if (server) {
    try { server.close(); } catch (_e) {}
    server = null;
    base = null;
    readyPromise = null;
  }
}

module.exports = { trailerUrl, stop };
