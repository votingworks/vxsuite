// Production proxy middleware. The route list and backend target are shared with
// the dev server (vite.config.ts) via ./proxy.js so they stay in sync.
/* eslint-disable */
/* istanbul ignore file */

// @ts-check

const { createProxyMiddleware: proxy } = require('http-proxy-middleware');
const { PROXY_PATHS, backendTarget } = require('./proxy');

/**
 * @param {import('connect').Server} app
 */
module.exports = function (app) {
  app.use(
    proxy({
      pathFilter: PROXY_PATHS,
      target: backendTarget(),
    })
  );
};
