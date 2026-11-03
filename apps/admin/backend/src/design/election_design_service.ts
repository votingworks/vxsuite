import type { RequestHandler, Router } from 'express';
import express from 'express';
import * as grout from '@votingworks/grout';
import type { DippedSmartCardAuthApi } from '@votingworks/auth';
import { err, extractErrorMessage, ok, type Result } from '@votingworks/basics';
import { type BaseLogger, LogEventId, type Logger } from '@votingworks/logging';
import type { MultiUsbDrive } from '@votingworks/usb-drive';
import { isNodeEnvProduction } from '@votingworks/utils';
import type { Workspace } from '../util/workspace.js';
import { buildDesignApi } from './design_api.js';
import { type AdminDesignStores, openDesignStores } from './design_db.js';
import { createDesignExporter, type DesignExporter } from './design_export.js';
import { englishOnlyStateFeatures } from './design_features.js';
import { getMachineDesignState } from './design_state.js';

const INITIAL_RETRY_DELAY_MS = 5_000;
const MAX_RETRY_DELAY_MS = 60_000;
const PRODUCTION_DESIGN_FILES_DIR = '/vx/data/admin-design-files';

export interface ElectionDesignService {
  readonly router: RequestHandler;
  getExportedElectionPackagePath(
    designElectionId: string
  ): Promise<Result<string, Error>>;
}

function designFilesRoot(workspace: Workspace): string {
  return (
    process.env.ADMIN_DESIGN_FILES_DIR ??
    (isNodeEnvProduction()
      ? PRODUCTION_DESIGN_FILES_DIR
      : `${workspace.path}-design-files`)
  );
}

export function startElectionDesignService({
  auth,
  workspace,
  logger,
  baseLogger,
  multiUsbDrive,
}: {
  auth: DippedSmartCardAuthApi;
  workspace: Workspace;
  logger: Logger;
  baseLogger: BaseLogger;
  multiUsbDrive: MultiUsbDrive;
}): ElectionDesignService {
  let ready:
    | { stores: AdminDesignStores; exporter: DesignExporter; router: Router }
    | undefined;

  async function start(attempt: number): Promise<void> {
    try {
      const stores = await openDesignStores(baseLogger, {
        getStateFeatures: () => {
          const state = getMachineDesignState();
          if (state.status !== 'supported') {
            throw new Error('Election design is not supported in this state.');
          }
          return Promise.resolve(englishOnlyStateFeatures(state.stateCode));
        },
      });
      await stores.tasks.failCrashedBackgroundTasks();
      const exporter = createDesignExporter({
        tasks: stores.tasks,
        filesRoot: designFilesRoot(workspace),
        logger: baseLogger,
      });
      ready = {
        stores,
        exporter,
        router: grout.buildRouter(
          buildDesignApi({
            auth,
            workspace,
            stores,
            logger,
            multiUsbDrive,
            designExporter: exporter,
          }),
          express
        ),
      };
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

  return {
    router: (request, response, next) => {
      if (ready) {
        ready.router(request, response, next);
        return;
      }
      response.status(503).json({ message: 'Election design is unavailable.' });
    },

    async getExportedElectionPackagePath(designElectionId) {
      if (!ready) return err(new Error('Election design is unavailable.'));
      const { elections, tasks } = ready.stores;
      const finalizedAt =
        await elections.getBallotsFinalizedAt(designElectionId);
      const { task, electionPackageUrl } =
        await tasks.getElectionPackage(designElectionId);
      if (
        !finalizedAt ||
        !electionPackageUrl ||
        !task?.completedAt ||
        task.error ||
        task.createdAt < finalizedAt
      ) {
        return err(new Error('Finalize and export ballots first.'));
      }
      return ok(ready.exporter.resolveFileUrl(electionPackageUrl));
    },
  };
}
