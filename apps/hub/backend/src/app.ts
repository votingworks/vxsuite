import * as grout from '@votingworks/grout';
import * as Sentry from '@sentry/node';
import { auth as auth0Middleware } from 'express-openid-connect';
import path, { join } from 'node:path';
import { Buffer } from 'node:buffer';
import {
  type ElectionSerializationFormat,
  type ElectionId,
  CastVoteRecordExportFileName,
  safeParseJson,
  CastVoteRecordReportWithoutMetadataSchema,
  type PrecinctSelection,
  formatBallotHash,
  type PollingPlaceType,
  hasPartialRegisteredVoterCounts,
  getPrecinctsWithoutAbsenteePollingPlace,
  isCombinedBallotPrimary,
} from '@votingworks/types';
import express, { type Application } from 'express';
import {
  assert,
  assertDefined,
  err,
  extractErrorMessage,
  ok,
  type Optional,
  type Result,
  throwIllegalValue,
  wrapException,
} from '@votingworks/basics';
import { execFile } from '@votingworks/backend';
import { readFileSync } from 'node:fs';
import { z } from 'zod/v4';
import { LogEventId } from '@votingworks/logging';
import {
  getExportedCastVoteRecordIds,
  splitPerPrecinctTallyIntoSinglePrecinctTallies,
  decodeAndReadPerPrecinctCompressedTally,
} from '@votingworks/utils';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirSync, tmpNameSync } from 'tmp';
import {
  authenticateSignedQuickResultsReportingUrl,
  decryptAes256,
  decodeQuickResultsMessage,
} from '@votingworks/auth';
import {
  type MainExportTaskMetadata,
  type TestDecksTaskMetadata,
  type Store,
  type AggregatedLiveReportActivityLog,
  type AggregatedReportedPollsStatus,
  type AggregatedReportedResults,
  type ElectionListing,
  type ExportQaRun,
  type GetExportedElectionError,
  type Jurisdiction,
  type ReceivedReportInfo,
  type ResultsReportingError,
  type User,
  resultsReportingUrl,
  userCanAccessJurisdiction,
  getStateFeaturesConfig,
  getUserFeaturesConfig,
  type UserFeaturesConfig,
  buildBallotPreviewMethods,
  buildElectionDefinitionMethods,
  cloneElection,
} from '@votingworks/design-backend';
import type { AppContext } from './context.js';
import {
  auth0ClientId,
  auth0IssuerBaseUrl,
  auth0Secret,
  baseUrl,
  NODE_ENV,
  DEPLOY_ENV,
  authEnabled,
} from './globals.js';
import { convertMsElection } from './convert_ms_election.js';
import { QaConfig } from './qa_config.js';
import { rootDebug } from './debug.js';
import * as ttsStrings from './tts_strings.js';
import {
  convertMsResults,
  type ConvertMsResultsError,
} from './convert_ms_results.js';
import { logActivity } from './activity_logs.js';

const debug = rootDebug.extend('app');

export interface ApiContext {
  user: User;
}

export type AuthErrorCode =
  /**
   * The user is not logged in.
   */
  | 'auth:unauthorized'
  /**
   * The user is logged in, but does not have access to the requested resource.
   */
  | 'auth:forbidden';

class AuthError extends grout.UserError {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(code: AuthErrorCode) {
    super(code);
  }
}

function requireJurisdictionAccess(user: User, jurisdiction: Jurisdiction) {
  if (!userCanAccessJurisdiction(user, jurisdiction)) {
    throw new AuthError('auth:forbidden');
  }
}

async function isQaEnabledForElection(
  store: Store,
  electionId: ElectionId
): Promise<boolean> {
  const jurisdiction = await store.getElectionJurisdiction(electionId);
  return (
    QaConfig.fromEnv()?.isQaEnabledForOrganization(
      jurisdiction.organization.id
    ) ?? /* @coverage-defer */ false
  );
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function buildApi(ctx: AppContext) {
  const { auth0, logger, workspace, translator } = ctx;
  const { store } = workspace;
  const electionDefinitionMethods = buildElectionDefinitionMethods({
    store,
    convertMsElection,
  });
  const ballotPreviewMethods = buildBallotPreviewMethods({ store, translator });

  async function requireElectionAccess(user: User, electionId: ElectionId) {
    const electionJurisdiction =
      await store.getElectionJurisdiction(electionId);
    requireJurisdictionAccess(user, electionJurisdiction);
  }

  const middlewares: grout.Middlewares<ApiContext> = {
    before: [
      async function loadUser({ request, context }) {
        const userId = auth0.userIdFromRequest(request);
        if (!userId) {
          throw new AuthError('auth:unauthorized');
        }
        const user = assertDefined(
          await store.getUser(userId),
          `Auth0 user ${userId} not found in database`
        );
        return { ...context, user };
      },

      /**
       * All methods should check authorization. This middleware checks
       * authorization automatically for methods that have either `electionId`
       * or `jurisdictionId` in their input. If a method doesn't have either of
       * or has some other reason to handle authorization separately, it must be
       * listed in `methodsThatHandleAuthThemselves` within this function.
       */
      async function checkAuthorization({ methodName, input, context }) {
        if (input) {
          assert(context.user);
          if ('electionId' in input && typeof input.electionId === 'string') {
            await requireElectionAccess(context.user, input.electionId);
            return;
          }
          if (
            'jurisdictionId' in input &&
            typeof input.jurisdictionId === 'string'
          ) {
            const jurisdiction = await store.getJurisdiction(
              input.jurisdictionId
            );
            requireJurisdictionAccess(context.user, jurisdiction);
            return;
          }
        }
        const methodsThatHandleAuthThemselves = [
          'listJurisdictions',
          'listElections',
          'getUser',
          'getUserFeatures',
          'getResultsReportingUrl', // Doesn't need authorization, nothing private accessed
          'decryptCvrBallotAuditIds', // Doesn't need authorization, nothing private accessed
          'getBaseUrl', // Doesn't need authorization, nothing private accessed
          ...ttsStrings.methodsThatHandleAuthThemselves,
        ];
        assert(
          methodsThatHandleAuthThemselves.includes(methodName),
          `Auth info missing from input for API method \`${methodName}\`.
          Options:
            - Add (or move) an electionId field to the top-level input object.
            - Add (or move) an jurisdictionId field to the top-level input object.
            - Add '${methodName}' to the \`methodsThatHandleAuthThemselves\`
              array in src/app.ts.
        `
        );
      },
    ],

    after: [
      async function logApiCall({ methodName, input, context }, result) {
        const outcome = result.isOk()
          ? { disposition: 'success' }
          : {
              disposition: 'failure',
              error: extractErrorMessage(result.err()),
            };
        await logger.logAsCurrentRole(
          LogEventId.ApiCall,
          {
            methodName,
            input: JSON.stringify(input),
            userId: context.user?.id,
            userOrganizationId: context.user?.organization.id,
            userType: context.user?.type,
            userJurisdictionIds:
              context.user?.type === 'jurisdiction_user'
                ? context.user.jurisdictions
                    .map((jurisdiction) => jurisdiction.id)
                    .join(',')
                : '',
            ...outcome,
          },
          debug
        );
      },
    ],
  };

  const methods = {
    ...electionDefinitionMethods,
    ...ballotPreviewMethods,

    async listJurisdictions(
      _input: undefined,
      context: ApiContext
    ): Promise<Jurisdiction[]> {
      switch (context.user.type) {
        case 'jurisdiction_user':
          return context.user.jurisdictions;
        case 'organization_user':
          return store.listJurisdictions({
            organizationId: context.user.organization.id,
          });
        case 'support_user':
          return store.listJurisdictions();
        default: {
          throwIllegalValue(context.user);
        }
      }
    },

    async listElections(
      _input: undefined,
      context: ApiContext
    ): Promise<ElectionListing[]> {
      const jurisdictions = await methods.listJurisdictions(undefined, context);
      return store.listElections({
        jurisdictionIds: jurisdictions.map((jurisdiction) => jurisdiction.id),
      });
    },

    async cloneElection(
      input: {
        electionId: ElectionId;
        destElectionId: ElectionId;
        destJurisdictionId: string;
      },
      context: ApiContext
    ): Promise<ElectionId> {
      const destJurisdiction = await store.getJurisdiction(
        input.destJurisdictionId
      );
      requireJurisdictionAccess(context.user, destJurisdiction);
      await cloneElection(store, {
        sourceElectionId: input.electionId,
        destElectionId: input.destElectionId,
        destJurisdiction,
      });
      return input.destElectionId;
    },

    async finalizeBallots(
      input: { electionId: ElectionId },
      { user }: ApiContext
    ): Promise<void> {
      const precincts = await store.listPrecincts(input.electionId);

      const jurisdiction = await store.getElectionJurisdiction(
        input.electionId
      );
      const stateFeatures = getStateFeaturesConfig(jurisdiction);
      const { election } = await store.getElection(input.electionId);

      // @coverage-defer
      if (!stateFeatures.DISABLE_REGISTERED_VOTER_COUNTS) {
        const registeredVoterCounts = await store.getRegisteredVoterCounts(
          input.electionId
        );
        assert(
          !hasPartialRegisteredVoterCounts(precincts, registeredVoterCounts),
          'Registered voter counts must be provided for all precincts and splits or none'
        );
      }

      // When polling places are user-defined and this state does not allow
      // elections with no absentee polling places, the user-defined absentee
      // polling places must cover every precinct.
      if (
        !stateFeatures.OMIT_ABSENTEE_POLLING_PLACES &&
        stateFeatures.EDIT_POLLING_PLACES
      ) {
        assert(
          getPrecinctsWithoutAbsenteePollingPlace(
            election.precincts,
            election.pollingPlaces
          ).length === 0,
          'Absentee polling places must cover every precinct for central scanning'
        );
      }

      await store.createElectionPackageBackgroundTask({
        electionId: input.electionId,
        electionSerializationFormat: 'vxf',
        shouldExportAudio: !!stateFeatures.AUDIO_ENABLED,
        shouldExportSampleBallots: !!stateFeatures.EXPORT_SAMPLE_BALLOTS,
        shouldExportTestBallots: !!stateFeatures.EXPORT_TEST_BALLOTS,
      });

      // Test decks have not yet been updated to support combined ballot primaries
      if (
        stateFeatures.EXPORT_TEST_BALLOTS &&
        !isCombinedBallotPrimary(election)
      ) {
        await store.createTestDecksBackgroundTask(input.electionId, 'vxf');
      }

      await store.setBallotsFinalizedAt({
        electionId: input.electionId,
        finalizedAt: new Date(),
      });

      await logActivity(store, {
        type: 'finalize_ballot',
        userName: user.name,
        userType: user.type,
        electionId: input.electionId,
      });
    },

    async unfinalizeBallots(
      input: { electionId: ElectionId; reason: string },
      { user }: ApiContext
    ): Promise<void> {
      await store.setBallotsApprovedAt({
        approvedAt: null,
        electionId: input.electionId,
      });
      await store.setBallotsFinalizedAt({
        electionId: input.electionId,
        finalizedAt: null,
      });

      await logActivity(store, {
        type: 'unfinalize_ballot',
        userName: user.name,
        userType: user.type,
        electionId: input.electionId,
        reason: input.reason,
      });
    },

    getBallotsApprovedAt(input: {
      electionId: ElectionId;
    }): Promise<Date | null> {
      return store.getBallotsApprovedAt(input.electionId);
    },

    async approveBallots(
      input: { electionId: ElectionId },
      { user }: ApiContext
    ): Promise<void> {
      const finalizedAt = await store.getBallotsFinalizedAt(input.electionId);
      assert(finalizedAt, 'Ballots cannot be approved before being finalized');

      await store.setBallotsApprovedAt({
        approvedAt: new Date(),
        electionId: input.electionId,
      });

      await logActivity(store, {
        type: 'approve_ballot',
        userName: user.name,
        userType: user.type,
        electionId: input.electionId,
      });
    },

    getElectionPackage({
      electionId,
    }: {
      electionId: ElectionId;
    }): Promise<MainExportTaskMetadata> {
      return store.getElectionPackage(electionId);
    },

    exportElectionPackage(input: {
      electionId: ElectionId;
      electionSerializationFormat: ElectionSerializationFormat;
      shouldExportAudio?: boolean;
      shouldExportSampleBallots?: boolean;
      shouldExportTestBallots?: boolean;
      numAuditIdBallots?: number;
    }): Promise<void> {
      return store.createElectionPackageBackgroundTask(input);
    },

    async getLatestExportQaRun({
      electionId,
    }: {
      electionId: ElectionId;
    }): Promise<Optional<ExportQaRun>> {
      if (!(await isQaEnabledForElection(store, electionId))) {
        return undefined;
      }
      return await store.getLatestExportQaRunForElection(electionId);
    },

    // @coverage-defer
    getExportQaRun({
      qaRunId,
    }: {
      qaRunId: string;
    }): Promise<ExportQaRun | undefined> {
      return store.getExportQaRun(qaRunId);
    },

    getTestDecks({
      electionId,
    }: {
      electionId: ElectionId;
    }): Promise<TestDecksTaskMetadata> {
      return store.getTestDecks(electionId);
    },

    async exportTestDecks(input: {
      electionId: ElectionId;
      electionSerializationFormat: ElectionSerializationFormat;
    }): Promise<void> {
      return store.createTestDecksBackgroundTask(
        input.electionId,
        input.electionSerializationFormat
      );
    },

    getUser(_input: undefined, context: ApiContext): User {
      return context.user;
    },

    getUserFeatures(
      _input: undefined,
      context: ApiContext
    ): UserFeaturesConfig {
      return getUserFeaturesConfig(context.user);
    },

    getResultsReportingUrl(): string {
      return resultsReportingUrl();
    },

    async getLiveReportsSummary(input: {
      electionId: ElectionId;
    }): Promise<
      Result<AggregatedReportedPollsStatus, GetExportedElectionError>
    > {
      const exportedElectionDefinitionResult =
        await store.getExportedElectionDefinition(input.electionId);
      if (exportedElectionDefinitionResult.isErr()) {
        return err(exportedElectionDefinitionResult.err());
      }
      const { election, ballotHash } = exportedElectionDefinitionResult.ok();
      // Check if live data for ANY polling place has been reported, if so
      // we should return live results to the frontend.
      const isLive = await store.electionHasLiveReportData(
        election.id,
        ballotHash
      );
      const reportsByPollingPlace = await store.getPollsStatusForElection(
        ballotHash,
        isLive
      );
      return ok({
        ballotHash,
        reportsByPollingPlace,
        election,
        isLive,
      });
    },

    async getLiveReportsActivityLog(input: {
      electionId: ElectionId;
      votingGroup?: PollingPlaceType;
    }): Promise<
      Result<AggregatedLiveReportActivityLog, GetExportedElectionError>
    > {
      const exportedElectionDefinitionResult =
        await store.getExportedElectionDefinition(input.electionId);
      if (exportedElectionDefinitionResult.isErr()) {
        return err(exportedElectionDefinitionResult.err());
      }
      const { election, ballotHash } = exportedElectionDefinitionResult.ok();
      const isLive = await store.electionHasLiveReportData(
        election.id,
        ballotHash
      );
      const activityLog = await store.getAllReportsForElection(
        ballotHash,
        isLive,
        input.votingGroup
      );
      return ok({ activityLog });
    },

    async getLiveResultsReports(input: {
      electionId: ElectionId;
      precinctSelection: PrecinctSelection;
    }): Promise<Result<AggregatedReportedResults, GetExportedElectionError>> {
      const exportedElectionDefinitionResult =
        await store.getExportedElectionDefinition(input.electionId);
      if (exportedElectionDefinitionResult.isErr()) {
        return err(exportedElectionDefinitionResult.err());
      }
      const { election, ballotHash } = exportedElectionDefinitionResult.ok();
      // Check if live data for ANY precinct has been reported, if so we should
      // return live results to the frontend.
      const isLive = await store.electionHasLiveReportData(
        election.id,
        ballotHash
      );
      const { contestResults, machinesReporting } =
        await store.getLiveReportTalliesForElection(
          election,
          ballotHash,
          input.precinctSelection,
          isLive
        );
      return ok({
        ballotHash,
        contestResults,
        election,
        machinesReporting,
        isLive,
      });
    },

    async deleteQuickReportingResults(input: {
      electionId: ElectionId;
    }): Promise<void> {
      const electionRecord = await store.getElection(input.electionId);
      await store.deleteQuickReportingResultsForElection(
        electionRecord.election.id
      );
    },

    async convertMsResults(input: {
      electionId: ElectionId;
      allPrecinctsTallyReportContents: string;
    }): Promise<
      Result<
        { convertedResults: string; ballotHash: string },
        GetExportedElectionError | ConvertMsResultsError | Error
      >
    > {
      const exportedElectionDefinitionResult =
        await store.getExportedElectionDefinition(input.electionId);
      if (exportedElectionDefinitionResult.isErr()) {
        return exportedElectionDefinitionResult;
      }
      const electionDefinition = exportedElectionDefinitionResult.ok();
      try {
        const convertedResults = convertMsResults(
          electionDefinition,
          input.allPrecinctsTallyReportContents
        );
        if (convertedResults.isErr()) {
          return convertedResults;
        }
        return ok({
          convertedResults: convertedResults.ok(),
          ballotHash: formatBallotHash(electionDefinition.ballotHash),
        });
      } catch (error) {
        Sentry.captureException(error);
        // eslint-disable-next-line no-console
        console.error('Error converting MS results:', error);
        return wrapException(error);
      }
    },

    async decryptCvrBallotAuditIds(input: {
      cvrZipFileContents: Buffer;
      secretKey: string;
    }): Promise<Buffer> {
      const inputCvrZipPath = tmpNameSync();
      const inputCvrDirectory = dirSync().name;
      const outputDirectory = dirSync().name;
      const outputZipPath = tmpNameSync({ postfix: '.zip' });

      try {
        await writeFile(inputCvrZipPath, input.cvrZipFileContents);
        await execFile('unzip', [
          '-o',
          inputCvrZipPath,
          '-d',
          inputCvrDirectory,
        ]);

        // Navigate to the right sub-directory if necessary
        let cvrExportDirectory = inputCvrDirectory;
        const zipEntries = await readdir(cvrExportDirectory);
        // @coverage-exclude
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        if (zipEntries.length === 1 && zipEntries[0]!.startsWith('machine')) {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          cvrExportDirectory = path.join(cvrExportDirectory, zipEntries[0]!);
        }

        const cvrIds = await getExportedCastVoteRecordIds(cvrExportDirectory);
        assert(cvrIds.length > 0, 'No CVR IDs found in the input directory');

        const decryptedFilePaths = [];
        for (const cvrId of cvrIds) {
          const cvrContents = await readFile(
            path.join(
              cvrExportDirectory,
              cvrId,
              CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT
            ),
            'utf-8'
          );
          const cvrReport = safeParseJson(
            cvrContents,
            CastVoteRecordReportWithoutMetadataSchema
          ).unsafeUnwrap();
          assert(cvrReport.CVR?.length === 1);
          const cvr = assertDefined(cvrReport.CVR[0]);
          const decryptedBallotAuditId = await decryptAes256(
            input.secretKey,
            assertDefined(
              cvr.BallotAuditId,
              `Missing BallotAuditId in CVR: ${cvrId}`
            )
          );
          const decryptedFilePath = path.join(
            outputDirectory,
            `${decryptedBallotAuditId}.json`
          );
          await writeFile(
            decryptedFilePath,
            JSON.stringify(cvrReport, null, 2),
            'utf-8'
          );
          decryptedFilePaths.push(decryptedFilePath);
        }

        await execFile('zip', ['-j', outputZipPath, ...decryptedFilePaths]);
        return await readFile(outputZipPath);
      } finally {
        await execFile('rm', [
          '-rf',
          inputCvrZipPath,
          inputCvrDirectory,
          outputDirectory,
          outputZipPath,
        ]);
      }
    },

    getBaseUrl(): string {
      return baseUrl();
    },

    ...ttsStrings.apiMethods(ctx),
  } as const;

  return grout.createApi(methods, middlewares);
}

// Set up API endpoint that should NOT be behind oauth integration
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function buildUnauthenticatedApi({ logger, workspace }: AppContext) {
  const { store } = workspace;
  const middlewares: grout.Middlewares<grout.AnyContext> = {
    before: [],
    after: [
      async function logApiCall({ methodName, input }, result) {
        // @coverage-defer
        const outcome = result.isOk()
          ? { disposition: 'success' }
          : {
              disposition: 'failure',
              error: extractErrorMessage(result.err()),
            };
        await logger.logAsCurrentRole(
          LogEventId.ApiCall,
          {
            methodName,
            input: JSON.stringify(input),
            ...outcome,
          },
          debug
        );
      },
    ],
  };

  // Only add methods to this API that should be publicly accessible with no oauth integration.
  const methods = {
    async processQrCodeReport({
      payload,
      signature,
      certificate,
    }: {
      payload: string;
      signature: string;
      certificate: string;
    }): Promise<Result<ReceivedReportInfo, ResultsReportingError>> {
      // Verify the signature and certificate
      const validationResult = await authenticateSignedQuickResultsReportingUrl(
        payload,
        signature,
        certificate
      );
      if (validationResult.isErr()) {
        return err(validationResult.err());
      }

      try {
        const {
          ballotHash,
          machineId,
          isLive,
          pollsTransitionTime,
          encodedCompressedTally,
          pollingPlaceId,
          pollsTransitionType,
          ballotCount,
          numPages,
          pageIndex,
        } = decodeQuickResultsMessage(payload);

        const signedTimestamp = pollsTransitionTime;

        // First get the election ID for this hash
        const electionId = await store.getElectionIdFromBallotHash(ballotHash);
        if (!electionId) {
          return err('no-election-export-found');
        }

        // Get the exported election data and validate it
        const exportedElectionDefinitionResult =
          await store.getExportedElectionDefinition(electionId);
        // @coverage-defer
        if (exportedElectionDefinitionResult.isErr()) {
          return exportedElectionDefinitionResult;
        }
        const { election, ballotHash: exportedBallotHash } =
          exportedElectionDefinitionResult.ok();

        // Verify the ballot hash from the QR code matches the exported ballot hash
        assert(ballotHash === exportedBallotHash);

        // If this QR message is paginated (numPages > 1), then we either
        // store the partial page or assemble the final report when we receive
        // the last page.
        if (numPages > 1) {
          // Pagination only supported or necessary for polls closed reports
          assert(pollsTransitionType === 'close_polls');
          // Save the received page as a partial. This handles out-of-order
          // arrival: whenever we receive any page we save it and then check
          // whether we have all pages stored (by count). If so, assemble and
          // finalize; otherwise return early.
          await store.savePartialQuickResultsReportingPage({
            electionId,
            pollingPlaceId,
            ballotHash,
            encodedCompressedTally,
            machineId,
            isLive,
            signedTimestamp,
            pollsTransitionType,
            pageIndex,
            numPages,
          });

          const partials = await store.fetchPartialPages({
            ballotHash,
            machineId,
            isLive,
            pollsTransitionType,
          });

          const seenIndexes = new Set<number>();
          for (const partial of partials) {
            // Each partial should report the expected total number of pages
            assert(
              partial.numPages === numPages,
              `Partial page has unexpected numPages: ${partial.numPages} (expected ${numPages})`
            );
            assert(
              partial.pollingPlaceId === pollingPlaceId,
              `Partial page has unexpected pollingPlaceId: ${partial.pollingPlaceId} (expected ${pollingPlaceId})`
            );
            // Ensure pageIndex is an integer and in the valid 1..numPages range
            assert(
              partial.pageIndex >= 0 && partial.pageIndex < numPages,
              `Invalid pageIndex: ${partial.pageIndex} (expected 0..${
                numPages - 1
              })`
            );
            seenIndexes.add(partial.pageIndex);
          }

          // If we don't yet have all pages, return a minimal OK response.
          if (partials.length < numPages) {
            return ok({
              pollsTransitionType,
              ballotHash,
              machineId,
              isLive,
              pollsTransitionTime,
              pollingPlaceId,
              election,
              numPages,
              pageIndex,
              isPartial: true,
            });
          }
          // It should be impossible to have more than numPages partials
          assert(partials.length === numPages);
          assert(seenIndexes.size === numPages);

          // Sort a copy of partials by pageIndex to assemble in the correct order
          const sortedPartials = [...partials].sort(
            (a, b) => a.pageIndex - b.pageIndex
          );

          const allBuffers = sortedPartials.map((p) =>
            Buffer.from(p.encodedCompressedTally, 'base64url')
          );
          const combinedBuffer = Buffer.concat(allBuffers);
          const allEncoded = combinedBuffer.toString('base64url');

          const perPrecinctTallies =
            splitPerPrecinctTallyIntoSinglePrecinctTallies(
              election,
              allEncoded
            );

          // Save the final assembled report.
          await store.saveQuickResultsReportingTally({
            electionId,
            pollingPlaceId,
            ballotHash,
            machineId,
            isLive,
            signedTimestamp,
            pollsTransitionType,
            perPrecinctTallies,
          });

          const contestResultsByPrecinct =
            decodeAndReadPerPrecinctCompressedTally({
              election,
              encodedTally: allEncoded,
            });

          return ok({
            pollsTransitionType,
            ballotHash,
            machineId,
            isLive,
            pollsTransitionTime,
            contestResultsByPrecinct,
            pollingPlaceId,
            election,
            isPartial: false,
          });
        }

        // Non-paginated path
        switch (pollsTransitionType) {
          case 'close_polls': {
            const perPrecinctTallies =
              splitPerPrecinctTallyIntoSinglePrecinctTallies(
                election,
                encodedCompressedTally
              );

            await store.saveQuickResultsReportingTally({
              electionId,
              pollingPlaceId,
              ballotHash,
              machineId,
              isLive,
              signedTimestamp,
              pollsTransitionType,
              perPrecinctTallies,
            });

            const contestResultsByPrecinct =
              decodeAndReadPerPrecinctCompressedTally({
                election,
                encodedTally: encodedCompressedTally,
              });
            return ok({
              pollsTransitionType,
              ballotHash,
              machineId,
              isLive,
              pollsTransitionTime,
              contestResultsByPrecinct,
              pollingPlaceId,
              election,
              isPartial: false,
            });
          }
          case 'open_polls':
          case 'pause_voting':
          case 'resume_voting': {
            await store.saveQuickResultsReportingTally({
              electionId,
              pollingPlaceId,
              ballotHash,
              machineId,
              isLive,
              signedTimestamp,
              pollsTransitionType,
              perPrecinctTallies: [],
            });

            return ok({
              pollsTransitionType,
              ballotHash,
              machineId,
              isLive,
              pollsTransitionTime,
              pollingPlaceId,
              election,
              isPartial: false,
              ballotCount,
            });
          }
          default:
            throwIllegalValue(pollsTransitionType);
        }
      } catch {
        return err('invalid-payload');
      }
    },
  } as const;

  return grout.createApi(methods, middlewares);
}

export type Api = ReturnType<typeof buildApi>;
export type UnauthenticatedApi = ReturnType<typeof buildUnauthenticatedApi>;

export function buildApp(context: AppContext): Application {
  const app: Application = express();

  // @coverage-exclude
  if (authEnabled()) {
    app.use(
      auth0Middleware({
        authRequired: false,
        // eslint-disable-next-line vx/gts-identifiers
        baseURL: baseUrl(),
        // eslint-disable-next-line vx/gts-identifiers
        clientID: auth0ClientId(),
        enableTelemetry: false,
        // eslint-disable-next-line vx/gts-identifiers
        issuerBaseURL: auth0IssuerBaseUrl(),
        routes: {
          callback: 'auth/callback',
          login: 'auth/login',
          logout: 'auth/logout',
        },
        secret: auth0Secret(),
        // Log out the user from Auth0 when they log out of the app. This
        // prevents a loop where the user gets automatically logged back in
        // after logging out.
        idpLogout: true,
      })
    );
  }

  app.get('/files/:jurisdictionId/:fileName', async (req, res, next) => {
    try {
      const userId = context.auth0.userIdFromRequest(req);
      if (!userId) {
        throw new AuthError('auth:unauthorized');
      }
      const user = assertDefined(await context.workspace.store.getUser(userId));
      const { jurisdictionId, fileName } = req.params;
      const jurisdiction =
        await context.workspace.store.getJurisdiction(jurisdictionId);
      requireJurisdictionAccess(user, jurisdiction);

      const readResult = await context.fileStorageClient.readFile(
        join(jurisdictionId, fileName)
      );
      const file = readResult.unsafeUnwrap();
      // @coverage-defer
      file.pipe(res);
    } catch (error) {
      // Mimic grout's error handling
      const message = extractErrorMessage(error);
      const statusCode = error instanceof grout.UserError ? 400 : 500;
      res.status(statusCode).json({ message });
      if (!(error instanceof grout.UserError)) {
        // eslint-disable-next-line no-console
        console.error(error); // To aid debugging, log the full error with stack trace
        next(error);
      }
    }
  });

  // CircleCI QA webhook endpoint (unauthenticated but requires secret)
  app.post('/api/export-qa-webhook/:qaRunId', async (req, res, next) => {
    try {
      const { qaRunId } = req.params;
      const webhookSecret = QaConfig.fromEnv()?.webhookSecret;

      // Validate webhook secret
      const providedSecret = req.headers['x-webhook-secret'];
      if (!webhookSecret || providedSecret !== webhookSecret) {
        context.logger.log(LogEventId.UnknownError, 'unknown', {
          message: 'Invalid webhook secret',
          qaRunId,
        });
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Validate QA run exists
      const qaRun = await context.workspace.store.getExportQaRun(qaRunId);
      if (!qaRun) {
        res.status(404).json({ error: 'QA run not found' });
        return;
      }

      // Parse and validate request body
      const UpdateQaRunStatusSchema = z.object({
        status: z.enum(['pending', 'in_progress', 'success', 'failure']),
        statusMessage: z.string().optional(),
        resultsUrl: z.string().optional(),
        circleCiWorkflowId: z.string().optional(),
        jobUrl: z.string().optional(),
      });

      if (!req.header('content-type')?.startsWith('application/json')) {
        res.status(406).json({ error: 'Expected JSON request' });
        return;
      }

      const body = await new Promise<string>((resolve, reject) => {
        let chunks = '';
        req.setEncoding('utf8');

        req.on('readable', () => {
          const chunk = req.read();
          // @coverage-defer
          if (chunk) chunks += chunk.toString();
        });

        req.on('end', () => {
          resolve(chunks);
        });

        req.on('error', reject);
      });

      const parseResult = safeParseJson(body, UpdateQaRunStatusSchema);

      if (parseResult.isErr()) {
        res.status(400).json({ error: 'Invalid request body' });
        return;
      }

      const updateParams = parseResult.ok();

      context.logger.log(LogEventId.ApplicationStartup, 'system', {
        message: 'Received QA run status update',
        qaRunId,
        status: updateParams.status,
        electionId: qaRun.electionId,
      });

      // Update QA run status
      await context.workspace.store.updateExportQaRunStatus(
        qaRunId,
        updateParams
      );

      context.logger.log(LogEventId.ApplicationStartup, 'system', {
        message: 'QA run status updated',
        qaRunId,
        status: updateParams.status,
        electionId: qaRun.electionId,
      });

      res.json({ success: true });
    } catch (error) {
      const message = extractErrorMessage(error);
      context.logger.log(LogEventId.UnknownError, 'system', {
        message: 'Error processing QA webhook',
        error: message,
      });
      res.status(500).json({ error: message });
      // eslint-disable-next-line no-console
      console.error(error);
      next(error);
    }
  });

  const api = buildApi(context);
  app.use(
    '/api',
    grout.buildRouter(api, express, {
      invalidInputBehavior: 'error',
    })
  );

  const unauthenticatedApi = buildUnauthenticatedApi(context);
  app.use(
    '/public/api',
    grout.buildRouter(unauthenticatedApi, express, {
      invalidInputBehavior: 'error',
    })
  );

  app.use(
    express.static(context.workspace.assetDirectoryPath, { index: false })
  );

  // Serve the index.html file for everything else, adding in some environment variables
  // (we don't need a full templating engine since it's just a couple of variables)
  const indexFileContents =
    // @coverage-defer
    NODE_ENV === 'test'
      ? ''
      : readFileSync(
          join(context.workspace.assetDirectoryPath, 'index.html'),
          'utf8'
        )
          .replace('{{ SENTRY_DSN }}', process.env.SENTRY_DSN ?? '')
          .replace('{{ DEPLOY_ENV }}', DEPLOY_ENV);
  // @coverage-defer
  app.get('*', (_req, res) => {
    res.send(indexFileContents);
  });

  Sentry.setupExpressErrorHandler(app);
  return app;
}
