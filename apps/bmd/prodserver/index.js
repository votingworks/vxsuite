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

app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  next()
})
proxy(app)

app.get('/machine-id', (req, res) => {
  res.json({
    "machineId": process.env.VX_MACHINE_ID || "000",
  })
})

app.use('/', express.static('../build'))

app.listen(port, () => console.log(`BMD listening on port ${port}!`))
