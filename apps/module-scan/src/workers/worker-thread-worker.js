// @ts-check
/* eslint-disable @typescript-eslint/no-var-requires, global-require, import/no-dynamic-require, no-underscore-dangle */

if (process.env.NODE_ENV !== 'production') {
  // eslint-disable-next-line import/no-extraneous-dependencies
  require('ts-node').register({ transpileOnly: true })
}

const { resolve } = require('path')
const { parentPort, workerData } = require('worker_threads')
const json = require('./json-serialization')

if (typeof workerData.__workerPath !== 'string') {
  throw new Error('missing worker path')
}

const { call } = require(resolve(__dirname, workerData.__workerPath))

const pp = parentPort
if (pp) {
  pp.on('message', async (input) => {
    let output

    try {
      output = await call(json.deserialize(input))
    } catch (error) {
      output = { type: 'error', error: `${error.stack}` }
    }

    pp.postMessage({ output: json.serialize(output) })
  })
}
