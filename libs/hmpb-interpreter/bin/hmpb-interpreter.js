#!/usr/bin/env node
const main = require('../dist/src/cli').default

main(process.argv, process.stdin, process.stdout, process.stderr).catch(
  (error) => {
    console.error(error)
    process.exit(1)
  }
)
