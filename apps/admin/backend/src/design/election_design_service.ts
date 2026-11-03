import { join } from 'node:path';
import type { Router } from 'express';
import express from 'express';
import * as grout from '@votingworks/grout';
import type { DippedSmartCardAuthApi } from '@votingworks/auth';
import { err, ok, type Result } from '@votingworks/basics';
import type { Logger } from '@votingworks/logging';
import type { MultiUsbDrive } from '@votingworks/usb-drive';
import type { Workspace } from '../util/workspace.js';
import { buildDesignApi } from './design_api.js';
import { createDesignExporter } from './design_export.js';
import { englishOnlyStateFeatures } from './design_features.js';
import { getMachineDesignState } from './design_state.js';
import { DesignStore } from './design_store.js';

export interface ElectionDesignService {
  readonly router: Router;
  getExportedElectionPackagePath(
    designElectionId: string
  ): Result<string, Error>;
  reset(): Promise<void>;
}

export function createDesignStore(workspace: Workspace): DesignStore {
  return new DesignStore(workspace.store.getDbClient(), {
    getStateFeatures: () => {
      const state = getMachineDesignState();
      if (state.status !== 'supported') {
        throw new Error('Election design is not supported in this state.');
      }
      return englishOnlyStateFeatures(state.stateCode);
    },
  });
}

export function startElectionDesignService({
  auth,
  workspace,
  logger,
  multiUsbDrive,
}: {
  auth: DippedSmartCardAuthApi;
  workspace: Workspace;
  logger: Logger;
  multiUsbDrive: MultiUsbDrive;
}): ElectionDesignService {
  const store = createDesignStore(workspace);
  store.failInterruptedExports();
  const exporter = createDesignExporter({
    store,
    filesRoot: join(workspace.path, 'design-files'),
  });

  return {
    router: grout.buildRouter(
      buildDesignApi({
        auth,
        workspace,
        store,
        logger,
        multiUsbDrive,
        designExporter: exporter,
      }),
      express
    ),

    getExportedElectionPackagePath(designElectionId) {
      const finalizedAt = store.getBallotsFinalizedAt(designElectionId);
      const designExport = store.getExport(designElectionId);
      if (
        !finalizedAt ||
        designExport?.status !== 'complete' ||
        !designExport.electionPackagePath
      ) {
        return err(new Error('Finalize ballots and wait for them to render.'));
      }
      return ok(exporter.resolveFileUrl(designExport.electionPackagePath));
    },

    async reset() {
      await exporter.clearFiles();
    },
  };
}
