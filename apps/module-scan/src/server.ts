//
// Just the HTTP glue to the functionality, no implementations.
// All actual implementations are in importer.ts and scanner.ts
//

import { BallotType, Election, MarkThresholds } from '@votingworks/types'
import bodyParser from 'body-parser'
import express, { Application, RequestHandler } from 'express'
import { readFile } from 'fs-extra'
import multer from 'multer'
import * as path from 'path'
import { inspect } from 'util'
import backup from './backup'
import SystemImporter, { Importer } from './importer'
import { FujitsuScanner, Scanner, ScannerMode } from './scanner'
import Store, { ALLOWED_CONFIG_KEYS, ConfigKey } from './store'
import { BallotConfig, ElectionDefinition } from './types'
import { fromElection, validate } from './util/electionDefinition'
import { createWorkspace, Workspace } from './util/workspace'
import * as workers from './workers/combined'
import { childProcessPool, WorkerPool } from './workers/pool'

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

  app.use(bodyParser.urlencoded({ extended: false }))

  app.get('/config', async (_request, response) => {
    response.json({
      election: (await store.getElectionDefinition())?.election,
      testMode: await store.getTestMode(),
      markThresholdOverrides: await store.getMarkThresholdOverrides(),
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
            }
            break
          }

          case ConfigKey.TestMode: {
            if (typeof value !== 'boolean') {
              throw new TypeError()
            }
            await importer.setTestMode(value)
            break
          }

          case ConfigKey.MarkThresholdOverrides: {
            if (value === null) {
              await importer.setMarkThresholdOverrides(undefined)
              break
            }
            await importer.setMarkThresholdOverrides(value as MarkThresholds)
            break
          }

          case ConfigKey.SkipElectionHashCheck: {
            if (typeof value !== 'boolean') {
              throw new TypeError()
            }
            await importer.setSkipElectionHashCheck(value)
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

  app.post('/scan/scanContinue', async (request, response) => {
    try {
      await importer.continueImport(!!request.body.override)
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

    app.get('/scan/sheets/:sheetId?', async (request, response) => {
      const { sheetId }: { sheetId?: string } = request.params

      const sheets = await store.dbAllAsync<
        {
          id: string
          batchId: string
          frontInterpretationJSON: string
          backInterpretationJSON: string
          requiresAdjudication: boolean
          frontAdjudicationJSON: string
          backAdjudicationJSON: string
          deletedAt: string
        },
        [string] | []
      >(
        `
        select
          id,
          batch_id as batchId,
          front_interpretation_json as frontInterpretationJSON,
          back_interpretation_json as backInterpretationJSON,
          requires_adjudication as requiresAdjudication,
          front_adjudication_json as frontAdjudicationJSON,
          back_adjudication_json as backAdjudicationJSON,
          deleted_at as deletedAt
        from sheets
        ${sheetId ? `where id = ?` : ''}
        order by created_at desc
      `,
        ...(sheetId ? [sheetId] : [])
      )

      response.json(
        sheets.map((sheet) => ({
          id: sheet.id,
          batchId: sheet.batchId,
          frontInterpretation: JSON.parse(sheet.frontInterpretationJSON),
          backInterpretation: JSON.parse(sheet.backInterpretationJSON),
          requiresAdjudication: sheet.requiresAdjudication,
          frontAdjudication: JSON.parse(sheet.frontAdjudicationJSON),
          backAdjudication: JSON.parse(sheet.backAdjudicationJSON),
          deletedAt: sheet.deletedAt,
        }))
      )
    })
  }

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

  app.post('/scan/hmpb/doneTemplates', async (_request, response) => {
    await importer.doneHmpbTemplates()
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
    const sheet = await store.getNextAdjudicationSheet()

    if (sheet) {
      response.json(sheet)
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

  app.use(express.static(path.join(__dirname, '..', 'public')))
  app.get('/*', (request, response) => {
    const url = new URL(`http://${request.get('host')}${request.originalUrl}`)
    url.port = '3000'
    response.redirect(301, url.toString())
  })

  return app
}

export interface StartOptions {
  port: number | string
  scanner: Scanner
  importer: Importer
  app: Application
  log: typeof console.log
  workspace: Workspace
}

/**
 * Starts the server with all the default options.
 */
export async function start({
  port = process.env.PORT || 3002,
  scanner,
  importer,
  app,
  log = console.log,
  workspace,
}: Partial<StartOptions> = {}): Promise<void> {
  if (!workspace) {
    let workspacePath = process.env.MODULE_SCAN_WORKSPACE
    if (
      !workspacePath &&
      (!process.env.NODE_ENV || process.env.NODE_ENV === 'development')
    ) {
      workspacePath = path.join(__dirname, '../dev-workspace')
    }
    if (!workspacePath) {
      throw new Error(
        'workspace path could not be determined; pass a workspace or run with MODULE_SCAN_WORKSPACE'
      )
    }
    workspace = await createWorkspace(workspacePath)
  }

  scanner = scanner ?? new FujitsuScanner({ mode: ScannerMode.Gray })
  importer =
    importer ??
    new SystemImporter({
      workspace,
      scanner,
      workerPoolProvider: (): WorkerPool<workers.Input, workers.Output> =>
        childProcessPool(workers.workerPath, 2 /* front and back */),
    })
  app = app ?? buildApp({ importer, store: workspace.store })

  app.listen(port, () => {
    log(`Listening at http://localhost:${port}/`)

    if (importer instanceof SystemImporter) {
      log(`Scanning ballots into ${workspace?.ballotImagesPath}`)
    }
  })

  // NOTE: this appears to cause web requests to block until restoreConfig is done.
  // if restoreConfig ends up on a background thread, we'll want to explicitly
  // return a "status: notready" or something like it.
  //
  // but for now, this seems to be fine, the front-end just waits.
  await importer.restoreConfig()

  // cleanup incomplete batches from before
  await workspace.store.cleanupIncompleteBatches()
}
