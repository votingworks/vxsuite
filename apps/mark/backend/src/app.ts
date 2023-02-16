import express, { Application } from 'express';
import { z } from 'zod';
import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import { err, ok, Result } from '@votingworks/basics';
import * as grout from '@votingworks/grout';
import {
  BallotStyleId,
  ElectionDefinition,
  Optional,
  PrecinctId,
  safeParseElectionDefinition,
} from '@votingworks/types';
import { ScannerReportData, ScannerReportDataSchema } from '@votingworks/utils';

import { getMachineConfig } from './machine_config';

function buildApi(auth: InsertedSmartCardAuthApi) {
  return grout.createApi({
    getMachineConfig,

    // TODO: Once election definition has been moved to the backend, no longer require the frontend
    // to provide election hash to this and other methods that use the auth lib
    getAuthStatus({ electionHash }: { electionHash?: string }) {
      return auth.getAuthStatus({ electionHash });
    },

    checkPin({ electionHash, pin }: { electionHash?: string; pin: string }) {
      return auth.checkPin({ electionHash }, { pin });
    },

    startCardlessVoterSession({
      electionHash,
      ballotStyleId,
      precinctId,
    }: {
      electionHash?: string;
      ballotStyleId: BallotStyleId;
      precinctId: PrecinctId;
    }) {
      return auth.startCardlessVoterSession(
        { electionHash },
        { ballotStyleId, precinctId }
      );
    },

    endCardlessVoterSession({ electionHash }: { electionHash?: string }) {
      return auth.endCardlessVoterSession({ electionHash });
    },

    async readElectionDefinitionFromCard({
      electionHash,
    }: {
      electionHash?: string;
    }): Promise<Result<ElectionDefinition, Error>> {
      const authStatus = await auth.getAuthStatus({ electionHash });
      if (authStatus.status !== 'logged_in') {
        return err(new Error('User is not logged in'));
      }
      if (authStatus.user.role !== 'election_manager') {
        return err(new Error('User is not an election manager'));
      }

      const result = await auth.readCardDataAsString({ electionHash });
      const electionData = result.ok();
      const electionDefinition = electionData
        ? safeParseElectionDefinition(electionData).ok()
        : undefined;

      if (!electionDefinition) {
        // While we could provide more specific error messages for different error cases, the
        // frontend doesn't need that much detail
        return err(new Error('Unable to read election definition from card'));
      }
      return ok(electionDefinition);
    },

    async readScannerReportDataFromCard({
      electionHash,
    }: {
      electionHash?: string;
    }): Promise<
      Result<Optional<ScannerReportData>, SyntaxError | z.ZodError | Error>
    > {
      const authStatus = await auth.getAuthStatus({ electionHash });
      if (authStatus.status !== 'logged_in') {
        return err(new Error('User is not logged in'));
      }
      if (authStatus.user.role !== 'poll_worker') {
        return err(new Error('User is not a poll worker'));
      }

      return await auth.readCardData(
        { electionHash },
        { schema: ScannerReportDataSchema }
      );
    },

    async clearScannerReportDataFromCard({
      electionHash,
    }: {
      electionHash?: string;
    }): Promise<Result<void, Error>> {
      const authStatus = await auth.getAuthStatus({ electionHash });
      if (authStatus.status !== 'logged_in') {
        return err(new Error('User is not logged in'));
      }
      if (authStatus.user.role !== 'poll_worker') {
        return err(new Error('User is not a poll worker'));
      }

      return await auth.clearCardData({ electionHash });
    },
  });
}

export type Api = ReturnType<typeof buildApi>;

export function buildApp(auth: InsertedSmartCardAuthApi): Application {
  const app: Application = express();
  const api = buildApi(auth);
  app.use('/api', grout.buildRouter(api, express));
  return app;
}
