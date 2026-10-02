/* ── Settings overlay: graphics backend + home page API key/country ────── */

import { useEffect, useRef, useState } from 'react';
import { CloseIcon } from './icons.jsx';

export default function SettingsModal({ open, onClose, onSaved }) {
  const [backends, setBackends] = useState([{ value: 'default', label: 'Default' }]);
  const [angle, setAngle] = useState('d3d9');
  const [saaKey, setSaaKey] = useState('');
  const [saaCountry, setSaaCountry] = useState('us');
  const [gpuText, setGpuText] = useState('Checking GPU\u2026');
  const [saving, setSaving] = useState(false);
  const [saveLabel, setSaveLabel] = useState('Save');
  const angleAtLoadRef = useRef(null);
  const savingRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setSaving(false);
    savingRef.current = false;
    setSaveLabel('Save');

    const api = window.fluxAPI;
    (async () => {
      if (api && typeof api.getSettings === 'function') {
        try {
          const s = await api.getSettings();
          if (s) {
            const list = Array.isArray(s.backends) && s.backends.length
              ? s.backends
              : [{ value: 'default', label: 'Default' }];
            setBackends(list);
            const current = s.angleBackend || 'd3d9';
            setAngle(current);
            setSaaKey(s.saaApiKey || '');
            setSaaCountry(s.saaCountry || 'us');
            angleAtLoadRef.current = current;
          }
        } catch (_err) { /* leave the form as-is */ }
      }
      if (api && typeof api.getGpuInfo === 'function') {
        try {
          const gpu = await api.getGpuInfo();
          setGpuText(gpu && gpu.renderer
            ? 'Active renderer: ' + (gpu.vendor ? gpu.vendor + ' ' : '') + gpu.renderer
            : 'Active renderer: unavailable');
        } catch (_err) {
          setGpuText('Active renderer: unavailable');
        }
      } else {
        setGpuText('Active renderer: unavailable');
      }
    })();
  }, [open]);

  if (!open) return null;

  const angleChanged =
    angleAtLoadRef.current != null && angle !== angleAtLoadRef.current;

  async function save() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    const api = window.fluxAPI;
    try {
      if (api && typeof api.saveSettings === 'function') {
        await api.saveSettings({
          angleBackend: angle,
          saaApiKey: saaKey.trim(),
          saaCountry: saaCountry.trim()
        });
      }
      if (angleChanged && api && typeof api.relaunchApp === 'function') {
        setSaveLabel('Restarting\u2026');
        await api.relaunchApp();
        // If relaunch never fires (stubs / failure), restore the button.
        setTimeout(() => {
          savingRef.current = false;
          setSaving(false);
          setSaveLabel('Save & Restart');
        }, 1500);
        return;
      }
      // No ANGLE change: no restart needed — refresh the home page (the API
      // key or country may have changed).
      angleAtLoadRef.current = angle;
      savingRef.current = false;
      setSaving(false);
      setSaveLabel('Saved \u2713');
      if (onSaved) onSaved();
      setTimeout(() => {
        onClose();
        setSaveLabel('Save');
      }, 650);
    } catch (_err) {
      savingRef.current = false;
      setSaving(false);
      setSaveLabel('Save');
    }
  }

  return (
    <div
      data-testid="settings-view"
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();   // click on backdrop
      }}
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6"
    >
      <div className="w-full max-w-xl max-h-[85vh] overflow-y-auto scroll-dark rounded-2xl bg-raised border border-edge shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-edge">
          <span className="text-lg font-semibold">Settings</span>
          <button
            data-testid="settings-close"
            title="Close"
            aria-label="Close settings"
            onClick={onClose}
            className="p-1.5 rounded-lg text-dim hover:text-ink hover:bg-hover"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="px-6 py-5 border-b border-edge">
          <label className="block text-sm font-medium mb-2" htmlFor="settings-angle">
            Graphics backend (ANGLE)
          </label>
          <select
            id="settings-angle"
            data-testid="settings-angle"
            value={angle}
            onChange={(e) => {
              setAngle(e.target.value);
              if (!savingRef.current) {
                setSaveLabel(e.target.value !== angleAtLoadRef.current ? 'Save & Restart' : 'Save');
              }
            }}
            className="w-full rounded-lg bg-bg border border-edge px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          >
            {backends.map((b) => (
              <option key={b.value} value={b.value}>{b.label}</option>
            ))}
          </select>
          <p className="mt-2 text-xs leading-relaxed text-dim">
            Same option as the browser flag &ldquo;Choose ANGLE graphics
            backend&rdquo;. Flux picks <strong className="text-ink">D3D9</strong> by
            default; switch to SwiftShader (software rendering) if video still
            shows artifacts or fails to draw on your GPU. Takes effect after
            Flux restarts.
          </p>
          <p data-testid="settings-gpu" className="mt-2 text-xs text-dim">{gpuText}</p>
        </div>

        <div className="px-6 py-5">
          <label className="block text-sm font-medium mb-2" htmlFor="settings-saa-key">
            Streaming Availability API key
          </label>
          <input
            id="settings-saa-key"
            data-testid="settings-saa-key"
            type="password"
            value={saaKey}
            placeholder="motn-key-... or RapidAPI key"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setSaaKey(e.target.value)}
            className="w-full rounded-lg bg-bg border border-edge px-3 py-2 text-sm text-ink outline-none placeholder:text-dim focus:border-accent"
          />
          <p className="mt-2 text-xs leading-relaxed text-dim">
            Fills the home page service rows (daily Top&nbsp;10s, popular per
            service, new &amp; leaving soon). A working key ships built in —
            replace it with your own free key from{' '}
            <a className="text-accent hover:underline" href="https://developers.movieofthenight.com">
              developers.movieofthenight.com
            </a>{' '}
            if it runs out of quota. Trending comes from TMDB separately.
          </p>

          <label className="block text-sm font-medium mt-4 mb-2" htmlFor="settings-saa-country">
            Country (home catalogs)
          </label>
          <input
            id="settings-saa-country"
            data-testid="settings-saa-country"
            type="text"
            value={saaCountry}
            placeholder="us"
            maxLength={2}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setSaaCountry(e.target.value)}
            className="w-24 rounded-lg bg-bg border border-edge px-3 py-2 text-sm text-ink outline-none placeholder:text-dim focus:border-accent"
          />
          <p className="mt-2 text-xs text-dim">Two-letter code: us, gb, fr, es, it, ma&hellip;</p>
        </div>

        <div className="px-6 py-4 border-t border-edge flex justify-end">
          <button
            data-testid="settings-save"
            onClick={save}
            disabled={saving}
            className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-60"
          >
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
