//
// Just the HTTP glue to the functionality, no implementations.
// All actual implementations are in importer.ts and scanner.ts
//

import express, { Application, RequestHandler } from 'express'
import multer from 'multer'
import * as path from 'path'
import SystemImporter, { Importer } from './importer'
import { FujitsuScanner, Scanner } from './scanner'
import Store from './store'
import { BallotConfig } from './types'
import makeTemporaryBallotImportImageDirectories from './util/makeTemporaryBallotImportImageDirectories'

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

  app.get('/config', async (_request, response) => {
    response.json({
      election: await store.getElection(),
      testMode: await store.getTestMode(),
    })
  })

  app.patch('/config', async (request, response) => {
    for (const key in request.body) {
      if (Object.prototype.hasOwnProperty.call(request.body, key)) {
        const value = request.body[key]

        switch (key) {
          case 'election':
            if (value === null) {
              await importer.unconfigure()
            } else {
              await importer.configure(value)
              await store.setElection(value)
            }
            break

          case 'testMode':
            await importer.setTestMode(value)
            await store.setTestMode(value)
            break

          default:
            response.status(400).json({
              errors: [
                {
                  type: 'unexpected-property',
                  message: `unexpected property '${key}'`,
                },
              ],
            })
            return
        }
      }
    }

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
    upload.fields([
      { name: 'ballots' },
      { name: 'metadatas' },
    ]) as RequestHandler,
    async (request, response) => {
      /* istanbul ignore next */
      if (Array.isArray(request.files)) {
        response.status(400).json({
          errors: [
            {
              type: 'missing-ballot-files',
              message: `expected ballot files in "ballots" and "metadatas" fields, but no files were found`,
            },
          ],
        })
        return
      }

      try {
        const { ballots = [], metadatas = [] } = request.files

        for (let i = 0; i < ballots.length; i++) {
          const ballotFile = ballots[i]
          const metadataFile = metadatas[i]

          if (ballotFile?.mimetype !== 'application/pdf') {
            response.status(400).json({
              errors: [
                {
                  type: 'invalid-ballot-type',
                  message: `expected ballot files to be application/pdf, but got ${ballotFile?.mimetype}`,
                },
              ],
            })
            return
          }

          if (metadataFile?.mimetype !== 'application/json') {
            response.status(400).json({
              errors: [
                {
                  type: 'invalid-metadata-type',
                  message: `expected ballot metadata to be application/json, but got ${metadataFile?.mimetype}`,
                },
              ],
            })
            return
          }

          const metadata: BallotConfig = JSON.parse(
            new TextDecoder().decode(metadataFile.buffer)
          )

          await importer.addHmpbTemplates(ballotFile.buffer, {
            ballotStyleId: metadata.ballotStyleId,
            precinctId: metadata.precinctId,
            isTestBallot: !metadata.isLiveMode,
            locales: metadata.locales,
          })
        }

        response.json({ status: 'ok' })
      } catch (error) {
        console.log(error)
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

  app.get('/scan/batch/:batchId', async (request, response) => {
    const batch = await store.getBatch(parseInt(request.params.batchId, 10))

    if (batch.length) {
      response.json(batch)
    } else {
      response.status(404).end()
    }
  })

  app.get('/scan/hmpb/ballot/:ballotId', async (request, response) => {
    const ballot = await store.getBallot(parseInt(request.params.ballotId, 10))

    if (ballot) {
      response.json(ballot)
    } else {
      response.status(404).end()
    }
  })

  app.patch('/scan/hmpb/ballot/:ballotId', async (request, response) => {
    await store.saveBallotAdjudication(
      parseInt(request.params.ballotId, 10),
      request.body
    )
    response.json({ status: 'ok' })
  })

  app.get('/scan/hmpb/ballot/:ballotId/image', async (request, response) => {
    const filename = await store.getBallotFilename(
      parseInt(request.params.ballotId, 10)
    )

    if (filename) {
      response.sendFile(filename)
    } else {
      response.status(404).end()
    }
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
  await importer.restoreConfig()

  app.listen(port, () => {
    log(`Listening at http://localhost:${port}/`)

    if (importer instanceof SystemImporter) {
      log(`Scanning ballots into ${importer.ballotImagesPath}`)
    }
  })
}
