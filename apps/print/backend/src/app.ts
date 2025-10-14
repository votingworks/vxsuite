import * as grout from '@votingworks/grout';
import express, { Application } from 'express';
import { assert, ok, Result } from '@votingworks/basics';
import { LogEventId } from '@votingworks/logging';
import {
  ElectionDefinition,
  ElectionPackageConfigurationError,
} from '@votingworks/types';
import { readSignedElectionPackageFromUsb } from '@votingworks/backend';
import { isElectionManagerAuth } from '@votingworks/utils';
import { AppContext } from './context';
import { rootDebug } from './debug';
import { constructAuthMachineState } from './util/auth';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const debug = rootDebug.extend('app');

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function buildApi(ctx: AppContext) {
  const { auth, usbDrive, logger, workspace } = ctx;
  const { store } = workspace;

  const methods = {
    async configureElectionPackageFromUsb(): Promise<
      Result<ElectionDefinition, ElectionPackageConfigurationError>
    > {
      const authStatus = await auth.getAuthStatus(
        constructAuthMachineState(workspace)
      );

      const electionPackageResult = await readSignedElectionPackageFromUsb(
        authStatus,
        usbDrive,
        logger
      );
      if (electionPackageResult.isErr()) {
        await logger.logAsCurrentRole(LogEventId.ElectionConfigured, {
          disposition: 'failure',
          message: 'Error configuring machine.',
          errorDetails: JSON.stringify(electionPackageResult.err()),
        });
        return electionPackageResult;
      }
      assert(isElectionManagerAuth(authStatus));
      const { electionPackage, electionPackageHash } =
        electionPackageResult.ok();
      const { electionDefinition, systemSettings } = electionPackage;
      assert(systemSettings);

      store.withTransaction(() => {
        store.setElectionAndJurisdiction({
          electionData: electionDefinition.electionData,
          jurisdiction: authStatus.user.jurisdiction,
          electionPackageHash,
        });
        store.setSystemSettings(systemSettings);
      });

      await logger.logAsCurrentRole(LogEventId.ElectionConfigured, {
        message: `Machine configured for election with hash: ${electionDefinition.ballotHash}`,
        disposition: 'success',
        ballotHash: electionDefinition.ballotHash,
      });

      return ok(electionDefinition);
    },
  } as const;

  return grout.createApi(methods);
}

export type Api = ReturnType<typeof buildApi>;

export function buildApp(context: AppContext): Application {
  const app: Application = express();

  const api = buildApi(context);

  app.use('/api', grout.buildRouter(api, express));

  return app;
}
