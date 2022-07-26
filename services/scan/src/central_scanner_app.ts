import { Scan } from '@votingworks/api';
import express, { Application } from 'express';
import multer from 'multer';
import { Buffer } from 'buffer';
import {
  safeParseElectionDefinition,
  safeParse,
  safeParseJson,
  BallotPageLayoutSchema,
  BallotPageLayout,
} from '@votingworks/types';
import { assert, readBallotPackageFromBuffer } from '@votingworks/utils';
import makeDebug from 'debug';
import { readFile } from 'fs-extra';
import { z } from 'zod';
import { Store } from './store';
import { Importer } from './importer';
import { backup } from './backup';

const debug = makeDebug('scan:central-scanner');

type NoParams = never;

export interface AppOptions {
  store: Store;
  importer: Importer;
}

/**
 * Builds an express application, using `store` and `importer` to do the heavy
 * lifting.
 */
export async function buildCentralScannerApp({
  store,
  importer,
}: AppOptions): Promise<Application> {
  const app: Application = express();
  const upload = multer({ storage: multer.diskStorage({}) });

  app.use(express.raw());
  app.use(express.json({ limit: '5mb', type: 'application/json' }));
  app.use(express.urlencoded({ extended: false }));

  app.get<NoParams, Scan.GetElectionConfigResponse>(
    '/config/election',
    (request, response) => {
      const electionDefinition = store.getElectionDefinition();

      if (request.accepts('application/octet-stream')) {
        if (electionDefinition) {
          response
            .header('content-type', 'application/octet-stream')
            .send(electionDefinition.electionData);
        } else {
          response.status(404).end();
        }
      } else {
        response.json(electionDefinition ?? null);
      }
    }
  );

  app.patch<
    NoParams,
    Scan.PatchElectionConfigResponse,
    Scan.PatchElectionConfigRequest
  >('/config/election', (request, response) => {
    const { body } = request;

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
      });
      return;
    }

    const bodyParseResult = safeParseElectionDefinition(
      new TextDecoder('utf-8', { fatal: false }).decode(body)
    );

    if (bodyParseResult.isErr()) {
      const error = bodyParseResult.err();
      response.status(400).json({
        status: 'error',
        errors: [
          {
            type: error.name,
            message: error.message,
          },
        ],
      });
      return;
    }

    importer.configure(bodyParseResult.ok());
    response.json({ status: 'ok' });
  });

  app.delete<NoParams, Scan.DeleteElectionConfigResponse>(
    '/config/election',
    async (_request, response) => {
      if (!store.getCanUnconfigure()) {
        response.status(400).json({
          status: 'error',
          errors: [
            {
              type: 'no-backup',
              message:
                'cannot unconfigure an election that has not been backed up',
            },
          ],
        });
        return;
      }

      await importer.unconfigure();
      response.json({ status: 'ok' });
    }
  );

  app.put<
    '/config/package',
    NoParams,
    Scan.PutConfigPackageResponse,
    Scan.PutConfigPackageRequest
  >(
    '/config/package',
    upload.fields([{ name: 'package', maxCount: 1 }]),
    async (request, response) => {
      const file = !Array.isArray(request.files)
        ? request.files?.['package']?.[0]
        : undefined;

      if (!file) {
        response.status(400).json({
          status: 'error',
          errors: [
            {
              type: 'invalid-value',
              message: 'expected file field to be named "package"',
            },
          ],
        });
        return;
      }

      const pkg = await readBallotPackageFromBuffer(await readFile(file.path));

      importer.configure(pkg.electionDefinition);
      for (const { pdf, layout } of pkg.ballots) {
        await importer.addHmpbTemplates(pdf, layout);
      }

      response.json({ status: 'ok' });
    }
  );

  app.get<NoParams, Scan.GetTestModeConfigResponse>(
    '/config/testMode',
    (_request, response) => {
      const testMode = store.getTestMode();
      response.json({ status: 'ok', testMode });
    }
  );

  app.patch<
    NoParams,
    Scan.PatchTestModeConfigResponse,
    Scan.PatchTestModeConfigRequest
  >('/config/testMode', async (request, response) => {
    const bodyParseResult = safeParse(
      Scan.PatchTestModeConfigRequestSchema,
      request.body
    );

    if (bodyParseResult.isErr()) {
      const error = bodyParseResult.err();
      response.status(400).json({
        status: 'error',
        errors: [{ type: error.name, message: error.message }],
      });
      return;
    }

    await importer.setTestMode(bodyParseResult.ok().testMode);
    response.json({ status: 'ok' });
  });

  app.get<NoParams, Scan.GetCurrentPrecinctConfigResponse>(
    '/config/precinct',
    (_request, response) => {
      const precinctId = store.getCurrentPrecinctId();
      response.json({ status: 'ok', precinctId });
    }
  );

  app.put<
    NoParams,
    Scan.PutCurrentPrecinctConfigResponse,
    Scan.PutCurrentPrecinctConfigRequest
  >('/config/precinct', (request, response) => {
    const bodyParseResult = safeParse(
      Scan.PutCurrentPrecinctConfigRequestSchema,
      request.body
    );

    if (bodyParseResult.isErr()) {
      const error = bodyParseResult.err();
      response.status(400).json({
        status: 'error',
        errors: [{ type: error.name, message: error.message }],
      });
      return;
    }

    store.setCurrentPrecinctId(bodyParseResult.ok().precinctId);
    response.json({ status: 'ok' });
  });

  app.delete<NoParams, Scan.DeleteCurrentPrecinctConfigResponse>(
    '/config/precinct',
    (_request, response) => {
      store.setCurrentPrecinctId(undefined);
      response.json({ status: 'ok' });
    }
  );

  app.get<NoParams, Scan.GetMarkThresholdOverridesConfigResponse>(
    '/config/markThresholdOverrides',
    (_request, response) => {
      const markThresholdOverrides = store.getMarkThresholdOverrides();
      response.json({ status: 'ok', markThresholdOverrides });
    }
  );

  app.delete<NoParams, Scan.DeleteMarkThresholdOverridesConfigResponse>(
    '/config/markThresholdOverrides',
    async (_request, response) => {
      await importer.setMarkThresholdOverrides(undefined);
      response.json({ status: 'ok' });
    }
  );

  app.patch<
    NoParams,
    Scan.PatchMarkThresholdOverridesConfigResponse,
    Scan.PatchMarkThresholdOverridesConfigRequest
  >('/config/markThresholdOverrides', async (request, response) => {
    const bodyParseResult = safeParse(
      Scan.PatchMarkThresholdOverridesConfigRequestSchema,
      request.body
    );

    if (bodyParseResult.isErr()) {
      const error = bodyParseResult.err();
      response.status(400).json({
        status: 'error',
        errors: [{ type: error.name, message: error.message }],
      });
      return;
    }

    await importer.setMarkThresholdOverrides(
      bodyParseResult.ok().markThresholdOverrides
    );
    response.json({ status: 'ok' });
  });

  app.patch<
    NoParams,
    Scan.PatchSkipElectionHashCheckConfigResponse,
    Scan.PatchSkipElectionHashCheckConfigRequest
  >('/config/skipElectionHashCheck', (request, response) => {
    const bodyParseResult = safeParse(
      Scan.PatchSkipElectionHashCheckConfigRequestSchema,
      request.body
    );

    if (bodyParseResult.isErr()) {
      const error = bodyParseResult.err();
      response.status(400).json({
        status: 'error',
        errors: [{ type: error.name, message: error.message }],
      });
      return;
    }

    importer.setSkipElectionHashCheck(
      bodyParseResult.ok().skipElectionHashCheck
    );
    response.json({ status: 'ok' });
  });

  app.post<NoParams, Scan.ScanBatchResponse, Scan.ScanBatchRequest>(
    '/scan/scanBatch',
    async (_request, response) => {
      try {
        const batchId = await importer.startImport();
        response.json({ status: 'ok', batchId });
      } catch (err) {
        assert(err instanceof Error);
        response.json({
          status: 'error',
          errors: [{ type: 'scan-error', message: err.message }],
        });
      }
    }
  );

  app.post<NoParams, Scan.ScanContinueResponse, Scan.ScanContinueRequest>(
    '/scan/scanContinue',
    async (request, response) => {
      const bodyParseResult = safeParse(
        Scan.ScanContinueRequestSchema,
        request.body
      );

      if (bodyParseResult.isErr()) {
        const error = bodyParseResult.err();
        response.status(400).json({
          status: 'error',
          errors: [{ type: error.name, message: error.message }],
        });
        return;
      }

      try {
        const continueImportOptions = bodyParseResult.ok();
        // NOTE: This is a little silly and TS should be able to reason this out, but no.
        if (continueImportOptions.forceAccept) {
          await importer.continueImport(continueImportOptions);
        } else {
          await importer.continueImport(continueImportOptions);
        }
        response.json({ status: 'ok' });
      } catch (error) {
        assert(error instanceof Error);
        response.json({
          status: 'error',
          errors: [{ type: 'scan-error', message: error.message }],
        });
      }
    }
  );

  app.post<NoParams, Scan.AddTemplatesResponse, Scan.AddTemplatesRequest>(
    '/scan/hmpb/addTemplates',
    upload.fields([
      { name: 'ballots' },
      { name: 'metadatas' },
      { name: 'layouts' },
    ]),
    async (request, response) => {
      /* istanbul ignore next */
      if (Array.isArray(request.files) || request.files === undefined) {
        response.status(400).json({
          status: 'error',
          errors: [
            {
              type: 'missing-ballot-files',
              message: `expected ballot files in "ballots", "metadatas", and "layouts" fields, but no files were found`,
            },
          ],
        });
        return;
      }

      try {
        const { ballots = [], metadatas = [], layouts = [] } = request.files;

        if (ballots.length === 0) {
          response.status(400).json({
            status: 'error',
            errors: [
              {
                type: 'missing-ballot-files',
                message: `expected ballot files in "ballots", "metadatas", and "layouts" fields, but no files were found`,
              },
            ],
          });
          return;
        }

        const electionDefinition = store.getElectionDefinition();
        assert(electionDefinition);

        for (let i = 0; i < ballots.length; i += 1) {
          const ballotFile = ballots[i];
          const metadataFile = metadatas[i];
          const layoutFile = layouts[i];

          if (ballotFile?.mimetype !== 'application/pdf') {
            response.status(400).json({
              status: 'error',
              errors: [
                {
                  type: 'invalid-ballot-type',
                  message: `expected ballot files to be application/pdf, but got ${ballotFile?.mimetype}`,
                },
              ],
            });
            return;
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
            });
            return;
          }

          if (layoutFile.mimetype !== 'application/json') {
            response.status(400).json({
              status: 'error',
              errors: [
                {
                  type: 'invalid-layout-type',
                  message: `expected ballot layout to be application/json, but got ${layoutFile?.mimetype}`,
                },
              ],
            });
            return;
          }

          const layout = safeParseJson(
            await readFile(layoutFile.path, 'utf8'),
            z.array(BallotPageLayoutSchema)
          ).unsafeUnwrap();

          await importer.addHmpbTemplates(
            await readFile(ballotFile.path),
            layout
          );
        }

        response.json({ status: 'ok' });
      } catch (error) {
        assert(error instanceof Error);
        debug('error adding templates: %s', error.stack);
        response.status(500).json({
          status: 'error',
          errors: [
            {
              type: 'internal-server-error',
              message: error.message,
            },
          ],
        });
      }
    }
  );

  app.post('/scan/hmpb/doneTemplates', async (_request, response) => {
    await importer.doneHmpbTemplates();
    response.json({ status: 'ok' });
  });

  app.post<NoParams, Scan.ExportResponse, Scan.ExportRequest>(
    '/scan/export',
    (_request, response) => {
      const cvrs = importer.doExport();
      store.setCvrsAsBackedUp();
      response.set('Content-Type', 'text/plain; charset=utf-8');
      response.send(cvrs);
    }
  );

  app.get<NoParams, Scan.GetScanStatusResponse>(
    '/scan/status',
    async (_request, response) => {
      const status = await importer.getStatus();
      response.json(status);
    }
  );

  app.post<NoParams, Scan.CalibrateResponse, Scan.CalibrateRequest>(
    '/scan/calibrate',
    async (_request, response) => {
      const success = await importer.doCalibrate();
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
      );
    }
  );

  app.get('/scan/hmpb/ballot/:sheetId/:side/image', (request, response) => {
    const { sheetId, side } = request.params;

    if (typeof sheetId !== 'string' || (side !== 'front' && side !== 'back')) {
      response.status(404);
      return;
    }

    response.redirect(
      301,
      `/scan/hmpb/ballot/${sheetId}/${side}/image/normalized`
    );
  });

  app.get(
    '/scan/hmpb/ballot/:sheetId/:side/image/:version',
    (request, response) => {
      const { sheetId, side, version } = request.params;

      if (
        typeof sheetId !== 'string' ||
        (side !== 'front' && side !== 'back') ||
        (version !== 'original' && version !== 'normalized')
      ) {
        response.status(404);
        return;
      }
      const filenames = store.getBallotFilenames(sheetId, side);

      if (filenames && version in filenames) {
        response.sendFile(filenames[version]);
      } else {
        response.status(404).end();
      }
    }
  );

  app.delete('/scan/batch/:batchId', (request, response) => {
    if (store.deleteBatch(request.params.batchId)) {
      response.json({ status: 'ok' });
    } else {
      response.status(404).end();
    }
  });

  app.get<NoParams, Scan.GetNextReviewSheetResponse>(
    '/scan/hmpb/review/next-sheet',
    (_request, response) => {
      const sheet = store.getNextAdjudicationSheet();

      if (sheet) {
        let frontLayout: BallotPageLayout | undefined;
        let backLayout: BallotPageLayout | undefined;
        let frontDefinition:
          | Scan.GetNextReviewSheetResponse['definitions']['front']
          | undefined;
        let backDefinition:
          | Scan.GetNextReviewSheetResponse['definitions']['back']
          | undefined;

        if (sheet.front.interpretation.type === 'InterpretedHmpbPage') {
          const front = sheet.front.interpretation;
          const layouts = store.getBallotLayoutsForMetadata(front.metadata);
          const contestIds = store.getContestIdsForMetadata(front.metadata);
          frontLayout = layouts.find(
            ({ metadata }) => metadata.pageNumber === front.metadata.pageNumber
          );
          frontDefinition = { contestIds };
        }

        if (sheet.back.interpretation.type === 'InterpretedHmpbPage') {
          const back = sheet.back.interpretation;
          const layouts = store.getBallotLayoutsForMetadata(back.metadata);
          const contestIds = store.getContestIdsForMetadata(back.metadata);
          backLayout = layouts.find(
            ({ metadata }) => metadata.pageNumber === back.metadata.pageNumber
          );
          backDefinition = { contestIds };
        }

        response.json({
          interpreted: sheet,
          layouts: {
            front: frontLayout,
            back: backLayout,
          },
          definitions: {
            front: frontDefinition,
            back: backDefinition,
          },
        });
      } else {
        response.status(404).end();
      }
    }
  );

  app.post<NoParams, Scan.ZeroResponse, Scan.ZeroRequest>(
    '/scan/zero',
    async (_request, response) => {
      if (!store.getCanUnconfigure()) {
        response.status(400).json({
          status: 'error',
          errors: [
            {
              type: 'no-backup',
              message:
                'cannot unconfigure an election that has not been backed up',
            },
          ],
        });
        return;
      }

      await importer.doZero();
      response.json({ status: 'ok' });
    }
  );

  app.get('/scan/backup', (_request, response) => {
    const electionDefinition = store.getElectionDefinition();

    if (!electionDefinition) {
      response.status(500).json({
        errors: [
          {
            type: 'unconfigured',
            message: 'cannot backup an unconfigured server',
          },
        ],
      });
      return;
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
      .flushHeaders();

    backup(store)
      .on('error', (error: Error) => {
        debug('backup error: %s', error.stack);
        response.status(500).json({
          errors: [
            {
              type: 'error',
              message: error.toString(),
            },
          ],
        });
      })
      .on('end', () => {
        store.setScannerAsBackedUp();
      })
      .pipe(response);
  });

  app.get('/*', (request, response) => {
    const url = new URL(`http://${request.get('host')}${request.originalUrl}`);
    url.port = '3000';
    response.redirect(301, url.toString());
  });

  // NOTE: this appears to cause web requests to block until restoreConfig is done.
  // if restoreConfig ends up on a background thread, we'll want to explicitly
  // return a "status: notready" or something like it.
  //
  // but for now, this seems to be fine, the front-end just waits.
  await importer.restoreConfig();

  return app;
}
