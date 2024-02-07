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
  app.use(proxy('/admin', { target: 'http://localhost:3004/' }));
  app.use(proxy('/api', { target: 'http://localhost:3004/' }));
  app.use(proxy('/dock', { target: 'http://localhost:3004/' }));

  const pdfjsDistBuildPath = dirname(
    resolve.sync('pdfjs-dist', { basedir: join(__dirname, '..') })
  );
  app.use('/pdfjs-dist', express.static(pdfjsDistBuildPath));
};
