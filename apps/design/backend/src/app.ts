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
import { assertDefined, find, groupBy, ok, Result } from '@votingworks/basics';
import {
  BallotMode,
  BALLOT_MODES,
  layOutAllBallotStyles,
  LayoutOptions,
} from '@votingworks/hmpb-layout';
import JsZip from 'jszip';
import { renderDocumentToPdf } from '@votingworks/hmpb-render-backend';
import { ElectionPackage, ElectionRecord, Precinct } from './store';
import {
  createPrecinctTestDeck,
  FULL_TEST_DECK_TALLY_REPORT_FILE_NAME,
  createTestDeckTallyReport,
} from './test_decks';
import { Workspace } from './workspace';

export function createBlankElection(): Election {
  return {
    type: 'general',
    title: '',
    date: '',
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
      })),
    };
  });
}

function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

function buildApi({ workspace }: { workspace: Workspace }) {
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
      const { election, layoutOptions } = store.getElection(input.electionId);

      const zip = new JsZip();

      let electionHash: string | undefined;

      const ballotTypes = [BallotType.Precinct, BallotType.Absentee];
      for (const ballotType of ballotTypes) {
        for (const ballotMode of BALLOT_MODES) {
          const { ballots, electionDefinition } = layOutAllBallotStyles({
            election,
            ballotType,
            ballotMode,
            layoutOptions,
          }).unsafeUnwrap();

          // Election definition doesn't change across ballot types/modes
          electionHash = electionDefinition.electionHash;

          for (const { precinctId, document, gridLayout } of ballots) {
            const { ballotStyleId } = gridLayout;
            const precinct = assertDefined(
              getPrecinctById({ election, precinctId })
            );
            const pdf = renderDocumentToPdf(document);
            const fileName = `${ballotMode}-${ballotType}-ballot-${precinct.name.replaceAll(
              ' ',
              '_'
            )}-${ballotStyleId}.pdf`;
            zip.file(fileName, pdf);
            pdf.end();
          }
        }
      }

      return {
        zipContents: await zip.generateAsync({ type: 'nodebuffer' }),
        electionHash: assertDefined(electionHash),
      };
    },

    async exportBallot(input: {
      electionId: Id;
      precinctId: string;
      ballotStyleId: string;
      ballotType: BallotType;
      ballotMode: BallotMode;
    }): Promise<Buffer> {
      const { election, layoutOptions } = store.getElection(input.electionId);
      const { ballots } = layOutAllBallotStyles({
        election,
        ballotType: input.ballotType,
        ballotMode: input.ballotMode,
        layoutOptions,
      }).unsafeUnwrap();
      const { document } = find(
        ballots,
        ({ precinctId, gridLayout }) =>
          precinctId === input.precinctId &&
          gridLayout.ballotStyleId === input.ballotStyleId
      );
      const pdf = renderDocumentToPdf(document);
      pdf.end();
      return streamToBuffer(pdf);
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
      const { election, layoutOptions } = store.getElection(input.electionId);
      const { electionDefinition, ballots } = layOutAllBallotStyles({
        election,
        ballotType: BallotType.Precinct,
        ballotMode: 'test',
        layoutOptions,
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

export function buildApp({ workspace }: { workspace: Workspace }): Application {
  const app: Application = express();
  const api = buildApi({ workspace });
  app.use('/api', grout.buildRouter(api, express));
  app.use(express.static(workspace.assetDirectoryPath));
  return app;
}
