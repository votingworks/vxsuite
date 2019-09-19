//
// Just the HTTP glue to the functionality, no implementations.
// All actual implementations are in scanner.ts
//

import express, { Application, Request, Response } from 'express'
import * as path from 'path'

import SystemScanner, { Scanner } from './scanner'
import Store from './store'
import { Election } from './types'

export function buildApp(scanner: Scanner): Application {
  const app: Application = express()

  app.use(express.json())

  app.post('/scan/configure', (request: Request, response: Response) => {
    // store the election file
    const election = request.body as Election
    scanner.configure(election)
    response.json({ status: 'ok' })
  })

  app.post('/scan/scanBatch', async (_request, response) => {
    try {
      await scanner.doScan()
      response.json({ status: 'ok' })
    } catch (err) {
      response.json({ status: `could not scan ${err}` })
    }
  })

  app.post('/scan/invalidateBatch', (_request, response) => {
    response.json({ status: 'ok' })
  })

  app.post('/scan/addManualBallot', async (request, response) => {
    const { ballotString } = request.body
    await scanner.addManualBallot(ballotString)
    response.json({ status: 'ok' })
  })

  app.post('/scan/export', async (_request, response) => {
    const cvrs = await scanner.doExport()
    response.set('Content-Type', 'text/plain')
    response.send(cvrs)
  })

  app.get('/scan/status', async (_request, response) => {
    const status = await scanner.getStatus()
    response.json(status)
  })

  app.post('/scan/zero', async (_request, response) => {
    await scanner.doZero()
    response.json({ status: 'ok' })
  })

  app.post('/scan/unconfigure', async (_request, response) => {
    await scanner.unconfigure()
    response.json({ status: 'ok' })
  })

  app.get('/', (_request, response) => {
    response.sendFile(path.join(__dirname, '..', 'index.html'))
  })

  return app
}

export interface Options {
  port: number | string
  store: Store
  scanner: SystemScanner
  app: Application
}

export async function start({
  port = process.env.PORT || 3002,
  store = new Store(path.join(__dirname, '..', 'cvrs.db')),
  scanner = new SystemScanner({ store }),
  app = buildApp(scanner),
}: Partial<Options> = {}) {
  await store.init()
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Listening at http://localhost:${port}/`)
  })
}
