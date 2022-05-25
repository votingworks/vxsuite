// This file runs a simple production web server of the React production build
// it reuses setupProxy.js for consistent use of backend modules in dev and prod.
// This is plain JS rather than our TS setup in the React app because of that.
//
/* eslint-disable */
/* istanbul ignore file */

const express = require('express');
const path = require('path');
const { Logger, LogSource, LogEventId } = require('@votingworks/logging');

const { setupServer } = require('./server');
const { BUILD_DIR } = require('./constants');
const app = express();
const port = 3000;
const logger = new Logger(LogSource.VxPrecinctScanService);

app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});

setupServer(app);

app.use(express.static(BUILD_DIR));
app.get('*', (req, res) => {
  res.sendFile(path.join(BUILD_DIR, 'index.html'));
});

app.listen(port, () => {
  logger.log(LogEventId.ApplicationStartup, 'system', {
    message: `Precinct Scanner running at http://localhost:${port}/`,
    disposition: 'success',
  });
}).on('error', error => {
  logger.log(LogEventId.ApplicationStartup, 'system', {
    message: `Error in starting Precinct Scanner: ${error.message}`,
    disposition: 'failure',
  });
});
