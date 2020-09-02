//
// Just the HTTP glue to the functionality, no implementations.
// All actual implementations are in importer.ts and scanner.ts
//

import { BallotType, Election } from '@votingworks/ballot-encoder'
import express, { Application, RequestHandler } from 'express'
import { readFile } from 'fs-extra'
import multer from 'multer'
import * as path from 'path'
import { inspect } from 'util'
import backup from './backup'
import SystemImporter, { Importer } from './importer'
import { FujitsuScanner, Scanner } from './scanner'
import Store, { ALLOWED_CONFIG_KEYS, ConfigKey } from './store'
import { BallotConfig, ElectionDefinition } from './types'
import { fromElection, validate } from './util/electionDefinition'
import makeTemporaryBallotImportImageDirectories from './util/makeTemporaryBallotImportImageDirectories'

export interface AppOptions {
  store: Store
  importer: Importer
}

// these data structures live here until we can refactor the code
// to be more sheet-oriented and then place them where they belong.
interface ImageInfo {
  url: string
}

interface BallotPageInfo {
  image: ImageInfo
}

interface BallotSheetInfo {
  front: BallotPageInfo
  back: BallotPageInfo
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
      election: (await store.getElectionDefinition())?.election,
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
              const electionConfig = value as Election | ElectionDefinition
              const electionDefinition =
                'election' in electionConfig
                  ? electionConfig
                  : fromElection(electionConfig)
              const errors = [...validate(electionDefinition)]

              if (errors.length > 0) {
                response.status(400).json({
                  errors: errors.map((error) => ({
                    type: error.type,
                    message: `there was an error with the election definition: ${inspect(
                      error
                    )}`,
                  })),
                })
                return
              }

              await importer.configure(electionDefinition)
              await store.setElection(electionDefinition)
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
      const batchId = await importer.startImport()
      response.json({ status: 'ok', batchId })
    } catch (err) {
      response.json({ status: `could not scan: ${err.message}` })
    }
  })

  app.post('/scan/scanContinue', async (_request, response) => {
    try {
      await importer.continueImport()
      response.json({ status: 'ok' })
    } catch (err) {
      response.json({ status: `could not continue scan: ${err.message}` })
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

        if (files.length % 2 === 1) {
          response.status(400).json({
            errors: [
              {
                type: 'invalid-page-count',
                message: `expected an even number of pages for two per sheet, got ${files.length}`,
              },
            ],
          })
          return
        } else if (files.length > 0) {
          const batchId = await store.addBatch()
          let i = 0

          try {
            for (; i < files.length; i += 2) {
              const front = files[i].path
              const back = files[i + 1].path

              await importer.importFile(batchId, front, back)
            }
          } catch (error) {
            response.status(400).json([
              {
                type: 'import-error',
                sheet: [files[i].originalname, files[i + 1].originalname],
                message: error.message,
              },
            ])
            return
          } finally {
            await store.finishBatch({ batchId })
          }
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
            electionHash: '',
            ballotType: BallotType.Standard,
            ballotStyleId: metadata.ballotStyleId,
            precinctId: metadata.precinctId,
            isTestMode: !metadata.isLiveMode,
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

  app.get('/scan/hmpb/ballot/:sheetId/:side', async (request, response) => {
    const { sheetId, side } = request.params

    if (typeof sheetId !== 'string' || (side !== 'front' && side !== 'back')) {
      response.status(404)
      return
    }

    const ballot = await store.getPage(sheetId, side)

    if (ballot) {
      response.json(ballot)
    } else {
      response.status(404).end()
    }
  })

  app.patch('/scan/hmpb/ballot/:sheetId/:side', async (request, response) => {
    const { sheetId, side } = request.params

    if (typeof sheetId !== 'string' || (side !== 'front' && side !== 'back')) {
      response.status(404)
      return
    }

    await store.saveBallotAdjudication(sheetId, side, request.body)
    response.json({ status: 'ok' })
  })

  app.get(
    '/scan/hmpb/ballot/:sheetId/:side/image',
    async (request, response) => {
      const { sheetId, side } = request.params

      if (
        typeof sheetId !== 'string' ||
        (side !== 'front' && side !== 'back')
      ) {
        response.status(404)
        return
      }

      response.redirect(
        301,
        `/scan/hmpb/ballot/${sheetId}/${side}/image/normalized`
      )
    }
  )

  app.get(
    '/scan/hmpb/ballot/:sheetId/:side/image/:version',
    async (request, response) => {
      const { sheetId, side, version } = request.params

      if (
        typeof sheetId !== 'string' ||
        (side !== 'front' && side !== 'back') ||
        (version !== 'original' && version !== 'normalized')
      ) {
        response.status(404)
        return
      }
      const filenames = await store.getBallotFilenames(sheetId, side)

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

  app.get('/scan/hmpb/review/next-sheet', async (_request, response) => {
    const ballot = await store.getNextReviewBallot()

    if (ballot) {
      const sheetInfo: BallotSheetInfo = {
        front: {
          image: {
            url: `/scan/hmpb/ballot/${ballot.ballot.id}/front/image/normalized`,
          },
        },
        back: {
          image: {
            url: `/scan/hmpb/ballot/${ballot.ballot.id}/back/image/normalized`,
          },
        },
      }

      response.json(sheetInfo)
    } else {
      response.status(404).end()
    }
  })

  app.post('/scan/zero', async (_request, response) => {
    await importer.doZero()
    response.json({ status: 'ok' })
  })

  app.get('/scan/backup', async (_request, response) => {
    const electionDefinition = await store.getElectionDefinition()

    if (!electionDefinition) {
      response.status(500).json({
        errors: [
          {
            type: 'unconfigured',
            message: 'cannot backup an unconfigured server',
          },
        ],
      })
      return
    }

    response
      .header('Content-Type', 'application/zip')
      .header(
        'Content-Disposition',
        `attachment; filename="election-${electionDefinition.electionHash.slice(
          0,
          10
        )}-${new Date()
          .toISOString()
          .replace(/[^-a-z0-9]+/gi, '-')}-backup.zip"`
      )
      .flushHeaders()

    backup(store)
      .on('error', (error: Error) => {
        response.status(500).json({
          errors: [
            {
              type: 'error',
              message: error.toString(),
            },
          ],
        })
      })
      .pipe(response)
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

  // cleanup incomplete batches from before
  await store.cleanupIncompleteBatches()

  app.listen(port, () => {
    log(`Listening at http://localhost:${port}/`)

    if (importer instanceof SystemImporter) {
      log(`Scanning ballots into ${importer.scannedImagesPath}`)
    }
  })
}
