#!/usr/bin/env node
/* One-off visual probe: boot the BUILT renderer in xvfb and screenshot the
 * sidebar footer (FLUX wordmark + Discord badge). Prints geometry JSON. */
const fs = require('fs');
const { app, BrowserWindow } = require('electron');

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280, height: 800, show: false,
    webPreferences: { offscreen: true, contextIsolation: true, nodeIntegration: false }
  });
  await win.loadFile(path_join('out/renderer/index.html'));
  await new Promise((r) => setTimeout(r, 4000));
  const img = await win.webContents.capturePage();
  fs.writeFileSync('/home/z/my-project/flux_sidebar_v035.png', img.toPNG());
  const info = await win.webContents.executeJavaScript(`(() => {
    const b = document.querySelector('[data-testid=sidebar-discord]');
    const p = [...document.querySelectorAll('p')].find((e) => e.textContent.trim() === 'FLUX');
    const r = b && b.getBoundingClientRect();
    const q = p && p.getBoundingClientRect();
    const svg = b && b.querySelector('svg');
    const cs = b && getComputedStyle(b);
    return {
      discord: r && { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      flux: q && { x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height) },
      sameRow: r && q && Math.abs((r.y + r.height / 2) - (q.y + q.height / 2)) < 6,
      rightOfFlux: r && q && r.x > q.x,
      badgeFill: cs && cs.backgroundColor,
      glyphColor: svg && getComputedStyle(svg).color,
      versionStillShown: /FLUX\\s*v\\d/.test(document.body.innerText)
    };
  })()`);
  console.log('SIDEBAR_PROBE ' + JSON.stringify(info, null, 2));
  app.exit(0);
}).catch((e) => { console.error('PROBE FAIL', e); app.exit(1); });

function path_join(rel) {
  const path = require('path');
  return path.join(__dirname, '..', rel);
}
