/* eslint-disable */
/* istanbul ignore file */

const { createProxyMiddleware: proxy } = require('http-proxy-middleware');

/**
 * @param {import('connect').Server} server
 */
function setupServer(server) {
  server.use(proxy('/card', { target: 'http://localhost:3001/' }));
  server.use(proxy('/scan', { target: 'http://localhost:3002/' }));
  server.use(proxy('/config', { target: 'http://localhost:3002/' }));

  server.use('/machine-config', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        machineId: process.env.VX_MACHINE_ID || '0000',
        codeVersion: process.env.VX_CODE_VERSION || 'dev',
      })
    );
  });
}

exports.setupServer = setupServer;
