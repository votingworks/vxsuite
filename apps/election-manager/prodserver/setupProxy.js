// This file sets up React's proxy in development mode.
//
// Currently, non-native Node languages (e.g. typescript) are explicitly not supported:
// https://facebook.github.io/create-react-app/docs/proxying-api-requests-in-development#configuring-the-proxy-manually
//
/* eslint-disable */
/* istanbul ignore file */

const { createProxyMiddleware: proxy } = require('http-proxy-middleware')

module.exports = function (app) {
  app.use(proxy('/card', { target: 'http://localhost:3001/' }))
  app.use(proxy('/convert', { target: 'http://localhost:3003/' }))

  app.get('/machine-config', (req, res) => {
    res.json({
      machineId: process.env.VX_MACHINE_ID || '0000',
      codeVersion: process.env.VX_CODE_VERSION || 'dev',
      bypassAuthentication: process.env.BYPASS_AUTHENTICATION || false,
    })
  })
}
