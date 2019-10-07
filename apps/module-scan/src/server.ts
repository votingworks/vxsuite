//
// Just the HTTP glue to the functionality, no implementations.
// All actual implementations are in importer.ts and scanner.ts
//

import express, { Application, Request, Response } from 'express'
import * as path from 'path'
import { Election } from '@votingworks/ballot-encoder'

import SystemImporter, { Importer } from './importer'
import Store from './store'
import { FujitsuScanner, Scanner } from './scanner'

export interface AppOptions {
  store: Store
  importer: Importer
}

/**
 * Builds an express application, using `store` and `importer` to do the heavy
 * lifting.
 */
export function buildApp({ store, importer }: AppOptions): Application {
  const app: Application = express()

  app.use(express.json())

  app.post('/scan/configure', (request: Request, response: Response) => {
    // store the election file
    const election = request.body as Election
    importer.configure(election)
    response.json({ status: 'ok' })
  })

  app.post('/scan/scanBatch', async (_request, response) => {
    try {
      await importer.doImport()
      response.json({ status: 'ok' })
    } catch (err) {
      response.json({ status: `could not scan ${err.message}` })
    }
  })

  app.post('/scan/invalidateBatch', (_request, response) => {
    response.json({ status: 'ok' })
  })

  app.post('/scan/addManualBallot', async (request, response) => {
    const { ballotString } = request.body
    await importer.addManualBallot(new TextEncoder().encode(ballotString))
    response.json({ status: 'ok' })
  })

  app.post('/scan/export', async (_request, response) => {
    const cvrs = await importer.doExport()
    response.set('Content-Type', 'text/plain')
    response.send(cvrs)
  })

  app.get('/scan/status', async (_request, response) => {
    const status = await importer.getStatus()
    response.json(status)
  })

  app.delete('/scan/batch/:batchId', async (request, response) => {
    if (await store.deleteBatch(request.params.batchId)) {
      response.json({ status: 'ok' })
    } else {
      response.status(404).end()
    }
  })

  app.post('/scan/zero', async (_request, response) => {
    await importer.doZero()
    response.json({ status: 'ok' })
  })

  app.post('/scan/unconfigure', async (_request, response) => {
    await importer.unconfigure()
    response.json({ status: 'ok' })
  })

  app.get('/', (_request, response) => {
    response.sendFile(path.join(__dirname, '..', 'index.html'))
  })

  return app
}

export interface StartOptions {
  port: number | string
  store: Store
  scanner: Scanner
  importer: SystemImporter
  app: Application
}

/**
 * Starts the server with all the default options.
 */
export async function start({
  port = process.env.PORT || 3002,
  store = new Store(path.join(__dirname, '..', 'cvrs.db')),
  scanner = new FujitsuScanner(),
  importer = new SystemImporter({ store, scanner }),
  app = buildApp({ importer, store }),
}: Partial<StartOptions> = {}) {
  await store.init()
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Listening at http://localhost:${port}/`)
  })
}
