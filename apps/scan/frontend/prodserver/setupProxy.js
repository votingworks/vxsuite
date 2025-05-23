// This file sets up React's proxy in development mode.
//
// Currently, non-native Node languages (e.g. typescript) are explicitly not supported:
// https://facebook.github.io/create-react-app/docs/proxying-api-requests-in-development#configuring-the-proxy-manually
//
/* eslint-disable */
/* istanbul ignore file - @preserve */

// @ts-check

const { createProxyMiddleware: proxy } = require('http-proxy-middleware');

/**
 * @param {import('connect').Server} app
 */
module.exports = function (app) {
  app.use(
    proxy({
      pathFilter: ['/api', '/dock'],
      target: 'http://localhost:3002/',
    })
  );
};
