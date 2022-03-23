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
 * @param {string} envVar
 * @param {boolean=} defaultValue
 * @returns {boolean}
 */
function asBoolean(envVar, defaultValue = false) {
  switch (envVar && envVar.trim().toLowerCase()) {
    case undefined:
    case '':
      return defaultValue;

    case 'true':
    case 'yes':
    case '1':
      return true;

    case 'false':
    case 'no':
    case '0':
      return false;

    default:
      console.log(
        `cannot interpret "${envVar}" as a boolean, expected "true" or "false"; using default value "${defaultValue}""`
      );
      return defaultValue;
  }
}

module.exports = function (app) {
  app.use(proxy('/card', { target: 'http://localhost:3001/' }));
  app.use(proxy('/convert', { target: 'http://localhost:3003/' }));

  app.get('/machine-config', (req, res) => {
    res.json({
      machineId: process.env.VX_MACHINE_ID || '0000',
      codeVersion: process.env.VX_CODE_VERSION || 'dev',
      bypassAuthentication: asBoolean(process.env.BYPASS_AUTHENTICATION),
      converter: process.env.VX_CONVERTER || 'ms',
    });
  });

  const pdfjsDistBuildPath = dirname(
    resolve.sync('pdfjs-dist', { basedir: join(__dirname, '..') })
  );
  app.use('/pdfjs-dist', express.static(pdfjsDistBuildPath));
};
