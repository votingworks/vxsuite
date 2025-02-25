// This file runs a simple production web server of the React production build
// it reuses setupProxy.js for consistent use of backend modules in dev and prod.
// This is plain JS rather than our TS setup in the React app because of that.
//
/* eslint-disable */
/* istanbul ignore file */

const express = require('express');
const path = require('path');
const { Logger, LogSource, LogEventId } = require('@votingworks/logging');
const { handleUncaughtExceptions } = require('@votingworks/backend');

const proxy = require('./setupProxy');
const app = express();
const port = 3000;
const logger = new Logger(LogSource.VxPollbookFrontendServer);

handleUncaughtExceptions(logger);

app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});

proxy(app);

app.use(express.static(path.join(__dirname, '../build')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../build/index.html'));
});

app
  .listen(port, () => {
    logger.log(LogEventId.ApplicationStartup, 'system', {
      message: `VxAdmin frontend running at http://localhost:${port}/`,
      disposition: 'success',
    });
  })
  .on('error', (error) => {
    logger.log(LogEventId.ApplicationStartup, 'system', {
      message: `Error in starting VxAdmin frontend: ${error.message}`,
      disposition: 'failure',
    });
  });
