import { defineConfig, type Plugin } from 'vitest/config';

/**
 * The shipped Content-Security-Policy forbids every network request, which is
 * the point (see the README). That also blocks Vite's hot-reload WebSocket, so
 * in dev only we widen connect-src just enough for it.
 *
 * Done this way round deliberately: index.html holds the real policy, so what
 * is audited is what is served, and the relaxation exists only while the dev
 * server is running.
 */
function allowDevHotReload(): Plugin {
  return {
    name: 'allow-dev-hot-reload',
    apply: 'serve',
    transformIndexHtml(html) {
      return html.replace("connect-src 'none'", 'connect-src ws: wss:');
    },
  };
}

export default defineConfig({
  plugins: [allowDevHotReload()],
  build: {
    target: 'es2022',
    // The app has no dynamic imports, so this polyfill only adds a fetch() to a
    // bundle that must not be able to reach the network at all.
    modulePreload: { polyfill: false },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
