// This file runs a simple production web server of the React production build
// it reuses setupProxy.js for consistent use of backend modules in dev and prod.
// This is plain JS rather than our TS setup in the React app because of that.
//
/* eslint-disable */
/* istanbul ignore file */

const express = require('express')

const app = express()
const port = 3000

app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  next()
})

// we might eventually want this proxy but not yet.
// const proxy = require('../client/src/setupProxy')
//proxy(app)

app.use('/', express.static('../client/build'))

app.listen(port, () => console.log(`Election Manager listening on port ${port}!`))
