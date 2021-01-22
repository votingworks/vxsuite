// @ts-check
/* eslint-disable @typescript-eslint/no-var-requires */

if (process.env.NODE_ENV !== 'production') {
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
pp &&
  pp.on('message', async (input) => {
    let output

    try {
      output = await call(json.deserialize(input))
    } catch (error) {
      output = { type: 'error', error: `${error.stack}` }
    }

    pp.postMessage({ output: json.serialize(output) })
  })
