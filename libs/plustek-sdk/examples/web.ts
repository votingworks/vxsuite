/**
 * This example provides a basic web application to test the scanner.
 *
 * Run it:
 *
 *   pnpx ts-node -T examples/web.ts
 *
 * With debugging:
 *
 *   DEBUG=* pnpx ts-node -T examples/web.ts
 */

import { createHash } from 'crypto'
import makeDebug from 'debug'
import { createReadStream } from 'fs'
import { createServer } from 'http'
import { join } from 'path'
import { createClient } from '../src'

const debug = makeDebug('plustek-sdk:example')

main()
  .catch((error) => {
    console.error('CRASH:', error.stack)
    return 1
  })
  .then((code) => {
    process.exitCode = code
  })

async function main(): Promise<number> {
  const scanner = (await createClient()).unwrap()
  const scannedImages = new Map<string, string>()

  createServer(async (req, res) => {
    debug('REQUEST %s', req.url)

    switch (req.url) {
      case '/': {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        createReadStream(join(__dirname, 'web.html')).pipe(res)
        break
      }

      case '/status': {
        debug('getting paper status')
        const result = await scanner.getPaperStatus()
        const paperStatus = result.mapOrElse(
          (error) => (error instanceof Error ? error.message : error),
          (status) => status
        )
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
        res.writeHead(result.isErr() ? 500 : 200)
        res.end(result.err()?.toString())
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
  }).listen(process.env.PORT ?? 8000)

  return 0
}
