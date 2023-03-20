import { Admin } from '@votingworks/api';
import { LogEventId, Logger } from '@votingworks/logging';
import {
  BallotPageLayout,
  CandidateContest,
  CastVoteRecord,
  ContestId,
  ContestOptionId,
  ElectionDefinition,
  getBallotStyle,
  getContests,
  InlineBallotImage,
  Optional,
  Rect,
  safeParseElectionDefinition,
  safeParseJson,
  safeParseNumber,
  SystemSettings,
  SystemSettingsSchema,
} from '@votingworks/types';
import { assert, assertDefined, err, ok, iter } from '@votingworks/basics';
import express, { Application } from 'express';
import {
  DippedSmartCardAuthApi,
  DippedSmartCardAuthMachineState,
  DEV_JURISDICTION,
} from '@votingworks/auth';
import * as grout from '@votingworks/grout';
import { promises as fs, Stats } from 'fs';
import { basename } from 'path';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
  parseCastVoteRecordReportDirectoryName,
} from '@votingworks/utils';
import {
  AddCastVoteRecordFileResult,
  ConfigureResult,
  SetSystemSettingsResult,
} from './types';
import { Workspace } from './util/workspace';
import { listCastVoteRecordFilesOnUsb } from './cvr_files';
import { Usb } from './util/usb';
import { getMachineConfig } from './machine_config';
import { CvrImportFormat } from './globals';

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
  const currentElectionDefinition = getCurrentElectionDefinition(workspace);
  return {
    electionHash: currentElectionDefinition?.electionHash,
    // TODO: Pull jurisdiction from VxAdmin cert authority cert
    jurisdiction: isFeatureFlagEnabled(
      BooleanEnvironmentVariableName.ENABLE_JAVA_CARDS
    )
      ? /* istanbul ignore next */ DEV_JURISDICTION
      : undefined,
  };
}

function loadCurrentElectionIdOrThrow(workspace: Workspace) {
  return assertDefined(workspace.store.getCurrentElectionId());
}

function buildApi({
  auth,
  workspace,
  logger,
  usb,
}: {
  auth: DippedSmartCardAuthApi;
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

    async getSystemSettings(): Promise<SystemSettings | null> {
      try {
        const settings = store.getSystemSettings();
        await logger.log(
          LogEventId.SystemSettingsRetrieved,
          assertDefined(await getUserRole()),
          { disposition: 'success' }
        );
        return settings || null;
      } catch (error) {
        await logger.log(
          LogEventId.SystemSettingsRetrieved,
          assertDefined(await getUserRole()),
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

    // use null instead of undefined because React Query does not allow
    // undefined as a query result
    getCurrentElectionMetadata(): Admin.ElectionRecord | null {
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

    listCastVoteRecordFilesOnUsb(
      input: { cvrImportFormat?: CvrImportFormat } = {}
    ) {
      const electionDefinition = getCurrentElectionDefinition(workspace);
      assert(electionDefinition);

      return listCastVoteRecordFilesOnUsb(
        electionDefinition,
        usb,
        logger,
        input.cvrImportFormat
      );
    },

    getCastVoteRecordFiles(): Admin.CastVoteRecordFileRecord[] {
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
        )
        .map((cvr) => ({
          ...cvr,
          // Strip out ballot images to keep the response size low, since
          // they're not needed client-side.
          _ballotImages: undefined,
        }));
    },

    async addCastVoteRecordFile(input: {
      path: string;
    }): Promise<AddCastVoteRecordFileResult> {
      const { path } = input;
      const userRole = assertDefined(await getUserRole());
      const filename = basename(path);
      let fileStat: Stats;
      try {
        fileStat = await fs.stat(path);
      } catch (error) {
        await logger.log(LogEventId.CvrLoaded, userRole, {
          message: `Failed to access cast vote record file for import.`,
          disposition: 'failure',
          filename,
          error: (error as Error).message,
          result: 'File not loaded, error shown to user.',
        });
        return err({
          type: 'invalid-file',
          userFriendlyMessage:
            'the selected file could not be opened by the system',
        });
      }

      // try to get the exported timestamp from the filename, other use use file last modified
      const exportedTimestamp =
        parseCastVoteRecordReportDirectoryName(basename(path))?.timestamp ||
        fileStat.mtime;

      const addFileResult = await store.addLegacyCastVoteRecordFile({
        electionId: loadCurrentElectionIdOrThrow(workspace),
        filePath: path,
        originalFilename: basename(path),
        exportedTimestamp: exportedTimestamp.toISOString(),
      });

      if (addFileResult.isErr()) {
        const errorMessage = addFileResult.err().userFriendlyMessage;
        await logger.log(LogEventId.CvrLoaded, userRole, {
          message: `Failed to load CVR file: ${errorMessage}`,
          disposition: 'failure',
          filename,
          error: errorMessage,
          result: 'File not loaded, error shown to user.',
        });
        return err({ type: 'invalid-record', ...addFileResult.err() });
      }

      if (addFileResult.ok().wasExistingFile) {
        // log failure if the file was a duplicate
        await logger.log(LogEventId.CvrLoaded, userRole, {
          message:
            'CVR file was not loaded as it is a duplicate of a previously loaded file.',
          disposition: 'failure',
          filename,
          result: 'File not loaded, error shown to user.',
        });
      } else {
        // log success otherwise
        await logger.log(LogEventId.CvrLoaded, userRole, {
          message: 'CVR file successfully loaded.',
          disposition: 'success',
          filename,
          numberOfBallotsImported: addFileResult.ok().newlyAdded,
          duplicateBallotsIgnored: addFileResult.ok().alreadyPresent,
        });
      }

      return addFileResult;
    },

    clearCastVoteRecordFiles(): void {
      const electionId = loadCurrentElectionIdOrThrow(workspace);
      store.deleteCastVoteRecordFiles(electionId);
      store.setElectionResultsOfficial(electionId, false);
    },

    getCastVoteRecordFileMode(): Admin.CvrFileMode {
      return store.getCurrentCvrFileModeForElection(
        loadCurrentElectionIdOrThrow(workspace)
      );
    },

    getWriteIns(
      input: {
        contestId?: ContestId;
        status?: Admin.WriteInAdjudicationStatus;
        limit?: number;
      } = {}
    ): Admin.WriteInRecord[] {
      return store.getWriteInRecords({
        electionId: loadCurrentElectionIdOrThrow(workspace),
        ...input,
      });
    },

    transcribeWriteIn(input: {
      writeInId: string;
      transcribedValue: string;
    }): void {
      store.transcribeWriteIn(input.writeInId, input.transcribedValue);
    },

    // not being used by frontend, can be removed if determined unnecessary
    getWriteInAdjudications(
      input: { contestId?: ContestId } = {}
    ): Admin.WriteInAdjudicationRecord[] {
      return store.getWriteInAdjudicationRecords({
        electionId: loadCurrentElectionIdOrThrow(workspace),
        contestId: input.contestId,
      });
    },

    createWriteInAdjudication(input: {
      contestId: ContestId;
      transcribedValue: string;
      adjudicatedValue: string;
      adjudicatedOptionId?: ContestOptionId;
    }): string {
      return store.createWriteInAdjudication({
        electionId: loadCurrentElectionIdOrThrow(workspace),
        ...input,
      });
    },

    updateWriteInAdjudication(input: {
      writeInAdjudicationId: string;
      adjudicatedValue: string;
      adjudicatedOptionId?: ContestOptionId;
    }) {
      store.updateWriteInAdjudication(input.writeInAdjudicationId, {
        ...input,
      });
    },

    deleteWriteInAdjudication(input: { writeInAdjudicationId: string }): void {
      store.deleteWriteInAdjudication(input.writeInAdjudicationId);
    },

    // frontend only using with status "adjudicated". this could be a more
    // targeted query if the other status filters are determined unnecessary
    getWriteInSummary(
      input: {
        contestId?: ContestId;
        status?: Admin.WriteInAdjudicationStatus;
      } = {}
    ): Admin.WriteInSummaryEntry[] {
      return store.getWriteInAdjudicationSummary({
        electionId: loadCurrentElectionIdOrThrow(workspace),
        ...input,
      });
    },

    getWriteInAdjudicationTable(input: {
      contestId: ContestId;
    }): Admin.WriteInAdjudicationTable {
      const { contestId } = input;
      const electionId = loadCurrentElectionIdOrThrow(workspace);
      const electionRecord = store.getElection(electionId);
      assert(electionRecord);

      const contest = electionRecord.electionDefinition.election.contests.find(
        (c): c is CandidateContest =>
          c.type === 'candidate' && c.id === contestId
      );
      assert(contest);

      const writeInSummaries = store
        .getWriteInAdjudicationSummary({
          electionId,
          contestId,
        })
        .filter(
          (s): s is Admin.WriteInSummaryEntryNonPending =>
            s.status !== 'pending'
        );

      return Admin.Views.writeInAdjudicationTable.render(
        contest,
        writeInSummaries
      );
    },

    getWriteInImage(input: { writeInId: string }): Admin.WriteInImageEntry[] {
      const castVoteRecordData = store.getCastVoteRecordForWriteIn(
        input.writeInId
      );
      assert(castVoteRecordData);

      const { contestId, optionId, electionId, cvr } = castVoteRecordData;

      const electionRecord = store.getElection(electionId);
      assert(electionRecord);

      const { election } = electionRecord.electionDefinition;

      const ballotStyle = getBallotStyle({
        ballotStyleId: cvr._ballotStyleId,
        election,
      });
      if (cvr._layouts === undefined || cvr._ballotImages === undefined) {
        return []; // The CVR does not have ballot images.
      }
      if (!ballotStyle) {
        throw new Error('unexpected types');
      }
      const allContestIdsForBallotStyle = getContests({
        ballotStyle,
        election,
      }).map((c) => c.id);
      const [layouts, ballotImages] = iter(cvr._layouts)
        .zip(cvr._ballotImages)
        .toArray()
        .sort(([a], [b]) => a.metadata.pageNumber - b.metadata.pageNumber)
        .reduce<[BallotPageLayout[], InlineBallotImage[]]>(
          ([layoutsAcc, ballotImagesAcc], [layout, ballotImage]) => [
            [...layoutsAcc, layout],
            [...ballotImagesAcc, ballotImage],
          ],
          [[], []]
        );
      let contestIdx = allContestIdsForBallotStyle.indexOf(contestId);
      let currentLayoutOptionIdx = 0;
      let currentLayout = layouts[currentLayoutOptionIdx];
      while (currentLayout && contestIdx >= currentLayout.contests.length) {
        // move to the next page, past the contests of the current page
        contestIdx -= currentLayout.contests.length;

        currentLayoutOptionIdx += 1;
        currentLayout = layouts[currentLayoutOptionIdx];
        if (!currentLayout) {
          throw new Error('unexpected types');
        }
      }
      currentLayout = layouts[currentLayoutOptionIdx];
      if (!currentLayout) {
        throw new Error('unexpected types');
      }
      const contestLayout =
        layouts[currentLayoutOptionIdx]?.contests[contestIdx];

      // Options are laid out from the bottom up, so we reverse write-ins to get the correct bounds
      const writeInOptions = contestLayout?.options
        .filter((option) => option.definition?.id.startsWith('write-in'))
        .reverse();

      const writeInOptionIndex = safeParseNumber(
        optionId.slice('write-in-'.length)
      );
      if (
        writeInOptionIndex.isErr() ||
        writeInOptions === undefined ||
        contestLayout === undefined
      ) {
        throw new Error('unexpected types');
      }
      const writeInLayout = writeInOptions[writeInOptionIndex.ok()];
      const currentBallotImage = ballotImages[currentLayoutOptionIdx];
      if (writeInLayout === undefined || currentBallotImage === undefined) {
        throw new Error('unexpected types');
      }
      const writeInBounds = writeInLayout.bounds;
      const contestBounds = contestLayout.bounds;
      const fullBallotBounds: Rect = {
        ...currentLayout.pageSize,
        x: 0,
        y: 0,
      };
      return [
        {
          image: currentBallotImage.normalized,
          ballotCoordinates: fullBallotBounds,
          contestCoordinates: contestBounds,
          writeInCoordinates: writeInBounds,
        },
      ];
    },

    getPrintedBallots(
      input: { ballotMode?: Admin.BallotMode } = {}
    ): Admin.PrintedBallotRecord[] {
      return store.getPrintedBallots(loadCurrentElectionIdOrThrow(workspace), {
        ...input,
      });
    },

    addPrintedBallots(input: { printedBallot: Admin.PrintedBallot }): string {
      return store.addPrintedBallot(
        loadCurrentElectionIdOrThrow(workspace),
        input.printedBallot
      );
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
  workspace,
  logger,
  usb,
}: {
  auth: DippedSmartCardAuthApi;
  workspace: Workspace;
  logger: Logger;
  usb: Usb;
}): Application {
  const app: Application = express();
  const api = buildApi({ auth, workspace, logger, usb });
  app.use('/api', grout.buildRouter(api, express));
  return app;
}
