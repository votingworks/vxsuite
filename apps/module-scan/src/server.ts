//
// Just the HTTP glue to the functionality, no implementations.
// All actual implementations are in importer.ts and scanner.ts
//

import express, { Application, RequestHandler } from 'express'
import multer from 'multer'
import * as path from 'path'
import { Election } from '@votingworks/ballot-encoder'

import SystemImporter, { Importer } from './importer'
import makeTemporaryBallotImportImageDirectories from './makeTemporaryBallotImportImageDirectories'
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
  const upload = multer({ storage: multer.memoryStorage() })

  app.use(express.json())

  app.get('/config/election', async (_request, response) => {
    response.json(await store.getElection())
  })

  app.put('/config/election', async (request, response) => {
    // store the election file
    const election = request.body as Election
    importer.configure(election)
    await store.setElection(election)
    response.json({ status: 'ok' })
  })

  app.delete('/config/election', async (_request, response) => {
    await importer.unconfigure()
    await store.setElection(undefined)
    response.json({ status: 'ok' })
  })

  app.post('/scan/scanBatch', async (_request, response) => {
    try {
      await importer.doImport()
      response.json({ status: 'ok' })
    } catch (err) {
      response.json({ status: `could not scan: ${err.message}` })
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

  app.post(
    '/scan/hmpb/addTemplates',
    upload.array('ballots') as RequestHandler,
    async (request, response) => {
      try {
        for (const file of request.files as Express.Multer.File[]) {
          if (file.mimetype !== 'application/pdf') {
            response.status(400).json({
              errors: [
                {
                  type: 'invalid-ballot-type',
                  message: `expected ballot files to be application/pdf, but got ${file.mimetype}`,
                },
              ],
            })
            return
          }

          const metadatas = await importer.addHmpbTemplates(file.buffer)

          if (metadatas.length > 0) {
            const metadata = metadatas[0]

            await store.addHmpbTemplate(file.buffer, {
              ballotStyleId: metadata.ballotStyleId,
              precinctId: metadata.precinctId,
              isTestBallot: metadata.isTestBallot,
            })
          }
        }

        response.json({ status: 'ok' })
      } catch (error) {
        response.status(500).json({
          errors: [
            {
              type: 'internal-server-error',
              message: error.message,
            },
          ],
        })
      }
    }
  )

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
    if (await store.deleteBatch(parseInt(request.params.batchId, 10))) {
      response.json({ status: 'ok' })
    } else {
      response.status(404).end()
    }
  })

  app.post('/scan/zero', async (_request, response) => {
    await importer.doZero()
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
  importer: Importer
  app: Application
  log: typeof console.log
}

/**
 * Starts the server with all the default options.
 */
export async function start({
  port = process.env.PORT || 3002,
  store = new Store(path.join(__dirname, '..', 'cvrs.db')),
  scanner = new FujitsuScanner(),
  importer = new SystemImporter({
    store,
    scanner,
    ...makeTemporaryBallotImportImageDirectories().paths,
  }),
  app = buildApp({ importer, store }),
  log = console.log,
}: Partial<StartOptions> = {}): Promise<void> {
  await store.init()

  const election = await store.getElection()
  if (election) {
    importer.configure(election)
  }

  for (const [pdf, metadata] of await store.getHmpbTemplates()) {
    log('Re-loading existing HMPB template', metadata)
    await importer.addHmpbTemplates(pdf)
  }

  app.listen(port, () => {
    log(`Listening at http://localhost:${port}/`)

    if (importer instanceof SystemImporter) {
      log(`Scanning ballots into ${importer.ballotImagesPath}`)
    }
  })
}
