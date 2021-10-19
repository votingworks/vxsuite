// @ts-check
/* eslint-disable @typescript-eslint/no-var-requires, global-require, import/no-dynamic-require */

if (process.env.NODE_ENV !== 'production') {
  // eslint-disable-next-line import/no-extraneous-dependencies
  require('ts-node').register({ transpileOnly: true });
}

const { resolve } = require('path');
const json = require('./json-serialization');

if (typeof process.argv[2] !== 'string') {
  throw new Error('missing worker path');
}

const { call } = require(resolve(__dirname, process.argv[2]));

process.on('message', async (input) => {
  let output;

  try {
    output = await call(json.deserialize(input));
  } catch (error) {
    output = { type: 'error', error: `${error.stack}` };
  }

  if (process.send) {
    process.send({ output: json.serialize(output) });
  }
});
