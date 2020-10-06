// @ts-check
/* eslint-disable @typescript-eslint/no-var-requires */

const { resolve } = require('path')

require('ts-node').register({ transpileOnly: true })

if (typeof process.argv[2] !== 'string') {
  throw new Error('missing worker path')
}

const { call } = require(resolve(__dirname, process.argv[2]))

process.on('message', async (input) => {
  let output

  try {
    output = await call(input)
  } catch (error) {
    output = { type: 'error', error: `${error.stack}` }
  }

  process.send && process.send({ output })
})
