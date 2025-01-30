import * as grout from '@votingworks/grout';
import * as Sentry from '@sentry/node';
import { Buffer } from 'node:buffer';
import { auth as auth0, requiresAuth } from 'express-openid-connect';
import { join } from 'node:path';
import {
  Election,
  getPrecinctById,
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
} from '@votingworks/types';
import express, { Application } from 'express';
import {
  assertDefined,
  DateWithoutTime,
  find,
  groupBy,
  iter,
  ok,
  Result,
} from '@votingworks/basics';
import JsZip from 'jszip';
import {
  BallotMode,
  BallotTemplateId,
  ballotTemplates,
  createPlaywrightRenderer,
  hmpbStringsCatalog,
  renderAllBallotsAndCreateElectionDefinition,
  renderBallotPreviewToPdf,
} from '@votingworks/hmpb';
import { translateBallotStrings } from '@votingworks/backend';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { ElectionPackage, ElectionRecord } from './store';
import {
  BallotOrderInfo,
  Org,
  Precinct,
  User,
  UsState,
  WithUserInfo,
} from './types';
import {
  createPrecinctTestDeck,
  FULL_TEST_DECK_TALLY_REPORT_FILE_NAME,
  createTestDeckTallyReport,
} from './test_decks';
import { AppContext } from './context';
import { rotateCandidates } from './candidate_rotation';
import { renderBallotStyleReadinessReport } from './ballot_style_reports';
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
export function convertVxfPrecincts(election: Election): Precinct[] {
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

function getPdfFileName(
  precinctName: string,
  ballotStyleId: BallotStyleId,
  ballotType: BallotType,
  ballotMode: BallotMode
): string {
  return `${ballotMode}-${ballotType}-ballot-${precinctName.replaceAll(
    ' ',
    '_'
  )}-${ballotStyleId}.pdf`;
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
}

const UpdateElectionInfoInputSchema = z.object({
  electionId: ElectionIdSchema,
  type: z.union([z.literal('general'), z.literal('primary')]),
  date: DateWithoutTimeSchema,
  title: TextInput,
  state: TextInput,
  jurisdiction: TextInput,
  seal: z.string(),
});

function buildApi({ auth, workspace, translator }: AppContext) {
  const { store } = workspace;

  return grout.createApi({
    listElections(input: WithUserInfo): Promise<ElectionRecord[]> {
      if (input.user.orgId === votingWorksOrgId()) {
        return store.listElections({});
      }

      return store.listElections({ orgId: input.user.orgId });
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
      input: WithUserInfo<{ electionData: string; orgId: string }>
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
        defaultBallotTemplate(election.state)
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
        defaultBallotTemplate(UsState.NEW_HAMPSHIRE)
      );
      return ok(election.id);
    },

    async getElectionInfo(input: {
      electionId: ElectionId;
    }): Promise<ElectionInfo> {
      const { election } = await store.getElection(input.electionId);
      return {
        electionId: election.id,
        title: election.title,
        date: election.date,
        type: election.type,
        state: election.state,
        jurisdiction: election.county.name,
        seal: election.seal,
      };
    },

    async updateElectionInfo(input: ElectionInfo) {
      const { electionId, title, date, type, state, jurisdiction, seal } =
        unsafeParse(UpdateElectionInfoInputSchema, input);
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
    },

    async updateElection(input: {
      electionId: ElectionId;
      election: Election;
    }): Promise<void> {
      const { election } = await store.getElection(input.electionId);
      // TODO validate election, including global ID uniqueness
      await store.updateElection(input.electionId, {
        ...election,
        ...input.election,
        contests: input.election.contests.map(rotateCandidates),
      });
    },

    updateSystemSettings(input: {
      electionId: ElectionId;
      systemSettings: SystemSettings;
    }): Promise<void> {
      return store.updateSystemSettings(input.electionId, input.systemSettings);
    },

    updateBallotOrderInfo(input: {
      electionId: ElectionId;
      ballotOrderInfo: BallotOrderInfo;
    }): Promise<void> {
      return store.updateBallotOrderInfo(
        input.electionId,
        input.ballotOrderInfo
      );
    },

    updatePrecincts(input: {
      electionId: ElectionId;
      precincts: Precinct[];
    }): Promise<void> {
      return store.updatePrecincts(input.electionId, input.precincts);
    },

    deleteElection(input: { electionId: ElectionId }): Promise<void> {
      return store.deleteElection(input.electionId);
    },

    getBallotsFinalizedAt(input: {
      electionId: ElectionId;
    }): Promise<Date | null> {
      return store.getBallotsFinalizedAt(input.electionId);
    },

    setBallotsFinalizedAt(input: {
      electionId: ElectionId;
      finalizedAt: Date | null;
    }): Promise<void> {
      return store.setBallotsFinalizedAt(input);
    },

    async exportAllBallots(input: {
      electionId: ElectionId;
      electionSerializationFormat: ElectionSerializationFormat;
    }): Promise<{ zipContents: Buffer; ballotHash: string }> {
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
        ballotLanguageConfigs
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
      const renderer = await createPlaywrightRenderer();
      const { ballotDocuments, electionDefinition } =
        await renderAllBallotsAndCreateElectionDefinition(
          renderer,
          ballotTemplates[ballotTemplateId],
          allBallotProps,
          input.electionSerializationFormat
        );

      const zip = new JsZip();

      for (const [props, document] of iter(allBallotProps).zip(
        ballotDocuments
      )) {
        const pdf = await document.renderToPdf();
        const { precinctId, ballotStyleId, ballotType, ballotMode } = props;
        const precinct = assertDefined(
          getPrecinctById({ election, precinctId })
        );
        const fileName = getPdfFileName(
          precinct.name,
          ballotStyleId,
          ballotType,
          ballotMode
        );
        zip.file(fileName, pdf);
      }

      const readinessReportPdf = await renderBallotStyleReadinessReport({
        componentProps: {
          electionDefinition,
          generatedAtTime: new Date(),
        },
        renderer,
      });
      zip.file(BALLOT_STYLE_READINESS_REPORT_FILE_NAME, readinessReportPdf);

      // eslint-disable-next-line no-console
      renderer.cleanup().catch(console.error);

      return {
        zipContents: await zip.generateAsync({ type: 'nodebuffer' }),
        ballotHash: assertDefined(electionDefinition.ballotHash),
      };
    },

    async getBallotPreviewPdf(input: {
      electionId: ElectionId;
      precinctId: string;
      ballotStyleId: BallotStyleId;
      ballotType: BallotType;
      ballotMode: BallotMode;
    }): Promise<Result<{ pdfData: Buffer; fileName: string }, Error>> {
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
        ballotLanguageConfigs
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
      const ballotPdf = await renderBallotPreviewToPdf(
        renderer,
        ballotTemplates[ballotTemplateId],
        // NOTE: Changing this text means you should also change the font size
        // of the <Watermark> component in the ballot template.

        { ...ballotProps, watermark: 'PROOF' }
      );
      // eslint-disable-next-line no-console
      renderer.cleanup().catch(console.error);

      const precinct = find(
        election.precincts,
        (p) => p.id === input.precinctId
      );
      return ok({
        pdfData: ballotPdf,
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
    }): Promise<ElectionPackage> {
      return store.getElectionPackage(electionId);
    },

    exportElectionPackage({
      electionId,
      electionSerializationFormat,
    }: {
      electionId: ElectionId;
      electionSerializationFormat: ElectionSerializationFormat;
    }): Promise<void> {
      return store.createElectionPackageBackgroundTask(
        electionId,
        electionSerializationFormat
      );
    },

    async exportTestDecks(input: {
      electionId: ElectionId;
      electionSerializationFormat: ElectionSerializationFormat;
    }): Promise<{ zipContents: Buffer; ballotHash: string }> {
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
        ballotLanguageConfigs
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
      const testBallotProps = allBallotProps.filter(
        (props) =>
          props.ballotMode === 'test' &&
          props.ballotType === BallotType.Precinct
      );
      const renderer = await createPlaywrightRenderer();
      const { electionDefinition, ballotDocuments } =
        await renderAllBallotsAndCreateElectionDefinition(
          renderer,
          ballotTemplates[ballotTemplateId],
          testBallotProps,
          input.electionSerializationFormat
        );
      const ballots = iter(testBallotProps)
        .zip(ballotDocuments)
        .map(([props, document]) => ({
          props,
          document,
        }))
        .toArray();

      const zip = new JsZip();

      for (const precinct of election.precincts) {
        const testDeckPdf = await createPrecinctTestDeck({
          renderer,
          election,
          precinctId: precinct.id,
          ballots,
        });
        if (!testDeckPdf) continue;
        const fileName = `${precinct.name.replaceAll(
          ' ',
          '_'
        )}-test-ballots.pdf`;
        zip.file(fileName, testDeckPdf);
      }

      zip.file(
        FULL_TEST_DECK_TALLY_REPORT_FILE_NAME,
        createTestDeckTallyReport({ electionDefinition })
      );

      return {
        zipContents: await zip.generateAsync({ type: 'nodebuffer' }),
        ballotHash: electionDefinition.ballotHash,
      };
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
    getVotingWorksOrgId(): string {
      return votingWorksOrgId();
    },

    /* istanbul ignore next - @preserve */
    getAllOrgs(): Promise<Org[]> {
      return auth.allOrgs();
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
    if (!org) {
      res.status(500).send('No org found for user');
      return;
    }

    // A little convoluted, but this is just to form a typechecked link between
    // this handler and the `getUser` API stub.
    const userInfo: ReturnType<Api['getUser']> = {
      orgId: user.org_id,
      orgName: org.displayName,
    };

    res.set('Content-type', 'application/json');
    res.send(grout.serialize(userInfo));
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
