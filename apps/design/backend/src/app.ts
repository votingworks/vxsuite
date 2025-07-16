import * as grout from '@votingworks/grout';
import * as Sentry from '@sentry/node';
import { auth as auth0Middleware, requiresAuth } from 'express-openid-connect';
import { join } from 'node:path';
import {
  Election,
  safeParseElection,
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
} from '@votingworks/types';
import express, { Application } from 'express';
import {
  assert,
  DateWithoutTime,
  extractErrorMessage,
  find,
  ok,
  Result,
} from '@votingworks/basics';
import {
  BallotLayoutError,
  BallotMode,
  BallotTemplateId,
  ballotTemplates,
  createPlaywrightRenderer,
  hmpbStringsCatalog,
  renderBallotPreviewToPdf,
} from '@votingworks/hmpb';
import { translateBallotStrings } from '@votingworks/backend';
import { readFileSync } from 'node:fs';
import { z } from 'zod/v4';
import { LogEventId } from '@votingworks/logging';
import { BackgroundTaskMetadata } from './store';
import {
  BallotOrderInfo,
  BallotOrderInfoSchema,
  BallotStyle,
  ElectionInfo,
  ElectionListing,
  Org,
  User,
  UsState,
} from './types';
import { AppContext } from './context';
import { rotateCandidates } from './candidate_rotation';
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
import { getBallotPdfFileName, regenerateElectionIds } from './utils';
import {
  ElectionFeaturesConfig,
  getElectionFeaturesConfig,
  getUserFeaturesConfig,
  UserFeaturesConfig,
} from './features';
import { rootDebug } from './debug';

const debug = rootDebug.extend('app');

export function createBlankElection(id: ElectionId): Election {
  return {
    id,
    type: 'general',
    title: '',
    date: DateWithoutTime.today(),
    state: '',
    county: {
      id: 'county-id',
      name: '',
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
  jurisdiction: TextInput,
  seal: z.string(),
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

function requireOrgAccess(user: User, orgId: string) {
  const userFeatures = getUserFeaturesConfig(user);
  if (!(user.orgId === orgId || userFeatures.ACCESS_ALL_ORGS)) {
    throw new AuthError('auth:forbidden');
  }
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function buildApi({ auth0, logger, workspace, translator }: AppContext) {
  const { store } = workspace;

  async function requireElectionAccess(user: User, electionId: ElectionId) {
    const electionOrgId = await store.getElectionOrgId(electionId);
    requireOrgAccess(user, electionOrgId);
  }

  const middlewares: grout.Middlewares<ApiContext> = {
    before: [
      async function loadUser({ request, context }) {
        const user = await auth0.userFromRequest(request);
        if (!user) {
          throw new AuthError('auth:unauthorized');
        }
        return { ...context, user };
      },

      /**
       * All methods should check authorization. This middleware checks
       * authorization automatically for methods that have either `electionId` or
       * `orgId` in their input. If a method doesn't have either of or has some
       * other reason to handle authorization separately, it must be listed in
       * `methodsThatHandleAuthThemselves` within this function.
       */
      async function checkAuthorization({ methodName, input, context }) {
        if (input) {
          assert(context.user);
          if ('electionId' in input) {
            await requireElectionAccess(
              context.user,
              input.electionId as string
            );
            return;
          }
          if ('orgId' in input) {
            requireOrgAccess(context.user, input.orgId as string);
            return;
          }
        }
        const methodsThatHandleAuthThemselves = [
          'listElections',
          'getUser',
          'getUserFeatures',
          'getAllOrgs',
        ];
        assert(methodsThatHandleAuthThemselves.includes(methodName));
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
            userAuth0Id: context.user?.auth0Id,
            userOrgId: context.user?.orgId,
            ...outcome,
          },
          debug
        );
      },
    ],
  };

  const methods = {
    async listElections(
      _input: undefined,
      context: ApiContext
    ): Promise<ElectionListing[]> {
      const { user } = context;
      const userFeatures = getUserFeaturesConfig(user);
      const elections = await store.listElections({
        orgId: userFeatures.ACCESS_ALL_ORGS ? undefined : user.orgId,
      });
      const orgs = await auth0.allOrgs();
      return elections.map((election) => ({
        ...election,
        orgName:
          orgs.find((org) => org.id === election.orgId)?.name ?? election.orgId,
      }));
    },

    async loadElection(
      input: {
        electionData: string;
        newId: ElectionId;
        orgId: string;
      },
      context: ApiContext
    ): Promise<Result<ElectionId, Error>> {
      const parseResult = safeParseElection(input.electionData);
      if (parseResult.isErr()) return parseResult;
      const sourceElection = parseResult.ok();
      const { districts, precincts, parties, contests } =
        regenerateElectionIds(sourceElection);
      // Split candidate names into first, middle, and last names, if they are
      // not already split
      const contestsWithSplitCandidateNames = contests.map((contest) => {
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
            const [firstPart, ...middleParts] = candidate.name.split(' ');
            return {
              ...candidate,
              firstName: firstPart ?? '',
              lastName: middleParts.pop() ?? '',
              middleName: middleParts.join(' '),
            };
          }),
        };
      });
      const election: Election = {
        ...sourceElection,
        id: input.newId,
        districts,
        precincts,
        parties,
        contests: contestsWithSplitCandidateNames,
        // Remove any existing ballot styles/grid layouts so we can generate our own
        ballotStyles: [],
        gridLayouts: undefined,
        // Fill in a blank seal if none is provided
        seal: sourceElection.seal ?? '',
      };
      await store.createElection(
        input.orgId,
        election,
        defaultBallotTemplate(election.state, context.user)
      );
      return ok(election.id);
    },

    async createElection(
      input: {
        id: ElectionId;
        orgId: string;
      },
      context: ApiContext
    ): Promise<Result<ElectionId, Error>> {
      const election = createBlankElection(input.id);
      await store.createElection(
        input.orgId,
        election,
        // For now, default all elections to NH ballot template. In the future
        // we can make this a setting based on the user's organization.
        defaultBallotTemplate(UsState.NEW_HAMPSHIRE, context.user)
      );
      return ok(election.id);
    },

    async cloneElection(
      input: {
        electionId: ElectionId;
        destElectionId: ElectionId;
        destOrgId: string;
      },
      context: ApiContext
    ): Promise<ElectionId> {
      const {
        election: sourceElection,
        ballotTemplateId,
        systemSettings,
      } = await store.getElection(input.electionId);

      requireOrgAccess(context.user, input.destOrgId);

      const { districts, precincts, parties, contests } =
        regenerateElectionIds(sourceElection);
      await store.createElection(
        input.destOrgId,
        {
          ...sourceElection,
          id: input.destElectionId,
          districts,
          precincts,
          parties,
          contests,
        },
        ballotTemplateId,
        systemSettings
      );
      return input.destElectionId;
    },

    async getElectionInfo(input: {
      electionId: ElectionId;
    }): Promise<ElectionInfo> {
      const { election, ballotLanguageConfigs } = await store.getElection(
        input.electionId
      );
      return {
        electionId: election.id,
        title: election.title,
        date: election.date,
        type: election.type,
        state: election.state,
        jurisdiction: election.county.name,
        seal: election.seal,
        // Not optimal: store.getElection converts from LanguageCode[] to BallotLanguageConfig.
        // This line converts from BallotLanguageConfig to LanguageCode[]
        languageCodes: getAllBallotLanguages(ballotLanguageConfigs),
      };
    },

    async updateElectionInfo(
      input: ElectionInfo
    ): Promise<Result<void, 'duplicate-title-and-date'>> {
      const electionInfo = unsafeParse(UpdateElectionInfoInputSchema, input);
      return store.updateElectionInfo(electionInfo);
    },

    async listDistricts(input: {
      electionId: ElectionId;
    }): Promise<readonly District[]> {
      return store.listDistricts(input.electionId);
    },

    async createDistrict(input: {
      electionId: ElectionId;
      newDistrict: District;
    }): Promise<void> {
      const district = unsafeParse(DistrictSchema, input.newDistrict);
      await store.createDistrict(input.electionId, district);
    },

    async updateDistrict(input: {
      electionId: ElectionId;
      updatedDistrict: District;
    }): Promise<void> {
      const district = unsafeParse(DistrictSchema, input.updatedDistrict);
      await store.updateDistrict(input.electionId, district);
    },

    async deleteDistrict(input: {
      electionId: ElectionId;
      districtId: DistrictId;
    }): Promise<void> {
      await store.deleteDistrict(input.electionId, input.districtId);
    },

    async listPrecincts(input: {
      electionId: ElectionId;
    }): Promise<readonly Precinct[]> {
      return store.listPrecincts(input.electionId);
    },

    async createPrecinct(input: {
      electionId: ElectionId;
      newPrecinct: Precinct;
    }): Promise<void> {
      const precinct = unsafeParse(PrecinctSchema, input.newPrecinct);
      await store.createPrecinct(input.electionId, precinct);
    },

    async updatePrecinct(input: {
      electionId: ElectionId;
      updatedPrecinct: Precinct;
    }): Promise<void> {
      const precinct = unsafeParse(PrecinctSchema, input.updatedPrecinct);
      await store.updatePrecinct(input.electionId, precinct);
    },

    async deletePrecinct(input: {
      electionId: ElectionId;
      precinctId: PrecinctId;
    }): Promise<void> {
      await store.deletePrecinct(input.electionId, input.precinctId);
    },

    async listBallotStyles(input: {
      electionId: ElectionId;
    }): Promise<BallotStyle[]> {
      return store.listBallotStyles(input.electionId);
    },

    async listParties(input: {
      electionId: ElectionId;
    }): Promise<readonly Party[]> {
      return store.listParties(input.electionId);
    },

    async createParty(input: {
      electionId: ElectionId;
      newParty: Party;
    }): Promise<void> {
      const party = unsafeParse(PartySchema, input.newParty);
      return store.createParty(input.electionId, party);
    },

    async updateParty(input: {
      electionId: ElectionId;
      updatedParty: Party;
    }): Promise<void> {
      const party = unsafeParse(PartySchema, input.updatedParty);
      await store.updateParty(input.electionId, party);
    },

    async deleteParty(input: {
      electionId: ElectionId;
      partyId: string;
    }): Promise<void> {
      await store.deleteParty(input.electionId, input.partyId);
    },

    async listContests(input: {
      electionId: ElectionId;
    }): Promise<readonly AnyContest[]> {
      return store.listContests(input.electionId);
    },

    async createContest(input: {
      electionId: ElectionId;
      newContest: AnyContest;
    }): Promise<void> {
      let contest = unsafeParse(AnyContestSchema, input.newContest);
      const { ballotTemplateId } = await store.getElection(input.electionId);
      contest = rotateCandidates(contest, ballotTemplateId);
      await store.createContest(input.electionId, contest);
    },

    async updateContest(input: {
      electionId: ElectionId;
      updatedContest: AnyContest;
    }): Promise<void> {
      let contest = unsafeParse(AnyContestSchema, input.updatedContest);
      const { ballotTemplateId } = await store.getElection(input.electionId);
      contest = rotateCandidates(contest, ballotTemplateId);
      await store.updateContest(input.electionId, contest);
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

    async getBallotOrderInfo(input: {
      electionId: ElectionId;
    }): Promise<BallotOrderInfo> {
      return store.getBallotOrderInfo(input.electionId);
    },

    async updateBallotOrderInfo(input: {
      electionId: ElectionId;
      ballotOrderInfo: BallotOrderInfo;
    }): Promise<void> {
      const ballotOrderInfo = unsafeParse(
        BallotOrderInfoSchema,
        input.ballotOrderInfo
      );
      return store.updateBallotOrderInfo(input.electionId, ballotOrderInfo);
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
      const {
        election,
        ballotLanguageConfigs,
        ballotStyles,
        ballotTemplateId,
      } = await store.getElection(input.electionId);
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
        ballotStyles,
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
        renderer.cleanup().catch(console.error);
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
      numAuditIdBallots,
    }: {
      electionId: ElectionId;
      electionSerializationFormat: ElectionSerializationFormat;
      shouldExportAudio: boolean;
      numAuditIdBallots?: number;
    }): Promise<void> {
      return store.createElectionPackageBackgroundTask(
        electionId,
        electionSerializationFormat,
        shouldExportAudio,
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

    getAllOrgs(_input: undefined, context: ApiContext): Promise<Org[]> {
      const userFeaturesConfig = getUserFeaturesConfig(context.user);
      if (!userFeaturesConfig.ACCESS_ALL_ORGS) {
        throw new AuthError('auth:forbidden');
      }
      return auth0.allOrgs();
    },

    getUserFeatures(
      _input: undefined,
      context: ApiContext
    ): UserFeaturesConfig {
      return getUserFeaturesConfig(context.user);
    },

    async getElectionFeatures(input: {
      electionId: ElectionId;
    }): Promise<ElectionFeaturesConfig> {
      const election = await store.getElection(input.electionId);
      return getElectionFeaturesConfig(election);
    },
  } as const;

  return grout.createApi(methods, middlewares);
}
export type Api = ReturnType<typeof buildApi>;

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

  app.get('/files/:orgId/:fileName', async (req, res, next) => {
    try {
      const user = await context.auth0.userFromRequest(req);
      if (!user) {
        throw new AuthError('auth:unauthorized');
      }
      const { orgId, fileName } = req.params;
      requireOrgAccess(user, orgId);

      const readResult = await context.fileStorageClient.readFile(
        join(orgId, fileName)
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

  /* istanbul ignore next - @preserve */
  if (authEnabled()) {
    app.use('*', requiresAuth());
  }

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
