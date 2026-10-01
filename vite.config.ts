import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

// Strict CSP for production builds (desktop + web). The dev server needs a
// websocket for HMR, so it gets a relaxed policy.
const CSP_BUILD =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";
const CSP_DEV = CSP_BUILD.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'").replace(
  "connect-src 'self'",
  "connect-src 'self' ws://localhost:* http://localhost:*",
);

function csp(): Plugin {
  return {
    name: 'kdp-csp',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        return html.replace('<!--CSP-->', ctx.server ? CSP_DEV : CSP_BUILD);
      },
    },
  };
}

export default defineConfig({
  // Relative base: works from file:// (Electron), a custom domain, or a GitHub Pages sub-path.
  base: './',
  plugins: [csp()],
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
  server: { port: 5173, strictPort: true },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
