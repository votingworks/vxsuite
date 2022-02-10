import { readBallotPackageFromBuffer } from '@votingworks/utils';
import bodyParser from 'body-parser';
import express from 'express';
import { readFile } from 'fs-extra';
import multer from 'multer';
import {
  GetScanStatusResponse,
  DeleteScanBatchResponse,
  ScanBatchRequest,
  ScanBatchResponse,
  ScannerStatus,
  ExportRequest,
  ExportResponse,
} from '@votingworks/types/api/services/scan';
import { safeParseElectionDefinition } from '@votingworks/types';
import { Store } from './store';
import { Importer } from './importer';

export interface Options {
  importer: Importer;
  store: Store;
}

export async function buildApp({
  importer,
  store,
}: Options): Promise<express.Application> {
  const app = express();
  const upload = multer({ storage: multer.diskStorage({}) });
  app.use(bodyParser.raw());
  app.use(express.json({ limit: '5mb', type: 'application/json' }));
  app.use(bodyParser.urlencoded({ extended: false }));

  app.get('/config', async (_request, response) => {
    const currentElection = await store.getCurrentElection();

    if (!currentElection) {
      response.status(404).end();
      return;
    }

    response.json(currentElection);
  });

  app.put(
    '/config/package',
    upload.fields([{ name: 'package', maxCount: 1 }]),
    async (request, response) => {
      const file = !Array.isArray(request.files)
        ? request.files?.package?.[0]
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

      const pkg = await readBallotPackageFromBuffer(
        await readFile(file.path),
        file.filename,
        file.size
      );

      const elections = await store.addElection(pkg.electionDefinition);
      await store.setCurrentElection(elections.test.id);

      response.json({ status: 'ok' });
    }
  );

  app.put(
    '/config/election',
    upload.fields([{ name: 'election', maxCount: 1 }]),
    async (request, response) => {
      const file = !Array.isArray(request.files)
        ? request.files?.election?.[0]
        : undefined;

      if (!file) {
        response.status(400).json({
          status: 'error',
          errors: [
            {
              type: 'invalid-value',
              message: 'expected file field to be named "election"',
            },
          ],
        });
        return;
      }

      const parseResult = safeParseElectionDefinition(
        await readFile(file.path, 'utf8')
      );
      if (parseResult.isErr()) {
        response.status(400).json({
          status: 'error',
          errors: [
            {
              type: 'invalid-value',
              message: 'invalid election definition',
            },
          ],
        });
        return;
      }

      const electionDefinition = parseResult.ok();
      const elections = await store.addElection(electionDefinition);
      await store.setCurrentElection(elections.test.id);

      response.json({ status: 'ok' });
    }
  );

  app.post<never, ScanBatchResponse, ScanBatchRequest>(
    '/scan/batch',
    async (_request, response) => {
      const result = await importer.startScanBatch();
      if (result.isOk()) {
        response.json({ status: 'ok', batchId: result.ok() });
      } else {
        response.json({
          status: 'error',
          errors: [
            {
              type: 'scan-batch-error',
              message: result.err().message,
            },
          ],
        });
      }
    }
  );

  app.get<never, GetScanStatusResponse>(
    '/scan/status',
    async (_request, response) => {
      const currentElection = await store.getCurrentElection();
      const batches = await store.getBatches();
      response.json({
        electionHash: currentElection?.electionHash,
        adjudication: { adjudicated: 0, remaining: 0 },
        batches,
        scanner: ScannerStatus.Unknown,
      });
    }
  );

  app.delete<never, DeleteScanBatchResponse>(
    '/scan/batch/:batchId',
    async (request, response) => {
      const { batchId } = request.params;
      const result = await store.deleteBatch(batchId);
      if (result.isOk()) {
        response.json({ status: 'ok' });
      } else {
        response.json({
          status: 'error',
          errors: [
            {
              type: 'delete-batch-error',
              message: result.err().message,
            },
          ],
        });
      }
    }
  );

  app.post<ExportRequest, ExportResponse>(
    '/scan/export',
    async (_request, response) => {
      response.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
      });
      await store.exportCvrs(response);
      response.end();
    }
  );

  app.get('/*', (request, response) => {
    const url = new URL(`http://${request.get('host')}${request.originalUrl}`);
    url.port = '3000';
    response.redirect(301, url.toString());
  });

  return app;
}

export async function start({ importer, store }: Options): Promise<void> {
  await store.cleanupIncompleteBatches();

  const app = await buildApp({ importer, store });
  app.listen(3002);
}
