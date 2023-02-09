// This file sets up React's proxy in development mode.
//
// Currently, non-native Node languages (e.g. typescript) are explicitly not supported:
// https://facebook.github.io/create-react-app/docs/proxying-api-requests-in-development#configuring-the-proxy-manually
//
/* eslint-disable */
/* istanbul ignore file */

const resolve = require('resolve');
const express = require('express');
const { createProxyMiddleware: proxy } = require('http-proxy-middleware');
const { dirname, join } = require('path');

/**
 * @param {import('connect').Server} app
 */
module.exports = function (app) {
  app.use(proxy('/convert', { target: 'http://localhost:3003/' }));
  app.use(proxy('/admin', { target: 'http://localhost:3004/' }));
  app.use(proxy('/api', { target: 'http://localhost:3004/' }));

  app.use('/machine-config', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        machineId: process.env.VX_MACHINE_ID || '0000',
        codeVersion: process.env.VX_CODE_VERSION || 'dev',
      })
    );
  });

  const pdfjsDistBuildPath = dirname(
    resolve.sync('pdfjs-dist', { basedir: join(__dirname, '../../../../libs/image-utils') })
  );
  app.use('/pdfjs-dist', express.static(pdfjsDistBuildPath));
};
