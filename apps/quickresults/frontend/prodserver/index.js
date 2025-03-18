// This file runs a simple production web server of the React production build
// it reuses setupProxy.js for consistent use of backend modules in dev and prod.
// This is plain JS rather than our TS setup in the React app because of that.
//
/* eslint-disable */
/* istanbul ignore file - @preserve */

const express = require('express');
const path = require('path');

const proxy = require('./setupProxy');
const app = express();
const port = process.env.PORT || 3000;

proxy(app);

app.use(express.static(path.join(__dirname, '../build')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../build/index.html'));
});

app
  .listen(port, "0.0.0.0", () => {
    console.log(`VxQuickResults frontend running on port ${port}`);
  })
  .on('error', (error) => {
    console.log('ERROR starting prod web server', error);
  });
