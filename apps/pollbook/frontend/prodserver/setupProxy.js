// Production proxy middleware. The route list and backend target are shared with
// the dev server (vite.config.ts) via ./proxy.js so they stay in sync.
/* eslint-disable */

// @ts-check

import { createProxyMiddleware } from 'http-proxy-middleware';
import { PROXY_PATHS, backendTarget } from './proxy.js';

/**
 * @param {import('connect').Server} app
 */
export function setupProxy(app) {
  app.use(
    createProxyMiddleware({
      pathFilter: PROXY_PATHS,
      target: backendTarget(),
    })
  );
}
