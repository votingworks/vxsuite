// @ts-check
/* eslint-disable @typescript-eslint/no-var-requires, global-require, import/no-dynamic-require */

if (process.env.NODE_ENV !== 'production') {
  // eslint-disable-next-line import/no-extraneous-dependencies
  require('esbuild-runner/register');
}

const { ok, wrapException } = require('@votingworks/basics');
const { resolve } = require('path');
const json = require('./json_serialization');

if (typeof process.argv[2] !== 'string') {
  throw new Error('missing worker path');
}

const { call } = require(resolve(__dirname, process.argv[2]));

process.on(
  'message',
  /**
   * @param {import('./json_serialization').SerializedMessage} input
   */
  async (input) => {
    let output;

    try {
      output = await call(json.deserialize(input));

      if (process.send) {
        process.send(json.serialize(ok(output)));
      }
    } catch (error) {
      if (process.send) {
        process.send(json.serialize(wrapException(error)));
      }
    }
  }
);
