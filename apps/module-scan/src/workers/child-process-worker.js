// @ts-check
/* eslint-disable @typescript-eslint/no-var-requires */

if (process.env.NODE_ENV !== 'production') {
  require('ts-node').register({ transpileOnly: true })
}

const { resolve } = require('path')
const json = require('./json-serialization')

if (typeof process.argv[2] !== 'string') {
  throw new Error('missing worker path')
}

const { call } = require(resolve(__dirname, process.argv[2]))

process.on('message', async (input) => {
  let output

  try {
    output = await call(json.deserialize(input))
  } catch (error) {
    output = { type: 'error', error: `${error.stack}` }
  }

  process.send && process.send({ output: json.serialize(output) })
})
