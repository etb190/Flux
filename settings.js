// ── Flux settings: persisted app settings (JSON in userData) ─────────────
// Currently holds the ANGLE graphics backend choice (the same option as
// brave://flags/#use-angle — Chromium's "Choose ANGLE graphics backend").
// It must be applied via app.commandLine.appendSwitch BEFORE the app is
// ready, so main.js loads this file synchronously at startup and appends
// --use-angle=<backend> when a non-default backend is saved.
//
// Pure module (no electron import): main.js passes the settings file path,
// which keeps it unit-testable from plain Node.

const fs = require('fs');
const path = require('path');

// ANGLE backends supported by this Electron's Chromium on Windows.
// (Chromium 130 does not yet offer the newer "D3D11 WARP" flag choice;
// SwiftShader is the software-rendering fallback in this version.)
const ANGLE_BACKENDS = [
  { value: 'default', label: 'Default' },
  { value: 'd3d11', label: 'D3D11' },
  { value: 'd3d11on12', label: 'D3D11on12' },
  { value: 'd3d9', label: 'D3D9' },
  { value: 'gl', label: 'OpenGL' },
  { value: 'vulkan', label: 'Vulkan' },
  { value: 'swiftshader', label: 'SwiftShader (software)' }
];

// D3D9 is the out-of-the-box pick (same as choosing it in the browser flag).
const DEFAULTS = { angleBackend: 'd3d9' };

// settingsVersion 2: v0.9.0 stored 'default' both for "never picked" and for
// an explicit choice. On migration, a v1 file still on 'default' is treated
// as never-picked and upgraded to the new D3D9 pick; files already at v2
// keep an explicit 'Default' selection untouched.
const SETTINGS_VERSION = 2;

function normalizeBackend(value) {
  const v = String(value || '').toLowerCase().trim();
  return ANGLE_BACKENDS.some((b) => b.value === v) ? v : null;
}

// Load settings; missing/corrupt file → defaults.
function loadSettings(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    const settings = { ...DEFAULTS };
    let version = 1;
    if (parsed && typeof parsed === 'object') {
      version = Number(parsed.settingsVersion) >= 2 ? 2 : 1;
      const backend = normalizeBackend(parsed.angleBackend);
      if (backend) settings.angleBackend = backend;
    }
    // One-time v1 → v2 migration (see SETTINGS_VERSION above).
    if (version < 2 && settings.angleBackend === 'default') {
      settings.angleBackend = DEFAULTS.angleBackend;
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(
          file,
          JSON.stringify({ ...settings, settingsVersion: SETTINGS_VERSION }, null, 2) + '\n',
          'utf8'
        );
      } catch (_) { /* non-fatal: still return the migrated settings */ }
    }
    return settings;
  } catch (_) {
    return { ...DEFAULTS };
  }
}

// Merge a patch into the stored settings (validated). Returns the full
// settings object that was written.
function saveSettings(file, patch) {
  const current = loadSettings(file);
  const next = { ...current };
  if (patch && typeof patch === 'object') {
    if ('angleBackend' in patch) {
      const backend = normalizeBackend(patch.angleBackend);
      if (backend) next.angleBackend = backend;
    }
  }
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify({ ...next, settingsVersion: SETTINGS_VERSION }, null, 2) + '\n',
      'utf8'
    );
  } catch (e) {
    throw new Error('Could not save settings: ' + (e && e.message));
  }
  return next;
}

module.exports = { ANGLE_BACKENDS, DEFAULTS, SETTINGS_VERSION, normalizeBackend, loadSettings, saveSettings };
