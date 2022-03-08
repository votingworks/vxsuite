#!/usr/bin/env node

require('esbuild-runner/register');

require('../src/cli')
  .main(process.argv, process.stdin, process.stdout, process.stderr)
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
