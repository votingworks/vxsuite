//
// Just the HTTP glue to the functionality, no implementations.
// All actual implementations are in importer.ts and scanner.ts
//

import { createClient, DEFAULT_CONFIG } from '@votingworks/plustek-sdk'
import {
  BallotType,
  safeParse,
  safeParseElectionDefinition,
} from '@votingworks/types'
import {
  AddTemplatesRequest,
  AddTemplatesResponse,
  CalibrateRequest,
  CalibrateResponse,
  DeleteCurrentPrecinctConfigResponse,
  DeleteElectionConfigResponse,
  DeleteMarkThresholdOverridesConfigResponse,
  ExportRequest,
  ExportResponse,
  GetCurrentPrecinctConfigResponse,
  GetElectionConfigResponse,
  GetMarkThresholdOverridesConfigResponse,
  GetScanStatusResponse,
  GetTestModeConfigResponse,
  PatchElectionConfigRequest,
  PatchElectionConfigResponse,
  PatchMarkThresholdOverridesConfigRequest,
  PatchMarkThresholdOverridesConfigRequestSchema,
  PatchMarkThresholdOverridesConfigResponse,
  PatchSkipElectionHashCheckConfigRequest,
  PatchSkipElectionHashCheckConfigRequestSchema,
  PatchSkipElectionHashCheckConfigResponse,
  PatchTestModeConfigRequest,
  PatchTestModeConfigRequestSchema,
  PatchTestModeConfigResponse,
  PutCurrentPrecinctConfigRequest,
  PutCurrentPrecinctConfigRequestSchema,
  PutCurrentPrecinctConfigResponse,
  ScanBatchRequest,
  ScanBatchResponse,
  ScanContinueRequest,
  ScanContinueRequestSchema,
  ScanContinueResponse,
  ZeroRequest,
  ZeroResponse,
} from '@votingworks/types/api/module-scan'
import bodyParser from 'body-parser'
import express, { Application } from 'express'
import { readFile } from 'fs-extra'
import multer from 'multer'
import backup from './backup'
import {
  MODULE_SCAN_ALWAYS_HOLD_ON_REJECT,
  MODULE_SCAN_PORT,
  MODULE_SCAN_WORKSPACE,
  VX_MACHINE_TYPE,
} from './globals'
import Importer from './importer'
import {
  FujitsuScanner,
  PlustekScanner,
  Scanner,
  ScannerClientProvider,
  ScannerMode,
  withReconnect,
} from './scanners'
import Store from './store'
import { BallotConfig } from './types'
import { createWorkspace, Workspace } from './util/workspace'
import * as workers from './workers/combined'
import { childProcessPool, WorkerPool } from './workers/pool'

type NoParams = never

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

  app.use(bodyParser.raw())
  app.use(express.json({ limit: '5mb', type: 'application/json' }))
  app.use(bodyParser.urlencoded({ extended: false }))

  app.get<NoParams, GetElectionConfigResponse>(
    '/config/election',
    async (request, response) => {
      const electionDefinition = await store.getElectionDefinition()

      if (request.accepts('application/octet-stream')) {
        if (electionDefinition) {
          response
            .header('content-type', 'application/octet-stream')
            .send(electionDefinition.electionData)
        } else {
          response.status(404).end()
        }
      } else {
        response.json(electionDefinition ?? null)
      }
    }
  )

  app.patch<NoParams, PatchElectionConfigResponse, PatchElectionConfigRequest>(
    '/config/election',
    async (request, response) => {
      const { body } = request

      if (!Buffer.isBuffer(body)) {
        response.status(400).json({
          status: 'error',
          errors: [
            {
              type: 'invalid-value',
              message: `expected content type to be application/octet-stream, got ${request.header(
                'content-type'
              )}`,
            },
          ],
        })
        return
      }

      const bodyParseResult = safeParseElectionDefinition(
        new TextDecoder('utf-8', { fatal: false }).decode(body)
      )

      if (bodyParseResult.isErr()) {
        const error = bodyParseResult.err()
        response.status(400).json({
          status: 'error',
          errors: [
            {
              type: error.name,
              message: error.message,
            },
          ],
        })
        return
      }

      await importer.configure(bodyParseResult.ok())
      response.json({ status: 'ok' })
    }
  )

  app.delete<NoParams, DeleteElectionConfigResponse>(
    '/config/election',
    async (_request, response) => {
      await importer.unconfigure()
      response.json({ status: 'ok' })
    }
  )

  app.get<NoParams, GetTestModeConfigResponse>(
    '/config/testMode',
    async (_request, response) => {
      const testMode = await store.getTestMode()
      response.json({ testMode, status: 'ok' })
    }
  )

  app.patch<NoParams, PatchTestModeConfigResponse, PatchTestModeConfigRequest>(
    '/config/testMode',
    async (request, response) => {
      const bodyParseResult = safeParse(
        PatchTestModeConfigRequestSchema,
        request.body
      )

      if (bodyParseResult.isErr()) {
        const error = bodyParseResult.err()
        response.status(400).json({
          status: 'error',
          errors: [{ type: error.name, message: error.message }],
        })
        return
      }

      await importer.setTestMode(bodyParseResult.ok().testMode)
      response.json({ status: 'ok' })
    }
  )

  app.get<NoParams, GetCurrentPrecinctConfigResponse>(
    '/config/precinct',
    async (_request, response) => {
      const precinctId = await store.getCurrentPrecinctId()
      response.json({ precinctId, status: 'ok' })
    }
  )

  app.put<
    NoParams,
    PutCurrentPrecinctConfigResponse,
    PutCurrentPrecinctConfigRequest
  >('/config/precinct', async (request, response) => {
    const bodyParseResult = safeParse(
      PutCurrentPrecinctConfigRequestSchema,
      request.body
    )

    if (bodyParseResult.isErr()) {
      const error = bodyParseResult.err()
      response.status(400).json({
        status: 'error',
        errors: [{ type: error.name, message: error.message }],
      })
      return
    }

    await store.setCurrentPrecinctId(bodyParseResult.ok().precinctId)
    response.json({ status: 'ok' })
  })

  app.delete<NoParams, DeleteCurrentPrecinctConfigResponse>(
    '/config/precinct',
    async (_request, response) => {
      await store.setCurrentPrecinctId(undefined)
      response.json({ status: 'ok' })
    }
  )

  app.get<NoParams, GetMarkThresholdOverridesConfigResponse>(
    '/config/markThresholdOverrides',
    async (_request, response) => {
      const markThresholdOverrides = await store.getMarkThresholdOverrides()
      response.json({ markThresholdOverrides, status: 'ok' })
    }
  )

  app.delete<NoParams, DeleteMarkThresholdOverridesConfigResponse>(
    '/config/markThresholdOverrides',
    async (_request, response) => {
      await importer.setMarkThresholdOverrides(undefined)
      response.json({ status: 'ok' })
    }
  )

  app.patch<
    NoParams,
    PatchMarkThresholdOverridesConfigResponse,
    PatchMarkThresholdOverridesConfigRequest
  >('/config/markThresholdOverrides', async (request, response) => {
    const bodyParseResult = safeParse(
      PatchMarkThresholdOverridesConfigRequestSchema,
      request.body
    )

    if (bodyParseResult.isErr()) {
      const error = bodyParseResult.err()
      response.status(400).json({
        status: 'error',
        errors: [{ type: error.name, message: error.message }],
      })
      return
    }

    await importer.setMarkThresholdOverrides(
      bodyParseResult.ok().markThresholdOverrides
    )
    response.json({ status: 'ok' })
  })

  app.patch<
    NoParams,
    PatchSkipElectionHashCheckConfigResponse,
    PatchSkipElectionHashCheckConfigRequest
  >('/config/skipElectionHashCheck', async (request, response) => {
    const bodyParseResult = safeParse(
      PatchSkipElectionHashCheckConfigRequestSchema,
      request.body
    )

    if (bodyParseResult.isErr()) {
      const error = bodyParseResult.err()
      response.status(400).json({
        status: 'error',
        errors: [{ type: error.name, message: error.message }],
      })
      return
    }

    await importer.setSkipElectionHashCheck(
      bodyParseResult.ok().skipElectionHashCheck
    )
    response.json({ status: 'ok' })
  })

  app.post<NoParams, ScanBatchResponse, ScanBatchRequest>(
    '/scan/scanBatch',
    async (_request, response) => {
      try {
        const batchId = await importer.startImport()
        response.json({ batchId, status: 'ok' })
      } catch (err) {
        response.json({
          status: 'error',
          errors: [{ type: 'scan-error', message: err.message }],
        })
      }
    }
  )

  app.post<NoParams, ScanContinueResponse, ScanContinueRequest>(
    '/scan/scanContinue',
    async (request, response) => {
      const bodyParseResult = safeParse(ScanContinueRequestSchema, request.body)

      if (bodyParseResult.isErr()) {
        const error = bodyParseResult.err()
        response.status(400).json({
          status: 'error',
          errors: [{ type: error.name, message: error.message }],
        })
      }

      try {
        await importer.continueImport(!!bodyParseResult.ok()?.override)
        response.json({ status: 'ok' })
      } catch (error) {
        response.json({
          status: 'error',
          errors: [{ type: 'scan-error', message: error.message }],
        })
      }
    }
  )

  app.post<NoParams, AddTemplatesResponse, AddTemplatesRequest>(
    '/scan/hmpb/addTemplates',
    upload.fields([{ name: 'ballots' }, { name: 'metadatas' }]),
    async (request, response) => {
      /* istanbul ignore next */
      if (Array.isArray(request.files)) {
        response.status(400).json({
          status: 'error',
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

        for (let i = 0; i < ballots.length; i += 1) {
          const ballotFile = ballots[i]
          const metadataFile = metadatas[i]

          if (ballotFile?.mimetype !== 'application/pdf') {
            response.status(400).json({
              status: 'error',
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
              status: 'error',
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
        response.status(500).json({
          status: 'error',
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

  app.post<NoParams, ExportResponse, ExportRequest>(
    '/scan/export',
    async (_request, response) => {
      const cvrs = await importer.doExport()
      response.set('Content-Type', 'text/plain; charset=utf-8')
      response.send(cvrs)
    }
  )

  app.get<NoParams, GetScanStatusResponse>(
    '/scan/status',
    async (_request, response) => {
      const status = await importer.getStatus()
      response.json(status)
    }
  )

  app.post<NoParams, CalibrateResponse, CalibrateRequest>(
    '/scan/calibrate',
    async (_request, response) => {
      const success = await importer.doCalibrate()
      response.json(
        success
          ? {
              status: 'ok',
            }
          : {
              status: 'error',
              errors: [
                {
                  type: 'calibration-error',
                  message: 'scanner could not be calibrated',
                },
              ],
            }
      )
    }
  )

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
        response.sendFile(filenames[version])
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

  app.get('/scan/hmpb/review/next-sheet', async (_request, response) => {
    const sheet = await store.getNextAdjudicationSheet()

    if (sheet) {
      response.json(sheet)
    } else {
      response.status(404).end()
    }
  })

  app.post<NoParams, ZeroResponse, ZeroRequest>(
    '/scan/zero',
    async (_request, response) => {
      await importer.doZero()
      response.json({ status: 'ok' })
    }
  )

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
  log(message: string): void
  workspace: Workspace
  machineType: 'bsd' | 'precinct-scanner'
}

/**
 * Starts the server with all the default options.
 */
export async function start({
  port = MODULE_SCAN_PORT,
  scanner,
  importer,
  app,
  log = (message: string) =>
    process.stdout.write(message.endsWith('\n') ? message : `${message}\n`),
  workspace,
  machineType = VX_MACHINE_TYPE,
}: Partial<StartOptions> = {}): Promise<void> {
  let resolvedWorkspace: Workspace

  if (workspace) {
    resolvedWorkspace = workspace
  } else {
    const workspacePath = MODULE_SCAN_WORKSPACE
    if (!workspacePath) {
      throw new Error(
        'workspace path could not be determined; pass a workspace or run with MODULE_SCAN_WORKSPACE'
      )
    }
    resolvedWorkspace = await createWorkspace(workspacePath)
  }

  const usingPrecinctScanner = machineType === 'precinct-scanner'
  let plustekScannerClientProvider: ScannerClientProvider | undefined

  let resolvedScanner: Scanner

  if (scanner) {
    resolvedScanner = scanner
  } else {
    plustekScannerClientProvider = withReconnect({
      get: () =>
        createClient({
          ...DEFAULT_CONFIG,
          savepath: resolvedWorkspace.ballotImagesPath,
        }),
    })

    resolvedScanner = usingPrecinctScanner
      ? new PlustekScanner(
          plustekScannerClientProvider,
          MODULE_SCAN_ALWAYS_HOLD_ON_REJECT
        )
      : new FujitsuScanner({ mode: ScannerMode.Gray })
  }
  let workerPool: WorkerPool<workers.Input, workers.Output> | undefined
  const workerPoolProvider = (): WorkerPool<workers.Input, workers.Output> => {
    workerPool ??= childProcessPool(workers.workerPath, 2 /* front and back */)
    return workerPool
  }
  const resolvedImporter =
    importer ??
    new Importer({
      workerPoolProvider,
      workspace: resolvedWorkspace,
      scanner: resolvedScanner,
    })
  const resolvedApp =
    app ??
    buildApp({ importer: resolvedImporter, store: resolvedWorkspace.store })

  resolvedApp.listen(port, () => {
    log(`Listening at http://localhost:${port}/`)

    if (importer instanceof Importer) {
      log(`Scanning ballots into ${workspace?.ballotImagesPath}`)
    }
  })

  // NOTE: this appears to cause web requests to block until restoreConfig is done.
  // if restoreConfig ends up on a background thread, we'll want to explicitly
  // return a "status: notready" or something like it.
  //
  // but for now, this seems to be fine, the front-end just waits.
  await resolvedImporter.restoreConfig()

  // cleanup incomplete batches from before
  await resolvedWorkspace.store.cleanupIncompleteBatches()

  if (usingPrecinctScanner && plustekScannerClientProvider) {
    if (
      (
        await (await plustekScannerClientProvider.get())
          .ok()
          ?.reject({ hold: true })
      )?.isOk()
    ) {
      log('Rejected sheet from the scanner on startup')
    }
  }
}
