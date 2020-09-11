// This file runs a simple production web server of the React production build
// it reuses setupProxy.js for consistent use of backend modules in dev and prod.
// This is plain JS rather than our TS setup in the React app because of that.
//
/* eslint-disable */
/* istanbul ignore file */

const express = require('express')
const path = require('path')
const fs = require('fs')

const appRoot = process.argv[2]

if (!appRoot || !fs.statSync(appRoot).isDirectory()) {
  process.stderr.write('node ./prodserver APPROOT\n')
  process.exit(1)
}

const proxy = require(path.join(appRoot, 'src/setupProxy'))
const pkg = require(path.join(appRoot, 'package.json'))
const app = express()
const port = 3000

app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  next()
})

proxy(app)

app.use(express.static(path.join(appRoot, 'build')))
app.get('*', (req, res) => {
  res.sendFile(path.join(appRoot, 'build/index.html'))
})

app.listen(port, () => console.log(`${pkg.name} listening on port ${port}!`))
