// @ts-check
/* eslint-disable @typescript-eslint/no-var-requires, global-require, import/no-dynamic-require, no-underscore-dangle */

if (process.env.NODE_ENV !== 'production') {
  // eslint-disable-next-line import/no-extraneous-dependencies
  require('esbuild-runner/register');
}

const { ok, wrapException } = require('@votingworks/basics');
const { resolve } = require('path');
const { parentPort, workerData } = require('worker_threads');
const json = require('./json_serialization');

if (typeof workerData.__workerPath !== 'string') {
  throw new Error('missing worker path');
}

const { call } = require(resolve(__dirname, workerData.__workerPath));

const pp = parentPort;
if (pp) {
  pp.on('message', async (input) => {
    let output;

    try {
      output = ok(await call(json.deserialize(input)));
    } catch (error) {
      output = wrapException(error);
    }

    pp.postMessage(json.serialize(output));
  });
}
