import type { Router } from 'express';
import express from 'express';
import * as grout from '@votingworks/grout';
import type { DippedSmartCardAuthApi } from '@votingworks/auth';
import { err, ok, type Result } from '@votingworks/basics';
import type { BaseLogger, Logger } from '@votingworks/logging';
import type { MultiUsbDrive } from '@votingworks/usb-drive';
import { isNodeEnvProduction } from '@votingworks/utils';
import type { Workspace } from '../util/workspace.js';
import { buildDesignApi } from './design_api.js';
import { openDesignStores } from './design_db.js';
import { createDesignExporter } from './design_export.js';
import { englishOnlyStateFeatures } from './design_features.js';
import { getMachineDesignState } from './design_state.js';

const PRODUCTION_DESIGN_FILES_DIR = '/vx/data/admin-design-files';

export interface ElectionDesignService {
  readonly router: Router;
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

export async function startElectionDesignService({
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
}): Promise<ElectionDesignService> {
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
    stores,
    filesRoot: designFilesRoot(workspace),
  });

  return {
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

    async getExportedElectionPackagePath(designElectionId) {
      const finalizedAt =
        await stores.elections.getBallotsFinalizedAt(designElectionId);
      const { task, electionPackageUrl } =
        await stores.tasks.getElectionPackage(designElectionId);
      if (
        !finalizedAt ||
        !electionPackageUrl ||
        !task?.completedAt ||
        task.error ||
        task.createdAt < finalizedAt
      ) {
        return err(new Error('Finalize and export ballots first.'));
      }
      return ok(exporter.resolveFileUrl(electionPackageUrl));
    },
  };
}
