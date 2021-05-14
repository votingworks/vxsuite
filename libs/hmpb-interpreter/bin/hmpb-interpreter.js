#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-var-requires */
const main = require('../build/src/cli').default

main(process.argv, process.stdin, process.stdout, process.stderr).catch(
  (error) => {
    console.error(error)
    process.exit(1)
  }
)
