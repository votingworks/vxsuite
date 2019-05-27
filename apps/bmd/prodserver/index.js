// This file runs a simple production web server of the React production build
// it reuses setupProxy.js for consistent use of backend modules in dev and prod.
// This is plain JS rather than our TS setup in the React app because of that.
//
/* eslint-disable */
/* istanbul ignore file */

const express = require('express')
const proxy = require('../src/setupProxy')

const app = express()
const port = 3000

proxy(app)
app.use('/', express.static('../build'))

app.listen(port, () => console.log(`BMD listening on port ${port}!`))
