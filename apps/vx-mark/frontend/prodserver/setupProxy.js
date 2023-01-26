// This file sets up React's proxy in development mode.
//
// Currently, non-native Node languages (e.g. typescript) are explicitly not supported:
// https://facebook.github.io/create-react-app/docs/proxying-api-requests-in-development#configuring-the-proxy-manually
//
/* eslint-disable */
/* istanbul ignore file */

const { createProxyMiddleware: proxy } = require('http-proxy-middleware');

/**
 * @param {import('connect').Server} app
 */
module.exports = function (app) {
  app.use(proxy('/card', { target: 'http://localhost:3001/' }));

  app.use('/machine-config', (req, res, next) => {
    if (req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          appModeKey: process.env.VX_APP_MODE || 'MarkAndPrint',
          machineId: process.env.VX_MACHINE_ID || '000',
          codeVersion: process.env.VX_CODE_VERSION || 'dev',
          screenOrientation: process.env.VX_SCREEN_ORIENTATION || 'portrait',
        })
      );
    } else {
      next();
    }
  });
};
