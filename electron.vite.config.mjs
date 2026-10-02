import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readdirSync, copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

// The main-process modules are plain CommonJS on purpose (zero-logic-change
// migration). Instead of bundling them, copy every src/main/*.js verbatim
// into out/main/ so the pass-through relative require()s resolve at runtime.
function copyMainModules() {
  return {
    name: 'flux-copy-main-modules',
    closeBundle() {
      const srcDir = resolve(root, 'src/main');
      const outDir = resolve(root, 'out/main');
      mkdirSync(outDir, { recursive: true });
      for (const f of readdirSync(srcDir)) {
        if (f.endsWith('.js')) copyFileSync(resolve(srcDir, f), resolve(outDir, f));
      }
    }
  };
}

// Dev-only CSP relaxation: Vite HMR needs ws:// and injects inline
// style/script tags (react-refresh). The production CSP stays strict.
function fluxCspDev() {
  return {
    name: 'flux-csp-dev',
    transformIndexHtml(html, ctx) {
      if (!ctx.server) return html;
      return html
        .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
        .replace("style-src 'self'", "style-src 'self' 'unsafe-inline'")
        .replace("connect-src 'self'", "connect-src 'self' ws:");
    }
  };
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), copyMainModules()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [react(), tailwindcss(), fluxCspDev()]
  }
});
