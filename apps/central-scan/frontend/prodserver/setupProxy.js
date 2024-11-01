// This file sets up React's proxy in development mode.
//
// Currently, non-native Node languages (e.g. typescript) are explicitly not supported:
// https://facebook.github.io/create-react-app/docs/proxying-api-requests-in-development#configuring-the-proxy-manually
//
/* eslint-disable */
/* istanbul ignore file */

// @ts-check

const { createProxyMiddleware: proxy } = require('http-proxy-middleware');

/**
 * @param {import('connect').Server} app
 */
module.exports = function (app) {
  app.use('/machine-config', (req, res, next) => {
    if (req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          machineId: process.env['VX_MACHINE_ID'] || '0000',
          codeVersion: process.env['VX_CODE_VERSION'] || 'dev',
        })
      );
    } else {
      next();
    }
  });

  app.use(proxy({
    target: 'http://localhost:3002/',
    pathFilter: ['/api', '/dock', '/central-scanner'],
  }))
};
