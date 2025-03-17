import * as grout from '@votingworks/grout';
import * as Sentry from '@sentry/node';
import { Buffer } from 'node:buffer';
import { auth as auth0, requiresAuth } from 'express-openid-connect';
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
  ElectionType,
  ElectionIdSchema,
  DateWithoutTimeSchema,
  unsafeParse,
  LanguageCode,
  LanguageCodeSchema,
  getAllBallotLanguages,
  SplittablePrecinct,
  District,
  DistrictSchema,
  DistrictId,
  PrecinctId,
  SplittablePrecinctSchema,
  Party,
  PartySchema,
  AnyContest,
  AnyContestSchema,
  HmpbBallotPaperSizeSchema,
  SystemSettingsSchema,
} from '@votingworks/types';
import express, { Application } from 'express';
import {
  assertDefined,
  DateWithoutTime,
  find,
  groupBy,
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
import { z } from 'zod';
import { BackgroundTaskMetadata, ElectionRecord } from './store';
import {
  BallotOrderInfo,
  BallotOrderInfoSchema,
  Org,
  User,
  UsState,
  WithUserInfo,
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
  votingWorksOrgId,
  authEnabled,
} from './globals';
import { createBallotPropsForTemplate, defaultBallotTemplate } from './ballots';
import { getPdfFileName } from './utils';
import {
  ElectionFeaturesConfig,
  getElectionFeaturesConfig,
  getUserFeaturesConfig,
  UserFeaturesConfig,
} from './features';

export const BALLOT_STYLE_READINESS_REPORT_FILE_NAME =
  'ballot-style-readiness-report.pdf';

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

// If we are importing an existing VXF election, we need to convert the
// precincts to have splits based on the ballot styles.
export function convertVxfPrecincts(election: Election): SplittablePrecinct[] {
  return election.precincts.map((precinct) => {
    const precinctBallotStyles = election.ballotStyles.filter((ballotStyle) =>
      ballotStyle.precincts.includes(precinct.id)
    );
    // Since there may be multiple ballot styles for a precinct for different parties, we
    // dedupe them based on the district IDs when creating splits.
    const ballotStylesByDistricts = groupBy(
      precinctBallotStyles,
      (ballotStyle) => ballotStyle.districts
    );
    const ballotStyles = ballotStylesByDistricts.map(
      ([, ballotStyleGroup]) => ballotStyleGroup[0]
    );

    if (ballotStyles.length <= 1) {
      return {
        ...precinct,
        districtIds: ballotStyles[0]?.districts ?? [],
      };
    }
    return {
      ...precinct,
      splits: ballotStyles.map((ballotStyle, index) => ({
        id: `${precinct.id}-split-${index + 1}`,
        name: `${precinct.name} - Split ${index + 1}`,
        districtIds: ballotStyle.districts,
      })),
    };
  });
}

const TextInput = z
  .string()
  .transform((s) => s.trim())
  .refine((s) => s.length > 0);

export interface ElectionInfo {
  electionId: ElectionId;
  type: ElectionType;
  date: DateWithoutTime;
  title: string;
  state: string;
  jurisdiction: string;
  seal: string;
  languageCodes: LanguageCode[];
}

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

function buildApi({ auth, workspace, translator }: AppContext) {
  const { store } = workspace;

  return grout.createApi({
    listElections(input: WithUserInfo): Promise<ElectionRecord[]> {
      const { orgId } = input.user;
      if (orgId === votingWorksOrgId()) {
        return store.listElections({});
      }

      return store.listElections({ orgId });
    },

    async getElection(
      input: WithUserInfo<{ electionId: ElectionId }>
    ): Promise<ElectionRecord> {
      const election = await store.getElection(input.electionId);

      // [TODO] Return `null` instead and have the client handle it by returning
      // to homepage.
      if (!auth.hasAccess(input.user, election.orgId)) {
        throw new grout.GroutError('Not found');
      }

      return election;
    },

    async loadElection(
      input: WithUserInfo<{
        electionData: string;
        newId: ElectionId;
        orgId: string;
      }>
    ): Promise<Result<ElectionId, Error>> {
      if (!auth.hasAccess(input.user, input.orgId)) {
        throw new grout.GroutError('Access denied', {
          cause: 'Cannot create election for another org',
        });
      }

      const parseResult = safeParseElection(input.electionData);
      if (parseResult.isErr()) return parseResult;
      let election = parseResult.ok();
      const precincts = convertVxfPrecincts(election);
      election = {
        ...election,
        id: input.newId,
        // Remove any existing ballot styles/grid layouts so we can generate our own
        ballotStyles: [],
        precincts,
        gridLayouts: undefined,
        // Fill in a blank seal if none is provided
        seal: election.seal ?? '',
      };
      await store.createElection(
        input.orgId,
        election,
        precincts,
        defaultBallotTemplate(election.state, input.user)
      );
      return ok(election.id);
    },

    async createElection(
      input: WithUserInfo<{
        id: ElectionId;
        orgId: string;
      }>
    ): Promise<Result<ElectionId, Error>> {
      if (!auth.hasAccess(input.user, input.orgId)) {
        throw new grout.GroutError('Access denied', {
          cause: 'Cannot create election for another org',
        });
      }

      const election = createBlankElection(input.id);
      await store.createElection(
        input.orgId,
        election,
        [],
        // For now, default all elections to NH ballot template. In the future
        // we can make this a setting based on the user's organization.
        defaultBallotTemplate(UsState.NEW_HAMPSHIRE, input.user)
      );
      return ok(election.id);
    },

    async cloneElection(
      input: WithUserInfo<{
        srcId: ElectionId;
        destId: ElectionId;
        destOrgId: string;
      }>
    ): Promise<ElectionId> {
      const { election, ballotTemplateId, orgId, precincts, systemSettings } =
        await store.getElection(input.srcId);

      if (!auth.hasAccess(input.user, orgId)) {
        throw new grout.GroutError('Access denied', {
          cause: 'Cannot clone election: invalid source organization.',
        });
      }
      if (!auth.hasAccess(input.user, input.destOrgId)) {
        throw new grout.GroutError('Access denied', {
          cause: 'Cannot clone election: invalid destination organization.',
        });
      }

      await store.createElection(
        input.destOrgId,
        {
          ...election,
          id: input.destId,
          title: `(Copy) ${election.title}`,
        },
        precincts,
        ballotTemplateId,
        systemSettings
      );
      return input.destId;
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

    async updateElectionInfo(input: ElectionInfo) {
      const {
        electionId,
        title,
        date,
        type,
        state,
        jurisdiction,
        seal,
        languageCodes,
      } = unsafeParse(UpdateElectionInfoInputSchema, input);
      const { election } = await store.getElection(electionId);
      await store.updateElection(electionId, {
        ...election,
        title,
        date,
        type,
        state,
        county: {
          ...election.county,
          name: jurisdiction,
        },
        seal,
      });
      await store.updateBallotLanguageCodes(electionId, languageCodes);
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
    }): Promise<SplittablePrecinct[]> {
      return store.listPrecincts(input.electionId);
    },

    async createPrecinct(input: {
      electionId: ElectionId;
      newPrecinct: SplittablePrecinct;
    }): Promise<void> {
      const precinct = unsafeParse(SplittablePrecinctSchema, input.newPrecinct);
      await store.createPrecinct(input.electionId, precinct);
    },

    async updatePrecinct(input: {
      electionId: ElectionId;
      updatedPrecinct: SplittablePrecinct;
    }): Promise<void> {
      const precinct = unsafeParse(
        SplittablePrecinctSchema,
        input.updatedPrecinct
      );
      await store.updatePrecinct(input.electionId, precinct);
    },

    async deletePrecinct(input: {
      electionId: ElectionId;
      precinctId: PrecinctId;
    }): Promise<void> {
      await store.deletePrecinct(input.electionId, input.precinctId);
    },

    async updateElection(input: {
      electionId: ElectionId;
      election: Election;
    }): Promise<void> {
      const { election, ballotTemplateId } = await store.getElection(
        input.electionId
      );
      // TODO validate election, including global ID uniqueness
      await store.updateElection(input.electionId, {
        ...election,
        ...input.election,
        contests: input.election.contests.map((contest) =>
          rotateCandidates(contest, ballotTemplateId)
        ),
      });
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

    async getBallotPaperSize(input: {
      electionId: ElectionId;
    }): Promise<HmpbBallotPaperSize> {
      return store.getBallotPaperSize(input.electionId);
    },

    async updateBallotPaperSize(input: {
      electionId: ElectionId;
      paperSize: HmpbBallotPaperSize;
    }): Promise<void> {
      const paperSize = unsafeParse(HmpbBallotPaperSizeSchema, input.paperSize);
      await store.updateBallotPaperSize(input.electionId, paperSize);
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
      Result<{ pdfData: Buffer; fileName: string }, BallotLayoutError>
    > {
      const {
        election,
        ballotLanguageConfigs,
        precincts,
        ballotStyles,
        ballotTemplateId,
      } = await store.getElection(input.electionId);
      const ballotStrings = await translateBallotStrings(
        translator,
        election,
        hmpbStringsCatalog,
        ballotLanguageConfigs,
        precincts
      );
      const electionWithBallotStrings: Election = {
        ...election,
        ballotStrings,
      };
      const allBallotProps = createBallotPropsForTemplate(
        ballotTemplateId,
        electionWithBallotStrings,
        precincts,
        ballotStyles
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
      let ballotPdf: Result<Buffer, BallotLayoutError>;
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
        fileName: `PROOF-${getPdfFileName(
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
    }: {
      electionId: ElectionId;
      electionSerializationFormat: ElectionSerializationFormat;
      shouldExportAudio: boolean;
    }): Promise<void> {
      return store.createElectionPackageBackgroundTask(
        electionId,
        electionSerializationFormat,
        shouldExportAudio
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

    async setBallotTemplate(input: {
      electionId: ElectionId;
      ballotTemplateId: BallotTemplateId;
    }): Promise<void> {
      await store.setBallotTemplate(input.electionId, input.ballotTemplateId);
    },

    /* istanbul ignore next - @preserve */
    getUser(): User {
      throw new Error('getUser endpoint should be handled by auth middleware');
    },

    /* istanbul ignore next - @preserve */
    getAllOrgs(): Promise<Org[]> {
      return auth.allOrgs();
    },

    getUserFeatures(input: WithUserInfo): UserFeaturesConfig {
      return getUserFeaturesConfig(input.user);
    },

    async getElectionFeatures(input: {
      electionId: ElectionId;
    }): Promise<ElectionFeaturesConfig> {
      const election = await store.getElection(input.electionId);
      return getElectionFeaturesConfig(election);
    },
  });
}
export type Api = ReturnType<typeof buildApi>;

export function buildApp(context: AppContext): Application {
  const app: Application = express();

  /* istanbul ignore next - @preserve */
  if (authEnabled()) {
    app.use(
      auth0({
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
      })
    );

    app.get('/auth/start', async (req, res) => {
      await res.oidc.login({
        returnTo: '/',
        authorizationParams: {
          scope: 'openid profile email',
          // Try to propagate org ID context if available.
          organization: req.query['organization'],
        },
      });
    });

    // [TODO] Add API auth checks based on org ID.
    app.use('/api', (req, res, next) => {
      if (!req.oidc.isAuthenticated()) {
        // [TODO] Detect API 401s on the client and refresh to trigger a
        // login redirect.
        res.sendStatus(401);
        return;
      }

      next();
    });
  }

  // [TEMP] Until we update grout to provide API methods with the relevant
  // context data needed to extract this info, we'll need to handle this
  // endpoint outside of the grout API.
  // Leaving a stub `Api.getUser` method in place to provide client-side
  // typings.
  /* istanbul ignore next - @preserve */
  app.post('/api/getUser', async (req, res) => {
    const user = assertDefined(context.auth.userFromRequest(req));
    const org = await context.auth.org(user.org_id);

    // A little convoluted, but this is just to form a typechecked link between
    // this handler and the `getUser` API stub.
    const userInfo: ReturnType<Api['getUser']> = {
      orgId: user.org_id,
      orgName: org.displayName,
    };

    res.set('Content-type', 'application/json');
    res.send(grout.serialize(userInfo));
  });

  app.get('/files/:orgId/:fileName', async (req, res) => {
    const user = assertDefined(context.auth.userFromRequest(req));
    const userOrg = await context.auth.org(user.org_id);
    if (!userOrg) {
      res.status(500).send('No org found for user');
      return;
    }

    const { orgId, fileName } = req.params;
    if (orgId !== userOrg.id && userOrg.id !== votingWorksOrgId()) {
      res.status(404).send('File not found');
    }

    const readResult = await context.fileStorageClient.readFile(
      join(orgId, fileName)
    );
    const file = readResult.unsafeUnwrap();
    file.pipe(res);
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
