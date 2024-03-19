import * as grout from '@votingworks/grout';
import { Buffer } from 'buffer';
import {
  Election,
  getPrecinctById,
  Id,
  safeParseElection,
  BallotPaperSize,
  SystemSettings,
  BallotType,
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
import {
  BallotMode,
  BALLOT_MODES,
  layOutAllBallotStyles,
  LayoutOptions,
} from '@votingworks/hmpb-layout';
import JsZip from 'jszip';
import {
  createPlaywrightRenderer,
  renderAllBallotsAndCreateElectionDefinition,
  renderBallotPreviewToPdf,
  renderDocumentToPdf,
  vxDefaultBallotTemplate,
} from '@votingworks/hmpb-render-backend';
import { ElectionPackage, ElectionRecord } from './store';
import { Precinct } from './types';
import {
  createPrecinctTestDeck,
  FULL_TEST_DECK_TALLY_REPORT_FILE_NAME,
  createTestDeckTallyReport,
} from './test_decks';
import { AppContext } from './context';
import { extractAndTranslateElectionStrings } from './language_and_audio';
import { rotateCandidates } from './candidate_rotation';

export function createBlankElection(): Election {
  return {
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
      paperSize: BallotPaperSize.Letter,
      metadataEncoding: 'qr-code',
    },
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
        nhCustomContent: {},
      })),
    };
  });
}

function buildApi({ translator, workspace }: AppContext) {
  const { store } = workspace;

  return grout.createApi({
    listElections(): ElectionRecord[] {
      return store.listElections();
    },

    getElection(input: { electionId: Id }): ElectionRecord {
      return store.getElection(input.electionId);
    },

    createElection(input: { electionData?: string }): Result<Id, Error> {
      let election: Election;
      if (input.electionData) {
        const parseResult = safeParseElection(input.electionData);
        if (parseResult.isErr()) return parseResult;
        election = parseResult.ok();
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
        return ok(store.createElection(election, precincts));
      }

      election = createBlankElection();
      return ok(store.createElection(election, []));
    },

    updateElection(input: { electionId: Id; election: Election }): void {
      const { election } = store.getElection(input.electionId);
      // TODO validate election, including global ID uniqueness
      store.updateElection(input.electionId, {
        ...election,
        ...input.election,
        contests: input.election.contests.map(rotateCandidates),
      });
    },

    updateSystemSettings(input: {
      electionId: Id;
      systemSettings: SystemSettings;
    }): void {
      store.updateSystemSettings(input.electionId, input.systemSettings);
    },

    updatePrecincts(input: { electionId: Id; precincts: Precinct[] }): void {
      store.updatePrecincts(input.electionId, input.precincts);
    },

    updateLayoutOptions(input: {
      electionId: Id;
      layoutOptions: LayoutOptions;
    }): void {
      store.updateLayoutOptions(input.electionId, input.layoutOptions);
    },

    deleteElection(input: { electionId: Id }): void {
      store.deleteElection(input.electionId);
    },

    async exportAllBallots(input: {
      electionId: Id;
    }): Promise<{ zipContents: Buffer; electionHash: string }> {
      const {
        // ballotLanguageConfigs,
        election,
      } = store.getElection(input.electionId);

      const zip = new JsZip();

      const renderer = await createPlaywrightRenderer();

      const ballotTypes = [BallotType.Precinct, BallotType.Absentee];
      const ballotProps = election.ballotStyles.flatMap((ballotStyle) =>
        ballotStyle.precincts.flatMap((precinctId) =>
          ballotTypes.flatMap((ballotType) =>
            BALLOT_MODES.map((ballotMode) => ({
              election,
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
          ballotProps
        );

      // TODO make sure we incorporate the translatedElectionStrings as they were previously incorporated
      // translatedElectionStrings: (
      //   await extractAndTranslateElectionStrings(
      //     translator,
      //     election,
      //     ballotLanguageConfigs
      //   )
      // ).electionStrings,

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

      // eslint-disable-next-line no-console
      renderer.cleanup().catch(console.error);

      return {
        zipContents: await zip.generateAsync({ type: 'nodebuffer' }),
        electionHash: assertDefined(electionDefinition.electionHash),
      };
    },

    async getBallotPreviewPdf(input: {
      electionId: Id;
      precinctId: string;
      ballotStyleId: string;
      ballotType: BallotType;
      ballotMode: BallotMode;
    }): Promise<Result<Buffer, Error>> {
      const { election } = store.getElection(input.electionId);
      const renderer = await createPlaywrightRenderer();
      const ballotPdf = await renderBallotPreviewToPdf(
        renderer,
        vxDefaultBallotTemplate,
        { ...input, election }
      );
      // eslint-disable-next-line no-console
      renderer.cleanup().catch(console.error);
      return ok(ballotPdf);
    },

    getElectionPackage({ electionId }: { electionId: Id }): ElectionPackage {
      return store.getElectionPackage(electionId);
    },

    exportElectionPackage({ electionId }: { electionId: Id }): void {
      store.createElectionPackageBackgroundTask(electionId);
    },

    async exportTestDecks(input: {
      electionId: Id;
    }): Promise<{ zipContents: Buffer; electionHash: string }> {
      const {
        ballotLanguageConfigs,
        election,
        layoutOptions,
        nhCustomContent,
      } = store.getElection(input.electionId);
      const { electionDefinition, ballots } = layOutAllBallotStyles({
        election,
        ballotType: BallotType.Precinct,
        ballotMode: 'test',
        layoutOptions,
        nhCustomContent,
        translatedElectionStrings: (
          await extractAndTranslateElectionStrings(
            translator,
            election,
            ballotLanguageConfigs
          )
        ).electionStrings,
      }).unsafeUnwrap();

      const zip = new JsZip();

      for (const precinct of election.precincts) {
        const testDeckDocument = createPrecinctTestDeck({
          election,
          precinctId: precinct.id,
          ballots,
        });
        if (!testDeckDocument) continue;
        const pdf = renderDocumentToPdf(testDeckDocument);
        const fileName = `${precinct.name.replaceAll(
          ' ',
          '_'
        )}-test-ballots.pdf`;
        zip.file(fileName, pdf);
        pdf.end();
      }

      zip.file(
        FULL_TEST_DECK_TALLY_REPORT_FILE_NAME,
        createTestDeckTallyReport({ electionDefinition, ballots })
      );

      return {
        zipContents: await zip.generateAsync({ type: 'nodebuffer' }),
        electionHash: electionDefinition.electionHash,
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
