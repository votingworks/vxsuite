import * as grout from '@votingworks/grout';
import { Buffer } from 'node:buffer';
import {
  Election,
  getPrecinctById,
  Id,
  safeParseElection,
  HmpbBallotPaperSize,
  SystemSettings,
  BallotType,
  ElectionSerializationFormat,
  ElectionId,
  BallotStyleId,
} from '@votingworks/types';
import express, { Application } from 'express';
import {
  assertDefined,
  DateWithoutTime,
  groupBy,
  iter,
  ok,
  Result,
} from '@votingworks/basics';
import JsZip from 'jszip';
import {
  BallotMode,
  BALLOT_MODES,
  BaseBallotProps,
  createPlaywrightRenderer,
  hmpbStringsCatalog,
  renderAllBallotsAndCreateElectionDefinition,
  renderBallotPreviewToPdf,
  vxDefaultBallotTemplate,
} from '@votingworks/hmpb';
import { translateBallotStrings } from '@votingworks/backend';
import { ElectionPackage, ElectionRecord } from './store';
import { Precinct } from './types';
import {
  createPrecinctTestDeck,
  FULL_TEST_DECK_TALLY_REPORT_FILE_NAME,
  createTestDeckTallyReport,
} from './test_decks';
import { AppContext } from './context';
import { rotateCandidates } from './candidate_rotation';
import { renderBallotStyleReadinessReport } from './ballot_style_reports';

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
      id: '',
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

function buildApi({ workspace, translator }: AppContext) {
  const { store } = workspace;

  return grout.createApi({
    listElections(): Promise<ElectionRecord[]> {
      return store.listElections();
    },

    getElection(input: { electionId: Id }): Promise<ElectionRecord> {
      return store.getElection(input.electionId);
    },

    async loadElection(input: {
      electionData: string;
    }): Promise<Result<ElectionId, Error>> {
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
      await store.createElection(election, precincts);
      return ok(election.id);
    },

    async createElection(input: {
      id: ElectionId;
    }): Promise<Result<ElectionId, Error>> {
      const election = createBlankElection(input.id);
      await store.createElection(election, []);
      return ok(election.id);
    },

    async updateElection(input: {
      electionId: Id;
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
      electionId: Id;
      systemSettings: SystemSettings;
    }): Promise<void> {
      return store.updateSystemSettings(input.electionId, input.systemSettings);
    },

    updatePrecincts(input: {
      electionId: Id;
      precincts: Precinct[];
    }): Promise<void> {
      return store.updatePrecincts(input.electionId, input.precincts);
    },

    deleteElection(input: { electionId: Id }): Promise<void> {
      return store.deleteElection(input.electionId);
    },

    getBallotsFinalizedAt(input: { electionId: Id }): Promise<Date | null> {
      return store.getBallotsFinalizedAt(input.electionId);
    },

    setBallotsFinalizedAt(input: {
      electionId: Id;
      finalizedAt: Date | null;
    }): Promise<void> {
      return store.setBallotsFinalizedAt(input);
    },

    async exportAllBallots(input: {
      electionId: Id;
      electionSerializationFormat: ElectionSerializationFormat;
    }): Promise<{ zipContents: Buffer; ballotHash: string }> {
      const { election, ballotLanguageConfigs } = await store.getElection(
        input.electionId
      );
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

      const renderer = await createPlaywrightRenderer();

      const ballotTypes = [BallotType.Precinct, BallotType.Absentee];
      const ballotProps = election.ballotStyles.flatMap((ballotStyle) =>
        ballotStyle.precincts.flatMap((precinctId) =>
          ballotTypes.flatMap((ballotType) =>
            BALLOT_MODES.map((ballotMode) => ({
              election: electionWithBallotStrings,
              ballotStyleId: ballotStyle.id,
              precinctId,
              ballotType,
              ballotMode,
            }))
          )
        )
      );

      const { ballotDocuments, electionDefinition } =
        await renderAllBallotsAndCreateElectionDefinition(
          renderer,
          vxDefaultBallotTemplate,
          ballotProps,
          input.electionSerializationFormat
        );

      const zip = new JsZip();

      for (const [props, document] of iter(ballotProps).zip(ballotDocuments)) {
        const pdf = await document.renderToPdf();
        const { precinctId, ballotStyleId, ballotType, ballotMode } = props;
        const precinct = assertDefined(
          getPrecinctById({ election, precinctId })
        );
        const fileName = `${ballotMode}-${ballotType}-ballot-${precinct.name.replaceAll(
          ' ',
          '_'
        )}-${ballotStyleId}.pdf`;
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
      electionId: Id;
      precinctId: string;
      ballotStyleId: BallotStyleId;
      ballotType: BallotType;
      ballotMode: BallotMode;
    }): Promise<Result<Buffer, Error>> {
      const { election, ballotLanguageConfigs } = await store.getElection(
        input.electionId
      );
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
      const renderer = await createPlaywrightRenderer();
      const ballotPdf = await renderBallotPreviewToPdf(
        renderer,
        vxDefaultBallotTemplate,
        { ...input, election: electionWithBallotStrings }
      );
      // eslint-disable-next-line no-console
      renderer.cleanup().catch(console.error);
      return ok(ballotPdf);
    },

    getElectionPackage({
      electionId,
    }: {
      electionId: Id;
    }): Promise<ElectionPackage> {
      return store.getElectionPackage(electionId);
    },

    exportElectionPackage({
      electionId,
      electionSerializationFormat,
    }: {
      electionId: Id;
      electionSerializationFormat: ElectionSerializationFormat;
    }): Promise<void> {
      return store.createElectionPackageBackgroundTask(
        electionId,
        electionSerializationFormat
      );
    },

    async exportTestDecks(input: {
      electionId: Id;
      electionSerializationFormat: ElectionSerializationFormat;
    }): Promise<{ zipContents: Buffer; ballotHash: string }> {
      const { election, ballotLanguageConfigs } = await store.getElection(
        input.electionId
      );
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
      const allBallotProps = election.ballotStyles.flatMap((ballotStyle) =>
        ballotStyle.precincts.map(
          (precinctId): BaseBallotProps => ({
            election: electionWithBallotStrings,
            ballotStyleId: ballotStyle.id,
            precinctId,
            ballotType: BallotType.Precinct,
            ballotMode: 'test',
          })
        )
      );
      const renderer = await createPlaywrightRenderer();
      const { electionDefinition, ballotDocuments } =
        await renderAllBallotsAndCreateElectionDefinition(
          renderer,
          vxDefaultBallotTemplate,
          allBallotProps,
          input.electionSerializationFormat
        );
      const ballots = iter(allBallotProps)
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
  });
}
export type Api = ReturnType<typeof buildApi>;

export function buildApp(context: AppContext): Application {
  const app: Application = express();
  const api = buildApi(context);
  app.use('/api', grout.buildRouter(api, express));
  app.use(express.static(context.workspace.assetDirectoryPath));
  return app;
}
