/**
 * This example provides a basic web application to test the scanner.
 *
 * Run it:
 *
 *   pnpx ts-node -T examples/web
 *
 * With debugging:
 *
 *   DEBUG=* pnpx ts-node -T examples/web
 */

import { safeParseJSON } from '@votingworks/types'
import { deferred } from '@votingworks/utils'
import { createHash } from 'crypto'
import makeDebug from 'debug'
import { createReadStream } from 'fs'
import { createServer, IncomingMessage } from 'http'
import { join } from 'path'
import * as z from 'zod'
import { createClient, MockScannerClient } from '../../src'

const debug = makeDebug('plustek-sdk:example')

const LoadRequestSchema = z.object({
  files: z.array(z.string()),
})

main(process.argv.slice(2))
  .catch((error) => {
    console.error('CRASH:', error.stack)
    return 1
  })
  .then((code) => {
    process.exitCode = code
  })

async function main(args: readonly string[]): Promise<number> {
  let useMockClient = false
  let port = process.env.PORT || 8000

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--mock' || arg === '-m') {
      useMockClient = true
    } else if (arg === '--port' || arg === '-p') {
      const value = args[++i]
      if (/^\d+$/.test(value ?? '')) {
        port = Number(value)
      } else {
        console.error(`invalid port: ${value}`)
        return -1
      }
    }
  }

  const scanner = useMockClient
    ? await (async () => {
        const mock = new MockScannerClient()
        await mock.connect()
        return mock
      })()
    : (await createClient()).unsafeUnwrap()
  const scannedImages = new Map<string, string>()

  createServer(async (req, res) => {
    debug('REQUEST %s', req.url)

    switch (req.url) {
      case '/': {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        createReadStream(join(__dirname, 'index.html')).pipe(res)
        break
      }

      case '/status': {
        debug('getting paper status')
        const result = await scanner.getPaperStatus()
        const paperStatus = result.ok() ?? ((err) => 
          err instanceof Error ? err.message : err
        )(result.err())
        debug('paper status: %s', paperStatus)
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end(paperStatus)
        break
      }

      case '/scan': {
        debug('scanning')
        const result = await scanner.scan()
        if (result.isOk()) {
          res.writeHead(200)
          debug('scan result: %o', result.ok())
          for (const file of result.ok().files) {
            const hash = createHash('sha256').update(file).digest('hex')
            scannedImages.set(hash, file)
            res.write(`/images/${hash}.jpg\n`)
          }
          res.end()
        } else {
          debug('scan error: %s', result.err())
          res.writeHead(500)
          res.end(`${result.err()}`)
        }
        break
      }

      case '/accept': {
        debug('accepting')
        const result = await scanner.accept()
        debug('accept result: %s', result.isOk() ? 'ok' : result.err())
        res.writeHead(result.isErr() ? 500 : 200)
        res.end(result.err()?.toString())
        break
      }

      case '/reject': {
        debug('rejecting')
        const result = await scanner.reject({ hold: false })
        debug('reject result: %s', result.isOk() ? 'ok' : result.err())
        res.writeHead(result.isErr() ? 500 : 200)
        res.end(result.err()?.toString())
        break
      }

      case '/reject-hold': {
        debug('rejecting & holding')
        const result = await scanner.reject({ hold: true })
        debug('reject result: %s', result.isOk() ? 'ok' : result.err())
        res.writeHead(result.isErr() ? 500 : 200).end(result.err()?.toString())
        break
      }

      case '/mock': {
        if (!(scanner instanceof MockScannerClient)) {
          res.writeHead(404).end('mocking not enabled; use --mock')
        } else {
          if (req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'text/html' })
            createReadStream(join(__dirname, 'mock.html')).pipe(res)
          } else if (req.method === 'PUT') {
            if (req.headers['content-type'] !== 'application/json') {
              res.writeHead(406).end()
            } else {
              const body = await readRequestBody(req)
              debug('PUT /mock body=%s', body)
              const parseResult = safeParseJSON(body, LoadRequestSchema)

              if (parseResult.isErr()) {
                res.writeHead(400).end(`${parseResult.err()}`)
              } else {
                const {files} = parseResult.ok()
                  debug('loading a mock sheet: %o', files)
                  const simulateLoadResult = await scanner.simulateLoadSheet(files)
                  if (simulateLoadResult.isErr()) {
                    res.writeHead(500).end(`${simulateLoadResult.err()}`)
                  } else {
                    res.writeHead(200).end()
                  }
              }
            }
          } else if (req.method === 'DELETE') {
            const simulateRemoveResult = (await scanner.simulateRemoveSheet())
            if (simulateRemoveResult.isErr()) {
              res.writeHead(500).end(`${simulateRemoveResult.err()}`)
            } else {
              res.writeHead(200).end()
            }
          }
        }
        break
      }

      default: {
        if (/^\/images\/([^/]+).jpg$/.test(req.url ?? '')) {
          const imageHash = RegExp.$1
          const imagePath = scannedImages.get(imageHash)
          if (imagePath) {
            debug('serving image: %s', imagePath)
            res.writeHead(200)
            createReadStream(imagePath).pipe(res)
          } else {
            debug('image with hash not found: %s', imageHash)
            res.writeHead(404)
            res.end('Not Found')
          }
        } else {
          debug('unknown URL: %s', req.url)
          res.writeHead(404)
          res.end('Not Found')
        }
      }
    }
  }).listen(port, () => {
    console.log(`Scanner controls: http://localhost:${port}/`)
    if (useMockClient) {
      console.log(`   Mock controls: http://localhost:${port}/mock`)
    }
  })

  return 0
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const { promise, resolve } = deferred<string>()
  let body = ''

  request
    .setEncoding('utf-8')
    .on('data', (chunk: string) => {
      body += chunk
    })
    .on('end', () => {
      resolve(body)
    })
    .resume()

  return promise
}
