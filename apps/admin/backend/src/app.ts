import { Admin } from '@votingworks/api';
import { LogEventId, Logger } from '@votingworks/logging';
import {
  BallotPageContestLayout,
  BallotPageLayout,
  CandidateContest,
  CastVoteRecord,
  ContestId,
  ContestOptionId,
  ElectionDefinition,
  InlineBallotImage,
  safeParseElectionDefinition,
  safeParseJson,
  safeParseNumber,
  SystemSettings,
  SystemSettingsSchema,
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
} from '@votingworks/auth';
import * as grout from '@votingworks/grout';
import { promises as fs, Stats } from 'fs';
import { basename, dirname } from 'path';
import {
  CAST_VOTE_RECORD_REPORT_FILENAME,
  parseCastVoteRecordReportDirectoryName,
} from '@votingworks/utils';
import { ConfigureResult, SetSystemSettingsResult } from './types';
import { Workspace } from './util/workspace';
import {
  AddCastVoteRecordReportError,
  addCastVoteRecordReport,
  getAddCastVoteRecordReportErrorMessage,
  listCastVoteRecordFilesOnUsb,
} from './cvr_files';
import { Usb } from './util/usb';
import { getMachineConfig } from './machine_config';

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
  const systemSettings = workspace.store.getSystemSettings();
  const currentElectionDefinition = getCurrentElectionDefinition(workspace);
  return {
    arePollWorkerCardPinsEnabled: systemSettings?.arePollWorkerCardPinsEnabled,
    electionHash: currentElectionDefinition?.electionHash,
    jurisdiction: process.env.VX_MACHINE_JURISDICTION ?? DEV_JURISDICTION,
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

    listCastVoteRecordFilesOnUsb() {
      const electionDefinition = getCurrentElectionDefinition(workspace);
      assert(electionDefinition);

      return listCastVoteRecordFilesOnUsb(electionDefinition, usb, logger);
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
    }): Promise<
      Result<
        Admin.CvrFileImportInfo,
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
      const { contestId, optionId, cvr } = castVoteRecordData;
      if (cvr._layouts === undefined || cvr._ballotImages === undefined) {
        return []; // The CVR does not have ballot images.
      }

      // Identify the page layout, contest layout, and associated image.
      let pageLayout: Optional<BallotPageLayout>;
      let contestLayout: Optional<BallotPageContestLayout>;
      let ballotImage: InlineBallotImage | null | undefined;
      for (const [index, layout] of cvr._layouts.entries()) {
        if (layout === null) continue;

        const foundContestLayout = layout.contests.find(
          (contest) => contest.contestId === contestId
        );
        if (foundContestLayout) {
          pageLayout = layout;
          contestLayout = foundContestLayout;
          ballotImage = cvr._ballotImages[index];
          continue;
        }
      }
      if (!pageLayout || !contestLayout) {
        throw new Error('unable to find a layout for the specified contest');
      }
      if (!ballotImage) {
        throw new Error('no ballot image associated with the ballot layout');
      }

      // Identify the write-in option layout
      const writeInOptions = contestLayout.options.filter((option) =>
        option.definition?.id.startsWith('write-in')
      );
      const writeInOptionIndex = safeParseNumber(
        optionId.slice('write-in-'.length)
      );
      if (writeInOptionIndex.isErr() || writeInOptions === undefined) {
        throw new Error('unable to interpret layout write-in options');
      }
      const writeInLayout = writeInOptions[writeInOptionIndex.ok()];
      if (writeInLayout === undefined) {
        throw new Error('unexpected write-in option index');
      }

      return [
        {
          image: ballotImage.normalized,
          ballotCoordinates: {
            ...pageLayout.pageSize,
            x: 0,
            y: 0,
          },
          contestCoordinates: contestLayout.bounds,
          writeInCoordinates: writeInLayout.bounds,
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
