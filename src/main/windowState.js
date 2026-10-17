// ── Window state persistence (remember size + position across launches) ──
// Pure helpers (no electron import) so the restore/save policy is
// unit-testable: the test suite drives sanitizeWindowState directly.
//
// State shape stored at userData/window-state.json:
//   { width, height, x, y, maximized }
//  • width/height  — the NORMAL (restore) size, never the maximized size
//  • x/y           — optional; missing → the OS centers the window
//  • maximized     — restored by maximizing AFTER the window is shown
//
// Off-screen / garbage bounds (unplugged monitor, resolution change) are
// dropped so the OS can't restore a window nobody can see.

const fs = require('fs');

const DEFAULT_STATE = { width: 1280, height: 820, maximized: false };

// Parse + validate the persisted file: anything unreadable → null (caller
// falls back to defaults via sanitizeWindowState(null, ...)).
function loadWindowState(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch (_) {
    return null;
  }
}

// Turn a raw saved state (possibly null / partial / off-screen) into a
// safe BrowserWindow prefill. `displayMatching(bounds) -> { workArea }` is
// injected (electron's screen.getDisplayMatching) so bounds are only kept
// when a meaningful part of the window would land on a real display.
function sanitizeWindowState(saved, displayMatching) {
  const s = saved && typeof saved === 'object' ? saved : {};
  const width = Math.round(Number(s.width));
  const height = Math.round(Number(s.height));
  const out = {
    width: width > 0 ? width : DEFAULT_STATE.width,
    height: height > 0 ? height : DEFAULT_STATE.height,
    maximized: Boolean(s.maximized)
  };
  if (Number.isFinite(Number(s.x)) && Number.isFinite(Number(s.y))) {
    const b = { x: Math.round(Number(s.x)), y: Math.round(Number(s.y)), width: out.width, height: out.height };
    if (typeof displayMatching === 'function') {
      try {
        const area = displayMatching(b).workArea;
        // Keep the position only if a visible chunk (>=60px) of the window
        // stays inside the display's work area on both axes.
        const visible =
          b.x + b.width > area.x + 60 && b.x < area.x + area.width - 60 &&
          b.y + b.height > area.y + 60 && b.y < area.y + area.height - 60;
        if (visible) { out.x = b.x; out.y = b.y; }
      } catch (_) { /* no displays yet — center */ }
    } else {
      out.x = b.x; out.y = b.y;
    }
  }
  return out;
}

// Persist a BrowserWindow's normal (restore) bounds + maximized flag.
// getNormalBounds() is the key: saving win.getBounds() while maximized
// would "stick" the maximized size as the new normal size.
function saveWindowState(file, win) {
  try {
    const nb = typeof win.getNormalBounds === 'function'
      ? win.getNormalBounds()
      : win.getBounds();
    fs.writeFileSync(file, JSON.stringify({
      width: nb.width,
      height: nb.height,
      x: nb.x,
      y: nb.y,
      maximized: Boolean(typeof win.isMaximized === 'function' && win.isMaximized())
    }));
    return true;
  } catch (_) {
    return false;
  }
}

module.exports = { DEFAULT_STATE, loadWindowState, sanitizeWindowState, saveWindowState };
