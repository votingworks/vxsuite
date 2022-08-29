import { OkResponse, Scan } from '@votingworks/api';
import * as streams from 'memory-streams';
import { Buffer } from 'buffer';
import {
  BallotPageLayoutSchema,
  BallotPageLayoutWithImage,
  safeParse,
  safeParseElectionDefinition,
  safeParseJson,
} from '@votingworks/types';
import { assert, find } from '@votingworks/utils';
import express, { Application } from 'express';
import { readFile } from 'fs-extra';
import multer from 'multer';
import { z } from 'zod';
import { interpretTemplate } from '@votingworks/ballot-interpreter-vx';
import { PrecinctScannerStateMachine } from './precinct_scanner_state_machine';
import { pdfToImages } from './util/pdf_to_images';
import { Workspace } from './util/workspace';
import { backup } from './backup';
import { PrecinctScannerInterpreter } from './precinct_scanner_interpreter';
import { Store } from './store';

function sum(nums: number[]) {
  return nums.reduce((a, b) => a + b, 0);
}

type NoParams = never;

/**
 * Loads ballot layouts from the {@link Store} to be used by the interpreter.
 * The results may be cached and used again as long as the underlying HMPB
 * templates are not modified.
 */
async function loadLayouts(
  store: Store
): Promise<BallotPageLayoutWithImage[] | undefined> {
  const electionDefinition = store.getElectionDefinition();
  if (!electionDefinition) return;

  const templates = store.getHmpbTemplates();
  const loadedLayouts: BallotPageLayoutWithImage[] = [];

  for (const [pdf, layouts] of templates) {
    for await (const { page, pageNumber } of pdfToImages(pdf, { scale: 2 })) {
      const ballotPageLayout = layouts[pageNumber - 1];
      loadedLayouts.push(
        await interpretTemplate({
          electionDefinition,
          imageData: page,
          metadata: ballotPageLayout.metadata,
        })
      );
    }
  }

  return loadedLayouts;
}

/**
 * Loads all of the relevant configuration from the workspace store and
 * configures the interpreter. Should be called anytime one of these config
 * values is changed in order to update the interpreter's config.
 */
async function configureInterpreter(
  interpreter: PrecinctScannerInterpreter,
  workspace: Workspace
) {
  const { store } = workspace;
  const electionDefinition = store.getElectionDefinition();
  assert(electionDefinition);
  const layouts = await loadLayouts(store);
  assert(layouts);
  interpreter.configure({
    electionDefinition,
    ballotImagesPath: workspace.ballotImagesPath,
    testMode: store.getTestMode(),
    markThresholdOverrides: store.getMarkThresholdOverrides(),
    currentPrecinctId: store.getCurrentPrecinctId(),
    layouts,
  });
}

export async function buildPrecinctScannerApp(
  machine: PrecinctScannerStateMachine,
  interpreter: PrecinctScannerInterpreter,
  workspace: Workspace
): Promise<Application> {
  const { store } = workspace;

  // Load interpreter configuration from the store on startup
  if (store.getElectionDefinition()) {
    await configureInterpreter(interpreter, workspace);
  }

  const app: Application = express();
  const upload = multer({ storage: multer.diskStorage({}) });

  app.use(express.raw());
  app.use(express.json({ limit: '5mb', type: 'application/json' }));
  app.use(express.urlencoded({ extended: false }));

  app.get<NoParams, Scan.GetElectionConfigResponse>(
    '/precinct-scanner/config/election',
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
  >('/precinct-scanner/config/election', (request, response) => {
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

    store.setElection(bodyParseResult.ok());
    response.json({ status: 'ok' });
  });

  app.delete<NoParams, Scan.DeleteElectionConfigResponse>(
    '/precinct-scanner/config/election',
    (request, response) => {
      if (
        !store.getCanUnconfigure() &&
        request.query['ignoreBackupRequirement'] !== 'true'
      ) {
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

      interpreter.unconfigure();
      workspace.reset();
      response.json({ status: 'ok' });
    }
  );

  app.get<NoParams, Scan.GetTestModeConfigResponse>(
    '/precinct-scanner/config/testMode',
    (_request, response) => {
      const testMode = store.getTestMode();
      response.json({ status: 'ok', testMode });
    }
  );

  app.patch<
    NoParams,
    Scan.PatchTestModeConfigResponse,
    Scan.PatchTestModeConfigRequest
  >('/precinct-scanner/config/testMode', async (request, response) => {
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

    workspace.zero();
    store.setTestMode(bodyParseResult.ok().testMode);
    await configureInterpreter(interpreter, workspace);
    response.json({ status: 'ok' });
  });

  app.get<NoParams, Scan.GetCurrentPrecinctConfigResponse>(
    '/precinct-scanner/config/precinct',
    (_request, response) => {
      const precinctId = store.getCurrentPrecinctId();
      response.json({ status: 'ok', precinctId });
    }
  );

  app.put<
    NoParams,
    Scan.PutCurrentPrecinctConfigResponse,
    Scan.PutCurrentPrecinctConfigRequest
  >('/precinct-scanner/config/precinct', async (request, response) => {
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
    await configureInterpreter(interpreter, workspace);
    response.json({ status: 'ok' });
  });

  app.delete<NoParams, Scan.DeleteCurrentPrecinctConfigResponse>(
    '/precinct-scanner/config/precinct',
    async (_request, response) => {
      store.setCurrentPrecinctId(undefined);
      await configureInterpreter(interpreter, workspace);
      response.json({ status: 'ok' });
    }
  );

  app.get<NoParams, Scan.GetMarkThresholdOverridesConfigResponse>(
    '/precinct-scanner/config/markThresholdOverrides',
    (_request, response) => {
      const markThresholdOverrides = store.getMarkThresholdOverrides();
      response.json({ status: 'ok', markThresholdOverrides });
    }
  );

  app.delete<NoParams, Scan.DeleteMarkThresholdOverridesConfigResponse>(
    '/precinct-scanner/config/markThresholdOverrides',
    async (_request, response) => {
      store.setMarkThresholdOverrides(undefined);
      await configureInterpreter(interpreter, workspace);
      response.json({ status: 'ok' });
    }
  );

  app.patch<
    NoParams,
    Scan.PatchMarkThresholdOverridesConfigResponse,
    Scan.PatchMarkThresholdOverridesConfigRequest
  >(
    '/precinct-scanner/config/markThresholdOverrides',
    async (request, response) => {
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

      store.setMarkThresholdOverrides(
        bodyParseResult.ok().markThresholdOverrides
      );
      await configureInterpreter(interpreter, workspace);
      response.json({ status: 'ok' });
    }
  );

  app.post<NoParams, Scan.AddTemplatesResponse, Scan.AddTemplatesRequest>(
    '/precinct-scanner/config/addTemplates',
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

          const pdf = await readFile(ballotFile.path);
          const result: BallotPageLayoutWithImage[] = [];

          for await (const { page, pageNumber } of pdfToImages(pdf, {
            scale: 2,
          })) {
            const ballotPageLayout = find(
              layout,
              (l) => l.metadata.pageNumber === pageNumber
            );
            result.push({ ballotPageLayout, imageData: page });
          }

          store.addHmpbTemplate(
            pdf,
            result[0].ballotPageLayout.metadata,
            // remove ballot image for storage
            result.map(({ ballotPageLayout }) => ballotPageLayout)
          );
        }

        response.json({ status: 'ok' });
      } catch (error) {
        assert(error instanceof Error);
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

  app.post(
    '/precinct-scanner/config/doneTemplates',
    async (_request, response) => {
      await configureInterpreter(interpreter, workspace);
      response.json({ status: 'ok' });
    }
  );

  app.post<NoParams, Scan.ExportResponse, Scan.ExportRequest>(
    '/precinct-scanner/export',
    (_request, response) => {
      const outputStream = new streams.WritableStream();
      store.exportCvrs(outputStream);
      const cvrs = outputStream.toString();
      store.setCvrsAsBackedUp();
      response.set('Content-Type', 'text/plain; charset=utf-8');
      response.send(cvrs);
    }
  );

  app.get('/precinct-scanner/backup', (_request, response) => {
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

    backup(store, {
      /**
       * At greater than this number of scanned sheets, if we store original scan images, we run
       * the risk of the precinct scanner backup zip being larger than 4GB, the max file size on
       * FAT32 formatted USB drives
       */
      saveOnlyOriginalImagesThenOnlyNormalizedImagesAfterNumSheets: 1000,
    })
      .on('error', (error: Error) => {
        // debug('backup error: %s', error.stack);
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

  app.get<NoParams, Scan.GetPrecinctScannerStatusResponse>(
    '/precinct-scanner/scanner/status',
    (_request, response) => {
      const machineStatus = machine.status();
      const batches = store.batchStatus();
      const ballotsCounted = sum(batches.map((batch) => batch.count));
      const canUnconfigure = store.getCanUnconfigure();
      response.json({
        ...machineStatus,
        ballotsCounted,
        canUnconfigure,
      });
    }
  );

  app.post<NoParams, OkResponse>(
    '/precinct-scanner/scanner/scan',
    (_request, response) => {
      machine.scan();
      response.json({ status: 'ok' });
    }
  );

  app.post<NoParams, OkResponse>(
    '/precinct-scanner/scanner/accept',
    (_request, response) => {
      machine.accept();
      response.json({ status: 'ok' });
    }
  );

  app.post<NoParams, OkResponse>(
    '/precinct-scanner/scanner/return',
    (_request, response) => {
      machine.return();
      response.json({ status: 'ok' });
    }
  );

  app.post<NoParams, Scan.CalibrateResponse>(
    '/precinct-scanner/scanner/calibrate',
    async (_request, response) => {
      const result = await machine.calibrate();
      if (result.isOk()) {
        response.json({ status: 'ok' });
      } else {
        response.json({
          status: 'error',
          errors: [{ type: 'error', message: result.err() }],
        });
      }
    }
  );

  return app;
}
