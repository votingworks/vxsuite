// This file sets up React's proxy in development mode.
//
// Currently, non-native Node languages (e.g. typescript) are explicitly not supported:
// https://facebook.github.io/create-react-app/docs/proxying-api-requests-in-development#configuring-the-proxy-manually
//
/* eslint-disable */
/* istanbul ignore file */

const { createProxyMiddleware } = require('http-proxy-middleware')

module.exports = function (app) {
  app.use(createProxyMiddleware('/card', { target: 'http://localhost:3001/' }))

  app.get('/machine-config', (req, res) => {
    res.json({
      appMode: process.env.VX_APP_MODE || 'VxMark',
      machineId: process.env.VX_MACHINE_ID || '000',
    })
  })
}
