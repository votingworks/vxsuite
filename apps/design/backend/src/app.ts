import * as grout from '@votingworks/grout';
import * as Sentry from '@sentry/node';
import { auth as auth0Middleware } from 'express-openid-connect';
import path, { join } from 'node:path';
import { Buffer } from 'node:buffer';
import {
  BallotMode,
  Election,
  HmpbBallotPaperSize,
  SystemSettings,
  BallotType,
  ElectionSerializationFormat,
  ElectionId,
  BallotStyleId,
  ElectionIdSchema,
  DateWithoutTimeSchema,
  unsafeParse,
  LanguageCodeSchema,
  getAllBallotLanguages,
  Precinct,
  District,
  DistrictSchema,
  DistrictId,
  PrecinctId,
  Party,
  PartySchema,
  AnyContest,
  AnyContestSchema,
  HmpbBallotPaperSizeSchema,
  SystemSettingsSchema,
  PrecinctSchema,
  CastVoteRecordExportFileName,
  safeParseJson,
  CastVoteRecordReportWithoutMetadataSchema,
  PrecinctSelection,
  safeParseElection,
  BallotStyle,
  formatBallotHash,
} from '@votingworks/types';
import express, { Application } from 'express';
import {
  assert,
  assertDefined,
  DateWithoutTime,
  err,
  extractErrorMessage,
  find,
  ok,
  Result,
  throwIllegalValue,
  wrapException,
} from '@votingworks/basics';
import {
  BallotLayoutError,
  BallotTemplateId,
  ballotTemplates,
  createPlaywrightRenderer,
  hmpbStringsCatalog,
  renderBallotPreviewToPdf,
} from '@votingworks/hmpb';
import { translateBallotStrings, execFile } from '@votingworks/backend';
import { readFileSync } from 'node:fs';
import { z } from 'zod/v4';
import { LogEventId } from '@votingworks/logging';
import {
  getExportedCastVoteRecordIds,
  decodeAndReadCompressedTally,
  maybeGetPrecinctIdFromSelection,
} from '@votingworks/utils';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirSync, tmpNameSync } from 'tmp';
import {
  authenticateSignedQuickResultsReportingUrl,
  decryptAes256,
  decodeQuickResultsMessage,
} from '@votingworks/auth';
import {
  BackgroundTaskMetadata,
  DuplicateContestError,
  DuplicateDistrictError,
  DuplicateDistrictErrorCode,
  DuplicateElectionError,
  DuplicatePartyError,
  DuplicatePartyErrorCode,
  DuplicatePrecinctError,
} from './store';
import {
  AggregatedReportedPollsStatus,
  AggregatedReportedResults,
  ElectionInfo,
  ElectionListing,
  GetExportedElectionError,
  ElectionUpload,
  Jurisdiction,
  ReceivedReportInfo,
  ResultsReportingError,
  User,
} from './types';
import { AppContext } from './context';
import {
  auth0ClientId,
  auth0IssuerBaseUrl,
  auth0Secret,
  baseUrl,
  NODE_ENV,
  DEPLOY_ENV,
  authEnabled,
} from './globals';
import { createBallotPropsForTemplate, defaultBallotTemplate } from './ballots';
import {
  getBallotPdfFileName,
  regenerateElectionIds,
  splitCandidateName,
  userCanAccessJurisdiction,
} from './utils';
import {
  StateFeaturesConfig,
  getStateFeaturesConfig,
  getUserFeaturesConfig,
  UserFeaturesConfig,
} from './features';
import { rootDebug } from './debug';
import * as ttsStrings from './tts_strings';
import { convertMsElection } from './convert_ms_election';
import { convertMsResults, ConvertMsResultsError } from './convert_ms_results';

const debug = rootDebug.extend('app');

export function createBlankElection(
  id: ElectionId,
  jurisdiction: Jurisdiction
): Election {
  return {
    id,
    type: 'general',
    title: '',
    date: DateWithoutTime.today(),
    state: jurisdiction.stateCode,
    county: {
      id: 'county-id',
      name: jurisdiction.name,
    },
    seal: '',
    districts: [],
    precincts: [],
    contests: [],
    parties: [],
    ballotStyles: [],
    ballotLayout: {
      paperSize: HmpbBallotPaperSize.Letter,
      metadataEncoding: 'qr-code',
    },
    ballotStrings: {},
  };
}

const TextInput = z
  .string()
  .transform((s) => s.trim())
  .refine((s) => s.length > 0);

const UpdateElectionInfoInputSchema = z.object({
  electionId: ElectionIdSchema,
  type: z.union([z.literal('general'), z.literal('primary')]),
  date: DateWithoutTimeSchema,
  title: TextInput,
  state: TextInput,
  countyName: TextInput,
  seal: z.string(),
  signatureImage: z.string().optional(),
  signatureCaption: z.string().optional(),
  languageCodes: z.array(LanguageCodeSchema),
});

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

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function buildApi(ctx: AppContext) {
  const { auth0, logger, workspace, translator } = ctx;
  const { store } = workspace;

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
          'getBaseUrl',
          'decryptCvrBallotAuditIds', // Doesn't need authorization, nothing private accessed
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
          /* istanbul ignore next - @preserve */
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

    async loadElection(input: {
      upload: ElectionUpload;
      newId: ElectionId;
      jurisdictionId: string;
    }): Promise<Result<ElectionId, Error>> {
      try {
        const election: Election = (() => {
          switch (input.upload.format) {
            case 'vxf': {
              const sourceElection = safeParseElection(
                input.upload.electionFileContents
              ).unsafeUnwrap();
              const { districts, precincts, parties, contests } =
                regenerateElectionIds(sourceElection);
              // Split candidate names into first, middle, and last names, if they are
              // not already split
              const contestsWithSplitCandidateNames = contests.map(
                (contest) => {
                  if (contest.type !== 'candidate') return contest;
                  return {
                    ...contest,
                    candidates: contest.candidates.map((candidate) => {
                      if (
                        candidate.firstName !== undefined &&
                        candidate.middleName !== undefined &&
                        candidate.lastName !== undefined
                      ) {
                        return candidate;
                      }
                      return {
                        ...candidate,
                        ...splitCandidateName(candidate.name),
                      };
                    }),
                  };
                }
              );
              return {
                ...sourceElection,
                id: input.newId,
                county: {
                  ...sourceElection.county,
                  // County ID needs to be deterministic, but doesn't actually get used anywhere
                  countyId: `${input.newId}-county`,
                },
                districts,
                precincts,
                parties,
                contests: contestsWithSplitCandidateNames,
                // Remove any existing ballot styles/grid layouts so we can generate our own
                ballotStyles: [],
                gridLayouts: undefined,
                // Fill in a blank seal if none is provided
                seal: sourceElection.seal ?? '',
                signature: sourceElection.signature,
              };
            }

            case 'ms-sems': {
              return convertMsElection(
                input.newId,
                input.upload.electionFileContents,
                input.upload.candidateFileContents
              );
            }

            default: {
              /* istanbul ignore next - @preserve */
              return throwIllegalValue(input.upload);
            }
          }
        })();
        const jurisdiction = await store.getJurisdiction(input.jurisdictionId);
        await store.createElection({
          jurisdictionId: input.jurisdictionId,
          election,
          ballotTemplateId: defaultBallotTemplate(jurisdiction),
        });
        return ok(election.id);
      } catch (error) {
        return wrapException(error);
      }
    },

    async createElection(input: {
      id: ElectionId;
      jurisdictionId: string;
    }): Promise<Result<ElectionId, Error>> {
      const jurisdiction = await store.getJurisdiction(input.jurisdictionId);
      const election = createBlankElection(input.id, jurisdiction);
      await store.createElection({
        jurisdictionId: input.jurisdictionId,
        election,
        ballotTemplateId: defaultBallotTemplate(jurisdiction),
      });
      return ok(election.id);
    },

    async cloneElection(
      input: {
        electionId: ElectionId;
        destElectionId: ElectionId;
        destJurisdictionId: string;
      },
      context: ApiContext
    ): Promise<ElectionId> {
      const {
        election: sourceElection,
        ballotTemplateId,
        systemSettings,
      } = await store.getElection(input.electionId);

      const destJurisdiction = await store.getJurisdiction(
        input.destJurisdictionId
      );
      requireJurisdictionAccess(context.user, destJurisdiction);

      const { districts, precincts, parties, contests } =
        regenerateElectionIds(sourceElection);
      const election: Election = {
        ...sourceElection,
        id: input.destElectionId,
        districts,
        precincts,
        parties,
        contests,
      };
      await store.createElection({
        jurisdictionId: input.destJurisdictionId,
        election,
        ballotTemplateId,
        systemSettings,
      });
      return input.destElectionId;
    },

    async getElectionInfo(input: {
      electionId: ElectionId;
    }): Promise<ElectionInfo> {
      const { election, ballotLanguageConfigs, jurisdictionId } =
        await store.getElection(input.electionId);
      return {
        jurisdictionId,
        electionId: election.id,
        title: election.title,
        date: election.date,
        type: election.type,
        state: election.state,
        countyName: election.county.name,
        seal: election.seal,
        signatureImage: election.signature?.image,
        signatureCaption: election.signature?.caption,
        // Not optimal: store.getElection converts from LanguageCode[] to BallotLanguageConfig.
        // This line converts from BallotLanguageConfig to LanguageCode[]
        languageCodes: getAllBallotLanguages(ballotLanguageConfigs),
      };
    },

    async updateElectionInfo(
      input: ElectionInfo
    ): Promise<Result<void, DuplicateElectionError>> {
      const electionInfo = unsafeParse(UpdateElectionInfoInputSchema, input);
      return store.updateElectionInfo(electionInfo);
    },

    async listDistricts(input: {
      electionId: ElectionId;
    }): Promise<readonly District[]> {
      return store.listDistricts(input.electionId);
    },

    // [TODO] Remove after client is moved to batch editing.
    async createDistrict(input: {
      electionId: ElectionId;
      newDistrict: District;
    }): Promise<Result<void, DuplicateDistrictErrorCode>> {
      const district = unsafeParse(DistrictSchema, input.newDistrict);
      const res = await store.createDistrict(input.electionId, district);

      return res.isErr() ? err(res.err().code) : res;
    },

    // [TODO] Remove after client is moved to batch editing.
    async updateDistrict(input: {
      electionId: ElectionId;
      updatedDistrict: District;
    }): Promise<Result<void, DuplicateDistrictErrorCode>> {
      const district = unsafeParse(DistrictSchema, input.updatedDistrict);
      const res = await store.updateDistrict(input.electionId, district);

      return res.isErr() ? err(res.err().code) : res;
    },

    // [TODO] Remove after client is moved to batch editing.
    async deleteDistrict(input: {
      electionId: ElectionId;
      districtId: DistrictId;
    }): Promise<void> {
      await store.deleteDistrict(input.electionId, input.districtId);
    },

    async updateDistricts(input: {
      electionId: ElectionId;
      deletedDistrictIds?: string[];
      newDistricts?: District[];
      updatedDistricts?: District[];
    }): Promise<Result<void, DuplicateDistrictError>> {
      return store.updateDistricts(input);
    },

    async listPrecincts(input: {
      electionId: ElectionId;
    }): Promise<readonly Precinct[]> {
      return store.listPrecincts(input.electionId);
    },

    async createPrecinct(input: {
      electionId: ElectionId;
      newPrecinct: Precinct;
    }): Promise<Result<void, DuplicatePrecinctError>> {
      const precinct = unsafeParse(PrecinctSchema, input.newPrecinct);
      return store.createPrecinct(input.electionId, precinct);
    },

    async updatePrecinct(input: {
      electionId: ElectionId;
      updatedPrecinct: Precinct;
    }): Promise<Result<void, DuplicatePrecinctError>> {
      const precinct = unsafeParse(PrecinctSchema, input.updatedPrecinct);
      return store.updatePrecinct(input.electionId, precinct);
    },

    async deletePrecinct(input: {
      electionId: ElectionId;
      precinctId: PrecinctId;
    }): Promise<void> {
      await store.deletePrecinct(input.electionId, input.precinctId);
    },

    async listBallotStyles(input: {
      electionId: ElectionId;
    }): Promise<readonly BallotStyle[]> {
      return store.listBallotStyles(input.electionId);
    },

    async listParties(input: {
      electionId: ElectionId;
    }): Promise<readonly Party[]> {
      return store.listParties(input.electionId);
    },

    // [TODO] Remove after client is moved to batch editing.
    async createParty(input: {
      electionId: ElectionId;
      newParty: Party;
    }): Promise<Result<void, DuplicatePartyErrorCode>> {
      const party = unsafeParse(PartySchema, input.newParty);
      const res = await store.createParty(input.electionId, party);

      return res.isErr() ? err(res.err().code) : res;
    },

    // [TODO] Remove after client is moved to batch editing.
    async updateParty(input: {
      electionId: ElectionId;
      updatedParty: Party;
    }): Promise<Result<void, DuplicatePartyErrorCode>> {
      const party = unsafeParse(PartySchema, input.updatedParty);
      const res = await store.updateParty(input.electionId, party);

      return res.isErr() ? err(res.err().code) : res;
    },

    // [TODO] Remove after client is moved to batch editing.
    async deleteParty(input: {
      electionId: ElectionId;
      partyId: string;
    }): Promise<void> {
      await store.deleteParty(input.electionId, input.partyId);
    },

    async updateParties(input: {
      electionId: ElectionId;
      deletedPartyIds?: string[];
      newParties?: Party[];
      updatedParties?: Party[];
    }): Promise<Result<void, DuplicatePartyError>> {
      return store.updateParties(input);
    },

    async listContests(input: {
      electionId: ElectionId;
    }): Promise<readonly AnyContest[]> {
      return store.listContests(input.electionId);
    },

    async createContest(input: {
      electionId: ElectionId;
      newContest: AnyContest;
    }): Promise<Result<void, DuplicateContestError>> {
      const contest = unsafeParse(AnyContestSchema, input.newContest);
      return store.createContest(input.electionId, contest);
    },

    async updateContest(input: {
      electionId: ElectionId;
      updatedContest: AnyContest;
    }): Promise<Result<void, DuplicateContestError>> {
      const contest = unsafeParse(AnyContestSchema, input.updatedContest);
      return store.updateContest(input.electionId, contest);
    },

    async reorderContests(input: {
      electionId: ElectionId;
      contestIds: string[];
    }): Promise<void> {
      await store.reorderContests(input.electionId, input.contestIds);
    },

    async deleteContest(input: {
      electionId: ElectionId;
      contestId: string;
    }): Promise<void> {
      await store.deleteContest(input.electionId, input.contestId);
    },

    async getBallotLayoutSettings(input: {
      electionId: ElectionId;
    }): Promise<{ paperSize: HmpbBallotPaperSize; compact: boolean }> {
      return store.getBallotLayoutSettings(input.electionId);
    },

    async updateBallotLayoutSettings(input: {
      electionId: ElectionId;
      paperSize: HmpbBallotPaperSize;
      compact: boolean;
    }): Promise<void> {
      const paperSize = unsafeParse(HmpbBallotPaperSizeSchema, input.paperSize);
      await store.updateBallotLayoutSettings(
        input.electionId,
        paperSize,
        input.compact
      );
    },

    async getSystemSettings(input: {
      electionId: ElectionId;
    }): Promise<SystemSettings> {
      return store.getSystemSettings(input.electionId);
    },

    async updateSystemSettings(input: {
      electionId: ElectionId;
      systemSettings: SystemSettings;
    }): Promise<void> {
      const systemSettings = unsafeParse(
        SystemSettingsSchema,
        input.systemSettings
      );
      return store.updateSystemSettings(input.electionId, systemSettings);
    },

    deleteElection(input: { electionId: ElectionId }): Promise<void> {
      return store.deleteElection(input.electionId);
    },

    getBallotsFinalizedAt(input: {
      electionId: ElectionId;
    }): Promise<Date | null> {
      return store.getBallotsFinalizedAt(input.electionId);
    },

    finalizeBallots(input: { electionId: ElectionId }): Promise<void> {
      return store.setBallotsFinalizedAt({
        electionId: input.electionId,
        finalizedAt: new Date(),
      });
    },

    unfinalizeBallots(input: { electionId: ElectionId }): Promise<void> {
      return store.setBallotsFinalizedAt({
        electionId: input.electionId,
        finalizedAt: null,
      });
    },

    async getBallotPreviewPdf(input: {
      electionId: ElectionId;
      precinctId: string;
      ballotStyleId: BallotStyleId;
      ballotType: BallotType;
      ballotMode: BallotMode;
    }): Promise<
      Result<{ pdfData: Uint8Array; fileName: string }, BallotLayoutError>
    > {
      const { election, ballotLanguageConfigs, ballotTemplateId } =
        await store.getElection(input.electionId);
      const { compact } = await store.getBallotLayoutSettings(input.electionId);
      const ballotStrings = await translateBallotStrings(
        translator,
        election,
        hmpbStringsCatalog,
        ballotLanguageConfigs
      );
      const electionWithBallotStrings: Election = {
        ...election,
        ballotStrings,
      };
      const allBallotProps = createBallotPropsForTemplate(
        ballotTemplateId,
        electionWithBallotStrings,
        compact
      );
      const ballotProps = find(
        allBallotProps,
        (props) =>
          props.precinctId === input.precinctId &&
          props.ballotStyleId === input.ballotStyleId &&
          props.ballotType === input.ballotType &&
          props.ballotMode === input.ballotMode
      );
      const renderer = await createPlaywrightRenderer();
      let ballotPdf: Result<Uint8Array, BallotLayoutError>;
      try {
        ballotPdf = await renderBallotPreviewToPdf(
          renderer,
          ballotTemplates[ballotTemplateId],
          // NOTE: Changing this text means you should also change the font size
          // of the <Watermark> component in the ballot template.

          { ...ballotProps, watermark: 'PROOF' }
        );
      } finally {
        // eslint-disable-next-line no-console
        renderer.close().catch(console.error);
      }
      if (ballotPdf.isErr()) return ballotPdf;

      const precinct = find(
        election.precincts,
        (p) => p.id === input.precinctId
      );
      return ok({
        pdfData: ballotPdf.ok(),
        fileName: `PROOF-${getBallotPdfFileName(
          precinct.name,
          input.ballotStyleId,
          input.ballotType,
          input.ballotMode
        )}`,
      });
    },

    getElectionPackage({
      electionId,
    }: {
      electionId: ElectionId;
    }): Promise<BackgroundTaskMetadata> {
      return store.getElectionPackage(electionId);
    },

    exportElectionPackage({
      electionId,
      electionSerializationFormat,
      shouldExportAudio,
      shouldExportSampleBallots,
      numAuditIdBallots,
    }: {
      electionId: ElectionId;
      electionSerializationFormat: ElectionSerializationFormat;
      shouldExportAudio: boolean;
      shouldExportSampleBallots: boolean;
      numAuditIdBallots?: number;
    }): Promise<void> {
      return store.createElectionPackageBackgroundTask(
        electionId,
        electionSerializationFormat,
        shouldExportAudio,
        shouldExportSampleBallots,
        numAuditIdBallots
      );
    },

    getTestDecks({
      electionId,
    }: {
      electionId: ElectionId;
    }): Promise<BackgroundTaskMetadata> {
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

    async getBallotTemplate(input: {
      electionId: ElectionId;
    }): Promise<BallotTemplateId> {
      return store.getBallotTemplate(input.electionId);
    },

    async setBallotTemplate(input: {
      electionId: ElectionId;
      ballotTemplateId: BallotTemplateId;
    }): Promise<void> {
      await store.setBallotTemplate(input.electionId, input.ballotTemplateId);
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

    getBaseUrl(): string {
      return baseUrl();
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
      // Check if live data for ANY precinct has been reported, if so we should
      // return live results to the frontend.
      const isLive = await store.electionHasLiveReportData(
        election.id,
        ballotHash
      );
      const reportsByPrecinct = await store.getPollsStatusForElection(
        election,
        ballotHash,
        isLive
      );
      return ok({
        ballotHash,
        reportsByPrecinct,
        election,
        isLive,
      });
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

    async getStateFeatures(input: {
      electionId: ElectionId;
    }): Promise<StateFeaturesConfig> {
      const jurisdiction = await store.getElectionJurisdiction(
        input.electionId
      );
      return getStateFeaturesConfig(jurisdiction);
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
        /* istanbul ignore next - @preserve */
        if (zipEntries.length === 1 && zipEntries[0].startsWith('machine')) {
          cvrExportDirectory = path.join(cvrExportDirectory, zipEntries[0]);
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
          signedTimestamp,
          encodedCompressedTally,
          precinctSelection,
          pollsState,
          numPages,
          pageIndex,
        } = decodeQuickResultsMessage(payload);

        // First get the election ID for this hash
        const electionId = await store.getElectionIdFromBallotHash(ballotHash);
        if (!electionId) {
          return err('no-election-export-found');
        }

        // Get the exported election data and validate it
        const exportedElectionDefinitionResult =
          await store.getExportedElectionDefinition(electionId);
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
          assert(pollsState === 'polls_closed_final');
          // Save the received page as a partial. This handles out-of-order
          // arrival: whenever we receive any page we save it and then check
          // whether we have all pages stored (by count). If so, assemble and
          // finalize; otherwise return early.
          await store.savePartialQuickResultsReportingPage({
            electionId,
            precinctId: maybeGetPrecinctIdFromSelection(precinctSelection),
            ballotHash,
            encodedCompressedTally,
            machineId,
            isLive,
            signedTimestamp,
            pollsState,
            pageIndex,
            numPages,
          });

          const partials = await store.fetchPartialPages({
            ballotHash,
            machineId,
            isLive,
            pollsState,
          });
          const expectedPrecinctId =
            maybeGetPrecinctIdFromSelection(precinctSelection);

          const seenIndexes = new Set<number>();
          for (const partial of partials) {
            // Each partial should report the expected total number of pages
            assert(
              partial.numPages === numPages,
              `Partial page has unexpected numPages: ${partial.numPages} (expected ${numPages})`
            );
            if (expectedPrecinctId) {
              assert(
                partial.precinctId === expectedPrecinctId,
                `Partial page has unexpected precinctId: ${partial.precinctId} (expected ${expectedPrecinctId})`
              );
            } else {
              assert(
                !partial.precinctId,
                `Partial page has unexpected precinctId: ${partial.precinctId} (expected none)`
              );
            }
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
              pollsState,
              ballotHash,
              machineId,
              isLive,
              signedTimestamp,
              precinctSelection,
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

          // Save the final assembled report.
          await store.saveQuickResultsReportingTally({
            electionId,
            precinctId: maybeGetPrecinctIdFromSelection(precinctSelection),
            ballotHash,
            encodedCompressedTally: allEncoded,
            machineId,
            isLive,
            signedTimestamp,
            pollsState,
          });

          const contestResults = decodeAndReadCompressedTally({
            election,
            precinctSelection,
            encodedTally: allEncoded,
          });

          return ok({
            pollsState,
            ballotHash,
            machineId,
            isLive,
            signedTimestamp,
            contestResults,
            precinctSelection,
            election,
            isPartial: false,
          });
        }

        // Non-paginated path
        await store.saveQuickResultsReportingTally({
          electionId,
          precinctId: maybeGetPrecinctIdFromSelection(precinctSelection),
          ballotHash,
          encodedCompressedTally,
          machineId,
          isLive,
          signedTimestamp,
          pollsState,
        });

        switch (pollsState) {
          case 'polls_closed_final': {
            const contestResults = decodeAndReadCompressedTally({
              election,
              precinctSelection,
              encodedTally: encodedCompressedTally,
            });
            return ok({
              pollsState,
              ballotHash,
              machineId,
              isLive,
              signedTimestamp,
              contestResults,
              precinctSelection,
              election,
              isPartial: false,
            });
          }
          case 'polls_open': {
            return ok({
              pollsState,
              ballotHash,
              machineId,
              isLive,
              signedTimestamp,
              precinctSelection,
              election,
              isPartial: false,
            });
          }
          /* istanbul ignore next - @preserve */
          default:
            throwIllegalValue(pollsState);
        }
      } catch (e) {
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

  /* istanbul ignore next - @preserve */
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

  const api = buildApi(context);
  app.use('/api', grout.buildRouter(api, express));

  const unauthenticatedApi = buildUnauthenticatedApi(context);
  app.use('/public/api', grout.buildRouter(unauthenticatedApi, express));

  app.use(
    express.static(context.workspace.assetDirectoryPath, { index: false })
  );

  // Serve the index.html file for everything else, adding in some environment variables
  // (we don't need a full templating engine since it's just a couple of variables)
  const indexFileContents =
    NODE_ENV === 'test'
      ? ''
      : readFileSync(
          join(context.workspace.assetDirectoryPath, 'index.html'),
          'utf8'
        )
          .replace('{{ SENTRY_DSN }}', process.env.SENTRY_DSN ?? '')
          .replace('{{ DEPLOY_ENV }}', DEPLOY_ENV);
  app.get('*', (_req, res) => {
    res.send(indexFileContents);
  });

  Sentry.setupExpressErrorHandler(app);
  return app;
}
