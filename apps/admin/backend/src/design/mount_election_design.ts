import type { Application, Router } from 'express';
import express from 'express';
import * as grout from '@votingworks/grout';
import type { DippedSmartCardAuthApi } from '@votingworks/auth';
import { extractErrorMessage } from '@votingworks/basics';
import { type BaseLogger, LogEventId, type Logger } from '@votingworks/logging';
import type { MultiUsbDrive } from '@votingworks/usb-drive';
import type { Workspace } from '../util/workspace.js';
import { buildDesignApi } from './design_api.js';
import { createDesignExporter } from './design_export.js';
import { createDesignStore } from './design_store.js';

const INITIAL_RETRY_DELAY_MS = 5_000;
const MAX_RETRY_DELAY_MS = 60_000;

export function mountElectionDesign({
  app,
  auth,
  workspace,
  logger,
  baseLogger,
  multiUsbDrive,
}: {
  app: Application;
  auth: DippedSmartCardAuthApi;
  workspace: Workspace;
  logger: Logger;
  baseLogger: BaseLogger;
  multiUsbDrive: MultiUsbDrive;
}): void {
  let designRouter: Router | undefined;

  app.use('/design-api', (request, response, next) => {
    if (designRouter) {
      designRouter(request, response, next);
      return;
    }
    response.status(503).json({ message: 'Election design is unavailable.' });
  });

  async function start(attempt: number): Promise<void> {
    try {
      const designStore = await createDesignStore(baseLogger);
      const designExporter = createDesignExporter({
        designStore,
        filesRoot:
          process.env.ADMIN_DESIGN_FILES_DIR ??
          `${workspace.path}-design-files`,
      });
      designRouter = grout.buildRouter(
        buildDesignApi({
          auth,
          workspace,
          designStore,
          logger,
          multiUsbDrive,
          designExporter,
        }),
        express
      );
      baseLogger.log(LogEventId.ApplicationStartup, 'system', {
        message: 'Election design started.',
        disposition: 'success',
      });
    } catch (error) {
      const delayMs = Math.min(
        INITIAL_RETRY_DELAY_MS * 2 ** (attempt - 1),
        MAX_RETRY_DELAY_MS
      );
      baseLogger.log(LogEventId.ApplicationStartup, 'system', {
        message: `Election design failed to start (attempt ${attempt}); retrying in ${
          delayMs / 1000
        }s: ${extractErrorMessage(error)}`,
        disposition: 'failure',
      });
      setTimeout(() => {
        void start(attempt + 1);
      }, delayMs);
    }
  }

  void start(1);
}
