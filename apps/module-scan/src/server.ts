//
// Just the HTTP glue to the functionality, no implementations.
// All actual implementations are in importer.ts and scanner.ts
//

import { parseElection } from '@votingworks/ballot-encoder'
import express, { Application, RequestHandler } from 'express'
import { readFile } from 'fs-extra'
import multer from 'multer'
import * as path from 'path'
import { inspect } from 'util'
import SystemImporter, { Importer } from './importer'
import { FujitsuScanner, Scanner } from './scanner'
import Store, { ALLOWED_CONFIG_KEYS, ConfigKey } from './store'
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
  const upload = multer({ storage: multer.diskStorage({}) })

  app.use(express.json())

  app.get('/config', async (_request, response) => {
    response.json({
      election: await store.getElection(),
      testMode: await store.getTestMode(),
    })
  })

  app.patch('/config', async (request, response) => {
    for (const [key, value] of Object.entries(request.body)) {
      try {
        if (!ALLOWED_CONFIG_KEYS.includes(key)) {
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

        switch (key as ConfigKey) {
          case ConfigKey.Election: {
            if (value === null) {
              await importer.unconfigure()
            } else {
              const election = parseElection(value)
              await importer.configure(election)
              await store.setElection(election)
            }
            break
          }

          case ConfigKey.TestMode: {
            if (typeof value !== 'boolean') {
              throw new TypeError()
            }
            await importer.setTestMode(value)
            await store.setTestMode(value)
            break
          }
        }
      } catch (error) {
        response.status(400).json({
          errors: [
            {
              type: 'invalid-value',
              message: `invalid config value for '${key}': ${inspect(value)}`,
            },
          ],
        })
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

  if (process.env.NODE_ENV !== 'production') {
    app.post(
      '/scan/scanFiles',
      upload.fields([{ name: 'files' }]) as RequestHandler,
      async (request, response) => {
        /* istanbul ignore next */
        if (Array.isArray(request.files)) {
          response.status(400).json({
            errors: [
              {
                type: 'missing-ballot-files',
                message: `expected ballot images in "files", but no files were found`,
              },
            ],
          })
          return
        }

        const { files = [] } = request.files

        if (files.length > 0) {
          const batchId = await store.addBatch()

          for (const file of files) {
            try {
              await importer.importFile(batchId, file.path)
            } catch (error) {
              console.error(
                `failed to import file ${file.originalname}: ${error.message}`
              )
            }
          }

          await store.finishBatch(batchId)
        }

        response.json({ status: 'ok' })
      }
    )
  }

  app.post('/scan/invalidateBatch', (_request, response) => {
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
            new TextDecoder().decode(await readFile(metadataFile.path))
          )

          await importer.addHmpbTemplates(await readFile(ballotFile.path), {
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

  app.get('/scan/hmpb/ballot/:ballotId', async (request, response) => {
    const ballot = await store.getBallot(request.params.ballotId)

    if (ballot) {
      response.json(ballot)
    } else {
      response.status(404).end()
    }
  })

  app.patch('/scan/hmpb/ballot/:ballotId', async (request, response) => {
    await store.saveBallotAdjudication(request.params.ballotId, request.body)
    response.json({ status: 'ok' })
  })

  app.get('/scan/hmpb/ballot/:ballotId/image', async (request, response) => {
    response.redirect(
      301,
      `/scan/hmpb/ballot/${request.params.ballotId}/image/normalized`
    )
  })

  app.get(
    '/scan/hmpb/ballot/:ballotId/image/:version',
    async (request, response) => {
      const filenames = await store.getBallotFilenames(request.params.ballotId)
      const version = request.params.version

      if (filenames && version in filenames) {
        response.sendFile(filenames[version as keyof typeof filenames])
      } else {
        response.status(404).end()
      }
    }
  )

  app.delete('/scan/batch/:batchId', async (request, response) => {
    if (await store.deleteBatch(request.params.batchId)) {
      response.json({ status: 'ok' })
    } else {
      response.status(404).end()
    }
  })

  app.get('/scan/hmpb/review/next-ballot', async (_request, response) => {
    const ballot = await store.getNextReviewBallot()

    if (ballot) {
      response.json(ballot)
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
  store,
  scanner,
  importer,
  app,
  log = console.log,
}: Partial<StartOptions> = {}): Promise<void> {
  store =
    store ?? (await Store.fileStore(path.join(__dirname, '..', 'ballots.db')))
  scanner = scanner ?? new FujitsuScanner()
  importer =
    importer ??
    new SystemImporter({
      store,
      scanner,
      ...makeTemporaryBallotImportImageDirectories().paths,
    })
  app = app ?? buildApp({ importer, store })
  await importer.restoreConfig()

  app.listen(port, () => {
    log(`Listening at http://localhost:${port}/`)

    if (importer instanceof SystemImporter) {
      log(`Scanning ballots into ${importer.scannedImagesPath}`)
    }
  })
}
