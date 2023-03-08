import { Admin } from '@votingworks/api';
import { LogEventId, Logger, LogSource } from '@votingworks/logging';
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
} from '@votingworks/types';
import { assert, assertDefined, err, ok, zip } from '@votingworks/basics';
import express, { Application } from 'express';
import {
  DippedSmartCardAuthApi,
  DippedSmartCardAuthMachineState,
  DippedSmartCardAuth,
  MemoryCard,
} from '@votingworks/auth';
import { Server } from 'http';
import * as grout from '@votingworks/grout';
import { promises as fs, Stats } from 'fs';
import { basename } from 'path';
import { parseCvrFileInfoFromFilename } from '@votingworks/utils';
import { ADMIN_WORKSPACE, PORT } from './globals';
import { createWorkspace, Workspace } from './util/workspace';
import { AddCastVoteRecordFileResult, ConfigureResult } from './types';

function getMostRecentlyCreateElectionDefinition(
  workspace: Workspace
): Optional<ElectionDefinition> {
  const elections = workspace.store.getElections();
  const mostRecentlyCreatedElection =
    elections.length > 0
      ? elections.reduce((e1, e2) =>
          new Date(e1.createdAt) > new Date(e2.createdAt)
            ? /* istanbul ignore next */ e1
            : e2
        )
      : undefined;
  return mostRecentlyCreatedElection?.electionDefinition;
}

function constructDippedSmartCardAuthMachineState(
  workspace: Workspace
): DippedSmartCardAuthMachineState {
  // TODO: Once we actually support multiple elections, configure the auth instance with the
  // currently selected election rather than the most recently created. In fact, do so as soon as
  // the currently selected election is persisted on the backend instead of the frontend since,
  // even today, in dev, we can end up with multiple election definitions under the hood via
  // incognito windows
  const mostRecentlyCreatedElectionDefinition =
    getMostRecentlyCreateElectionDefinition(workspace);
  return {
    electionHash: mostRecentlyCreatedElectionDefinition?.electionHash,
  };
}

function loadCurrentElectionIdOrThrow(workspace: Workspace) {
  return assertDefined(workspace.store.getCurrentElectionId());
}

function buildApi({
  auth,
  workspace,
  logger,
}: {
  auth: DippedSmartCardAuthApi;
  workspace: Workspace;
  logger: Logger;
}) {
  const { store } = workspace;

  async function getUserRole() {
    const authStatus = await auth.getAuthStatus(
      constructDippedSmartCardAuthMachineState(workspace)
    );
    if (authStatus.status === 'logged_in') {
      return authStatus.user.role;
    }
    return undefined;
  }

  return grout.createApi({
    getAuthStatus() {
      return auth.getAuthStatus(
        constructDippedSmartCardAuthMachineState(workspace)
      );
    },

    checkPin(input: { pin: string }) {
      return auth.checkPin(
        constructDippedSmartCardAuthMachineState(workspace),
        input
      );
    },

    logOut() {
      return auth.logOut(constructDippedSmartCardAuthMachineState(workspace));
    },

    programCard({
      userRole,
    }: {
      userRole: 'system_administrator' | 'election_manager' | 'poll_worker';
    }) {
      const electionDefinition =
        getMostRecentlyCreateElectionDefinition(workspace);
      assert(electionDefinition !== undefined);
      const { electionData, electionHash } = electionDefinition;

      if (userRole === 'election_manager') {
        return auth.programCard(
          { electionHash },
          { userRole: 'election_manager', electionData }
        );
      }
      return auth.programCard({ electionHash }, { userRole });
    },

    unprogramCard() {
      return auth.unprogramCard(
        constructDippedSmartCardAuthMachineState(workspace)
      );
    },

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

    getCurrentElectionMetadata(): Optional<Admin.ElectionRecord> {
      const currentElectionId = store.getCurrentElectionId();
      if (currentElectionId) {
        const electionRecord = store.getElection(currentElectionId);
        assert(electionRecord);
        return electionRecord;
      }
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

      // try to get the exported timestamp from the filename
      let exportedTimestamp: Date = fileStat.mtime;
      try {
        const parsedFileInfo = parseCvrFileInfoFromFilename(basename(path));
        if (parsedFileInfo) {
          exportedTimestamp = parsedFileInfo.timestamp;
        }
      } catch {
        // file name was not in standard format, we'll try to import anyway
      }

      const addFileResult = await store.addCastVoteRecordFile({
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
      const [layouts, ballotImages] = [...zip(cvr._layouts, cvr._ballotImages)]
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
}: {
  auth: DippedSmartCardAuthApi;
  workspace: Workspace;
  logger: Logger;
}): Application {
  const app: Application = express();
  const api = buildApi({ auth, workspace, logger });
  app.use('/api', grout.buildRouter(api, express));
  return app;
}

/**
 * Options for starting the admin service.
 */
export interface StartOptions {
  app: Application;
  logger: Logger;
  port: number | string;
  workspace: Workspace;
}

/**
 * Starts the server with all the default options.
 */
export async function start({
  app,
  logger = new Logger(LogSource.VxAdminService),
  port = PORT,
  workspace,
}: Partial<StartOptions>): Promise<Server> {
  let resolvedWorkspace = workspace;

  if (workspace) {
    resolvedWorkspace = workspace;
  } else {
    const workspacePath = ADMIN_WORKSPACE;
    if (!workspacePath) {
      await logger.log(LogEventId.AdminServiceConfigurationMessage, 'system', {
        message:
          'workspace path could not be determined; pass a workspace or run with ADMIN_WORKSPACE',
        disposition: 'failure',
      });
      throw new Error(
        'workspace path could not be determined; pass a workspace or run with ADMIN_WORKSPACE'
      );
    }
    /* istanbul ignore next */
    resolvedWorkspace = createWorkspace(workspacePath);
  }

  // clear any cached data
  resolvedWorkspace.clearUploads();

  /* istanbul ignore next */
  const resolvedApp =
    app ??
    buildApp({
      auth: new DippedSmartCardAuth({
        card: new MemoryCard({ baseUrl: 'http://localhost:3001' }),
        config: {
          allowElectionManagersToAccessUnconfiguredMachines: false,
        },
        logger,
      }),
      workspace: resolvedWorkspace,
      logger,
    });

  const server = resolvedApp.listen(port, async () => {
    await logger.log(LogEventId.ApplicationStartup, 'system', {
      message: `Admin Service running at http://localhost:${port}/`,
      disposition: 'success',
    });
  });
  return server;
}
