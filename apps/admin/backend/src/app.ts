import { LogEventId, Logger } from '@votingworks/logging';
import {
  CastVoteRecord,
  ContestId,
  DEFAULT_SYSTEM_SETTINGS,
  ElectionDefinition,
  safeParseElectionDefinition,
  safeParseJson,
  SystemSettings,
  SystemSettingsSchema,
  Tabulation,
  TEST_JURISDICTION,
} from '@votingworks/types';
import {
  assert,
  assertDefined,
  err,
  ok,
  Optional,
  Result,
} from '@votingworks/basics';
import express, { Application } from 'express';
import {
  DippedSmartCardAuthApi,
  DippedSmartCardAuthMachineState,
  DEV_JURISDICTION,
  ArtifactAuthenticatorApi,
} from '@votingworks/auth';
import * as grout from '@votingworks/grout';
import { useDevDockRouter } from '@votingworks/dev-dock-backend';
import { promises as fs, Stats } from 'fs';
import { basename, dirname } from 'path';
import {
  CAST_VOTE_RECORD_REPORT_FILENAME,
  isIntegrationTest,
  parseCastVoteRecordReportDirectoryName,
} from '@votingworks/utils';
import {
  CastVoteRecordFileRecord,
  ConfigureResult,
  CvrFileImportInfo,
  CvrFileMode,
  ElectionRecord,
  ManualResultsIdentifier,
  ManualResultsMetadataRecord,
  ManualResultsRecord,
  ServerFullElectionManualTally,
  SetSystemSettingsResult,
  WriteInAdjudicationAction,
  WriteInAdjudicationStatus,
  WriteInCandidateRecord,
  WriteInDetailView,
  WriteInRecord,
  WriteInTally,
} from './types';
import { Workspace } from './util/workspace';
import {
  AddCastVoteRecordReportError,
  addCastVoteRecordReport,
  getAddCastVoteRecordReportErrorMessage,
  listCastVoteRecordFilesOnUsb,
} from './cvr_files';
import { Usb } from './util/usb';
import { getMachineConfig } from './machine_config';
import { getWriteInDetailView } from './util/write_ins';
import {
  buildFullElectionManualTallyFromStore,
  handleEnteredWriteInCandidateData,
} from './util/manual_results';

function getCurrentElectionDefinition(
  workspace: Workspace
): Optional<ElectionDefinition> {
  const currentElectionId = workspace.store.getCurrentElectionId();
  const elections = workspace.store.getElections();
  const mostRecentlyCreatedElection = elections.find(
    (election) => election.id === currentElectionId
  );
  return mostRecentlyCreatedElection?.electionDefinition;
}

function constructAuthMachineState(
  workspace: Workspace
): DippedSmartCardAuthMachineState {
  const electionDefinition = getCurrentElectionDefinition(workspace);
  const systemSettings = workspace.store.getSystemSettings();
  return {
    ...(systemSettings ?? {}),
    electionHash: electionDefinition?.electionHash,
    jurisdiction: isIntegrationTest()
      ? TEST_JURISDICTION
      : process.env.VX_MACHINE_JURISDICTION ?? DEV_JURISDICTION,
  };
}

function loadCurrentElectionIdOrThrow(workspace: Workspace) {
  return assertDefined(workspace.store.getCurrentElectionId());
}

function buildApi({
  auth,
  artifactAuthenticator,
  workspace,
  logger,
  usb,
}: {
  auth: DippedSmartCardAuthApi;
  artifactAuthenticator: ArtifactAuthenticatorApi;
  workspace: Workspace;
  logger: Logger;
  usb: Usb;
}) {
  const { store } = workspace;

  async function getUserRole() {
    const authStatus = await auth.getAuthStatus(
      constructAuthMachineState(workspace)
    );
    if (authStatus.status === 'logged_in') {
      return authStatus.user.role;
    }
    return undefined;
  }

  return grout.createApi({
    getMachineConfig,

    getAuthStatus() {
      return auth.getAuthStatus(constructAuthMachineState(workspace));
    },

    checkPin(input: { pin: string }) {
      return auth.checkPin(constructAuthMachineState(workspace), input);
    },

    logOut() {
      return auth.logOut(constructAuthMachineState(workspace));
    },

    updateSessionExpiry(input: { sessionExpiresAt: Date }) {
      return auth.updateSessionExpiry(
        constructAuthMachineState(workspace),
        input
      );
    },

    programCard(input: {
      userRole: 'system_administrator' | 'election_manager' | 'poll_worker';
    }) {
      const machineState = constructAuthMachineState(workspace);
      if (input.userRole === 'election_manager') {
        const electionDefinition = getCurrentElectionDefinition(workspace);
        assert(electionDefinition !== undefined);
        const { electionData } = electionDefinition;
        return auth.programCard(machineState, {
          userRole: 'election_manager',
          electionData,
        });
      }
      return auth.programCard(machineState, {
        userRole: input.userRole,
      });
    },

    unprogramCard() {
      return auth.unprogramCard(constructAuthMachineState(workspace));
    },

    async writeBallotPackageSignatureFile(input: {
      ballotPackagePath: string;
    }): Promise<void> {
      await artifactAuthenticator.writeSignatureFile({
        type: 'ballot_package',
        path: input.ballotPackagePath,
      });
    },

    async setSystemSettings(input: {
      systemSettings: string;
    }): Promise<SetSystemSettingsResult> {
      await logger.log(
        LogEventId.SystemSettingsSaveInitiated,
        assertDefined(await getUserRole()),
        { disposition: 'na' }
      );

      const { systemSettings } = input;
      const validatedSystemSettings = safeParseJson(
        systemSettings,
        SystemSettingsSchema
      );
      if (validatedSystemSettings.isErr()) {
        return err({
          type: 'parsing',
          message: validatedSystemSettings.err()?.message,
        });
      }

      try {
        store.saveSystemSettings(validatedSystemSettings.ok());
      } catch (error) {
        const typedError = error as Error;
        await logger.log(
          LogEventId.SystemSettingsSaved,
          assertDefined(await getUserRole()),
          { disposition: 'failure', error: typedError.message }
        );
        throw error;
      }

      await logger.log(
        LogEventId.SystemSettingsSaved,
        assertDefined(await getUserRole()),
        { disposition: 'success' }
      );

      return ok({});
    },

    async getSystemSettings(): Promise<SystemSettings> {
      try {
        const settings = store.getSystemSettings();
        await logger.log(
          LogEventId.SystemSettingsRetrieved,
          (await getUserRole()) ?? 'unknown',
          { disposition: 'success' }
        );
        return settings ?? DEFAULT_SYSTEM_SETTINGS;
      } catch (error) {
        await logger.log(
          LogEventId.SystemSettingsRetrieved,
          (await getUserRole()) ?? 'unknown',
          { disposition: 'failure' }
        );
        throw error;
      }
    },

    // `configure` and `unconfigure` handle changes to the election definition
    async configure(input: { electionData: string }): Promise<ConfigureResult> {
      const parseResult = safeParseElectionDefinition(input.electionData);
      if (parseResult.isErr()) {
        return err({ type: 'parsing', message: parseResult.err().message });
      }
      const electionDefinition = parseResult.ok();
      const electionId = store.addElection(electionDefinition.electionData);
      store.setCurrentElectionId(electionId);
      await logger.log(
        LogEventId.ElectionConfigured,
        assertDefined(await getUserRole()),
        {
          disposition: 'success',
          newElectionHash: electionDefinition.electionHash,
        }
      );
      return ok({ electionId });
    },

    async unconfigure(): Promise<void> {
      store.deleteElection(loadCurrentElectionIdOrThrow(workspace));
      store.setCurrentElectionId();
      await logger.log(
        LogEventId.ElectionUnconfigured,
        assertDefined(await getUserRole()),
        {
          disposition: 'success',
        }
      );
    },

    // use null because React Query does not allow undefined as a query result
    getCurrentElectionMetadata(): ElectionRecord | null {
      const currentElectionId = store.getCurrentElectionId();
      if (currentElectionId) {
        const electionRecord = store.getElection(currentElectionId);
        assert(electionRecord);
        return electionRecord;
      }

      return null;
    },

    async markResultsOfficial(): Promise<void> {
      store.setElectionResultsOfficial(
        loadCurrentElectionIdOrThrow(workspace),
        true
      );

      await logger.log(
        LogEventId.MarkedTallyResultsOfficial,
        assertDefined(await getUserRole()),
        {
          message:
            'User has marked the tally results as official, no more cast vote record files can be loaded.',
          disposition: 'success',
        }
      );
    },

    listCastVoteRecordFilesOnUsb() {
      const electionDefinition = getCurrentElectionDefinition(workspace);
      assert(electionDefinition);

      return listCastVoteRecordFilesOnUsb(electionDefinition, usb, logger);
    },

    getCastVoteRecordFiles(): CastVoteRecordFileRecord[] {
      return store.getCvrFiles(loadCurrentElectionIdOrThrow(workspace));
    },

    // TODO(https://github.com/votingworks/vxsuite/issues/2613): This endpoint
    // can be removed once we've moved tally computation to the server - it's
    // currently only used as a stopgap while we migrate all app state to the
    // server.
    getCastVoteRecords(): CastVoteRecord[] {
      const currentElectionId = store.getCurrentElectionId();
      if (!currentElectionId) {
        return [];
      }

      return store
        .getCastVoteRecordEntries(currentElectionId)
        .map(
          (entry) => safeParseJson(entry.data).unsafeUnwrap() as CastVoteRecord
        );
    },

    async addCastVoteRecordFile(input: {
      path: string;
    }): Promise<
      Result<
        CvrFileImportInfo,
        AddCastVoteRecordReportError & { message: string }
      >
    > {
      const userRole = assertDefined(await getUserRole());
      const { path: inputPath } = input;
      // the path passed to the backend may be for the report directory or the
      // contained .json report, so we resolve to the report directory path
      const path =
        basename(inputPath) === CAST_VOTE_RECORD_REPORT_FILENAME
          ? dirname(inputPath)
          : inputPath;

      const filename = basename(path);
      let fileStat: Stats;
      try {
        fileStat = await fs.stat(path);
      } catch (error) {
        const message = getAddCastVoteRecordReportErrorMessage({
          type: 'report-access-failure',
        });
        await logger.log(LogEventId.CvrLoaded, userRole, {
          message,
          disposition: 'failure',
          filename,
          error: message,
          result: 'Report not loaded, error shown to user.',
        });
        return err({
          type: 'report-access-failure',
          message,
        });
      }

      // try to get the exported timestamp from the filename, otherwise use file last modified
      const exportedTimestamp =
        parseCastVoteRecordReportDirectoryName(basename(path))?.timestamp ||
        fileStat.mtime;

      const addCastVoteRecordReportResult = await addCastVoteRecordReport({
        store,
        reportDirectoryPath: path,
        exportedTimestamp: exportedTimestamp.toISOString(),
        artifactAuthenticator,
      });

      if (addCastVoteRecordReportResult.isErr()) {
        const message = getAddCastVoteRecordReportErrorMessage(
          addCastVoteRecordReportResult.err()
        );
        await logger.log(LogEventId.CvrLoaded, userRole, {
          message,
          disposition: 'failure',
          filename,
          result: 'Report not loaded, error shown to user.',
        });
        return err({
          ...addCastVoteRecordReportResult.err(),
          message,
        });
      }

      if (addCastVoteRecordReportResult.ok().wasExistingFile) {
        // log failure if the file was a duplicate
        await logger.log(LogEventId.CvrLoaded, userRole, {
          message:
            'Cast vote record report was not loaded as it is a duplicate of a previously loaded file.',
          disposition: 'failure',
          filename,
          result: 'Report not loaded, error shown to user.',
        });
      } else {
        // log success otherwise
        await logger.log(LogEventId.CvrLoaded, userRole, {
          message: 'Cast vote record report successfully loaded.',
          disposition: 'success',
          filename,
          numberOfBallotsImported:
            addCastVoteRecordReportResult.ok().newlyAdded,
          duplicateBallotsIgnored:
            addCastVoteRecordReportResult.ok().alreadyPresent,
        });
      }
      return addCastVoteRecordReportResult;
    },

    async clearCastVoteRecordFiles(): Promise<void> {
      const electionId = loadCurrentElectionIdOrThrow(workspace);
      store.deleteCastVoteRecordFiles(electionId);
      store.setElectionResultsOfficial(electionId, false);
      await logger.log(
        LogEventId.CaseVoteRecordFileRemoved,
        assertDefined(await getUserRole()),
        {
          message: 'User removed all cast vote record files.',
          disposition: 'success',
        }
      );
    },

    getCastVoteRecordFileMode(): CvrFileMode {
      return store.getCurrentCvrFileModeForElection(
        loadCurrentElectionIdOrThrow(workspace)
      );
    },

    getWriteIns(
      input: {
        contestId?: ContestId;
        status?: WriteInAdjudicationStatus;
        limit?: number;
      } = {}
    ): WriteInRecord[] {
      return store.getWriteInRecords({
        electionId: loadCurrentElectionIdOrThrow(workspace),
        ...input,
      });
    },

    adjudicateWriteIn(input: WriteInAdjudicationAction): void {
      store.adjudicateWriteIn(input);
    },

    // frontend only using with status "adjudicated". this could be a more
    // targeted query if the other status filters are determined unnecessary
    getWriteInTallies(
      input: {
        contestId?: ContestId;
        status?: WriteInAdjudicationStatus;
      } = {}
    ): WriteInTally[] {
      return store.getWriteInTallies({
        electionId: loadCurrentElectionIdOrThrow(workspace),
        ...input,
      });
    },

    getWriteInCandidates(
      input: {
        contestId?: ContestId;
      } = {}
    ): WriteInCandidateRecord[] {
      return store.getWriteInCandidates({
        electionId: loadCurrentElectionIdOrThrow(workspace),
        ...input,
      });
    },

    addWriteInCandidate(input: {
      contestId: ContestId;
      name: string;
    }): WriteInCandidateRecord {
      return store.addWriteInCandidate({
        electionId: loadCurrentElectionIdOrThrow(workspace),
        ...input,
      });
    },

    async getWriteInDetailView(input: {
      writeInId: string;
    }): Promise<WriteInDetailView> {
      return getWriteInDetailView({
        store: workspace.store,
        writeInId: input.writeInId,
      });
    },

    async deleteAllManualResults(): Promise<void> {
      store.deleteAllManualResults({
        electionId: loadCurrentElectionIdOrThrow(workspace),
      });
      await logger.log(
        LogEventId.ManualTallyDataRemoved,
        assertDefined(await getUserRole()),
        {
          message: 'User removed all manually entered tally data.',
          disposition: 'success',
        }
      );
    },

    async deleteManualResults(input: ManualResultsIdentifier): Promise<void> {
      store.deleteManualResults({
        electionId: loadCurrentElectionIdOrThrow(workspace),
        ...input,
      });
      await logger.log(
        LogEventId.ManualTallyDataRemoved,
        assertDefined(await getUserRole()),
        {
          message:
            'User removed manually entered tally data for a particular ballot style, precinct, and voting method.',
          ...input,
          disposition: 'success',
        }
      );
    },

    async setManualResults(
      input: ManualResultsIdentifier & {
        manualResults: Tabulation.ManualElectionResults;
      }
    ): Promise<void> {
      const electionId = loadCurrentElectionIdOrThrow(workspace);
      await store.withTransaction(() => {
        const manualResults = handleEnteredWriteInCandidateData({
          manualResults: input.manualResults,
          electionId,
          store,
        });
        store.setManualResults({
          electionId,
          precinctId: input.precinctId,
          ballotStyleId: input.ballotStyleId,
          votingMethod: input.votingMethod,
          manualResults,
        });
        return Promise.resolve();
      });

      await logger.log(
        LogEventId.ManualTallyDataEdited,
        assertDefined(await getUserRole()),
        {
          disposition: 'success',
          message:
            'User added or edited manually entered tally data for a particular ballot style, precinct, and voting method.',
          ballotCount: input.manualResults.ballotCount,
          ballotStyleId: input.ballotStyleId,
          precinctId: input.precinctId,
          ballotType: input.votingMethod,
        }
      );
    },

    getFullElectionManualTally(): ServerFullElectionManualTally | null {
      const electionId = store.getCurrentElectionId();
      if (!electionId) return null;

      return buildFullElectionManualTallyFromStore(store, electionId) || null;
    },

    getManualResults(
      input: ManualResultsIdentifier
    ): ManualResultsRecord | null {
      const [manualResultsRecord] = store.getManualResults({
        electionId: loadCurrentElectionIdOrThrow(workspace),
        precinctIds: input.precinctId ? [input.precinctId] : undefined,
        ballotStyleIds: input.ballotStyleId ? [input.ballotStyleId] : undefined,
        votingMethods: input.votingMethod ? [input.votingMethod] : undefined,
      });

      return manualResultsRecord ?? null;
    },

    getManualResultsMetadata(): ManualResultsMetadataRecord[] {
      return store
        .getManualResultsMetadata({
          electionId: loadCurrentElectionIdOrThrow(workspace),
        })
        .map((record) => ({ ...record }));
      // TODO: grout is having trouble serializing records from the store
      // without destructuring them. need to investigate
    },
  });
}

/**
 * A type to be used by the frontend to create a Grout API client
 */
export type Api = ReturnType<typeof buildApi>;

/**
 * Builds an express application.
 */
export function buildApp({
  auth,
  artifactAuthenticator,
  workspace,
  logger,
  usb,
}: {
  auth: DippedSmartCardAuthApi;
  artifactAuthenticator: ArtifactAuthenticatorApi;
  workspace: Workspace;
  logger: Logger;
  usb: Usb;
}): Application {
  const app: Application = express();
  const api = buildApi({ auth, artifactAuthenticator, workspace, logger, usb });
  app.use('/api', grout.buildRouter(api, express));
  useDevDockRouter(app, express);
  return app;
}
