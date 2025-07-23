import { describe, expect, test, vi } from 'vitest';
import Stream from 'node:stream';
import { Buffer } from 'node:buffer';

import { electionGeneralFixtures } from '@votingworks/fixtures';
import { generateMarkOverlay, PrintCalibration } from '@votingworks/hmpb';
import {
  ElectionDefinition,
  HmpbBallotPaperSize,
  UiStringsPackage,
  VotesDict,
} from '@votingworks/types';
import {
  PrintFunction,
  PrintSides,
  RenderSpec,
  renderToPdf,
  type Printer,
} from '@votingworks/printing';

import {
  BackendLanguageContextProvider,
  BmdPaperBallot,
} from '@votingworks/ui';
import { UiStringsStore } from '@votingworks/backend';
import { ok } from '@votingworks/basics';
import { type Store } from '../store';
import { printBallot } from './print_ballot';

vi.mock('@votingworks/hmpb');
vi.mock('@votingworks/printing');
vi.mock('@votingworks/ui');

const electionDefBase = electionGeneralFixtures.readElectionDefinition();

describe(`printMode === "bubble_marks"`, () => {
  const testValidSizes = test.each<'letter' | 'legal'>(['letter', 'legal']);

  testValidSizes('prints bubble marks - %s', async (size) => {
    const electionDefinition = mockElection({
      paperSize: size as HmpbBallotPaperSize,
    });
    const ballotStyle = electionDefinition.election.ballotStyles[0];
    const mockVotes: VotesDict = {
      foo: ['yes'],
      bar: [{ id: 'one', name: 'Hon. One III' }],
    };

    const mockCalibration: PrintCalibration = {
      offsetMmX: 0.5,
      offsetMmY: -0.5,
    };
    vi.mocked(generateMarkOverlay).mockImplementation(
      (election, ballotStyleId, votes, calibration) => {
        expect(election).toEqual(electionDefinition.election);
        expect(ballotStyleId).toEqual(ballotStyle.id);
        expect(votes).toEqual(mockVotes);
        expect(calibration).toEqual(mockCalibration);

        return Stream.Readable.from([
          Buffer.of(0xca, 0xfe),
          Buffer.of(0xf0, 0x0d),
        ]);
      }
    );

    const mockPrint = vi.fn<PrintFunction>();
    await printBallot({
      ballotStyleId: ballotStyle.id,
      languageCode: 'unused',
      precinctId: 'unused',
      printer: mockPrinter({ print: mockPrint }),
      store: mockStore({
        getElectionRecord: () => ({
          electionDefinition,
          electionPackageHash: 'unused',
        }),
        getPrintCalibration: () => mockCalibration,
        getPrintMode: () => 'bubble_marks',
      }),
      votes: mockVotes,
    });

    expect(mockPrint.mock.calls).toEqual<Array<Parameters<PrintFunction>>>([
      [
        {
          data: Uint8Array.of(0xca, 0xfe, 0xf0, 0x0d),
          sides: PrintSides.TwoSidedLongEdge,
          size,
        },
      ],
    ]);
  });

  const testInvalidSizes = test.each<HmpbBallotPaperSize>([
    HmpbBallotPaperSize.Custom17,
    HmpbBallotPaperSize.Custom19,
    HmpbBallotPaperSize.Custom22,
  ]);

  testInvalidSizes('throws for unsupported paper size - %s', async (size) => {
    const electionDefinition = mockElection({ paperSize: size });

    await expect(() =>
      printBallot({
        ballotStyleId: electionDefinition.election.ballotStyles[0].id,
        languageCode: 'unused',
        precinctId: 'unused',
        printer: mockPrinter({}),
        store: mockStore({
          getElectionRecord: () => ({
            electionDefinition,
            electionPackageHash: 'unused',
          }),
          getPrintMode: () => 'bubble_marks',
        }),
        votes: { foo: ['yes'] },
      })
    ).rejects.toThrow(/paper size not yet supported/);
  });
});

describe(`printMode === "summary"`, () => {
  test('prints summary ballot', async () => {
    const electionDefinition = electionDefBase;
    const ballotStyle = electionDefinition.election.ballotStyles[0];
    const mockVotes: VotesDict = { foo: ['yes'] };

    vi.mocked(BackendLanguageContextProvider).mockImplementation((p) => (
      <div>{p.children}</div>
    ));
    vi.mocked(BmdPaperBallot).mockImplementation(() => (
      <div>ballot content</div>
    ));

    const mockUiStrings: UiStringsPackage = { 'es-US': { hello: 'hola' } };
    const mockPrecinctId = 'precinct-one';
    const mockPdf = Uint8Array.of(0xca, 0xfe);
    vi.mocked(renderToPdf).mockImplementation((spec) => {
      expect(spec).toEqual<RenderSpec>({
        document: (
          <BackendLanguageContextProvider
            currentLanguageCode="es-US"
            uiStringsPackage={mockUiStrings}
          >
            <BmdPaperBallot
              electionDefinition={electionDefinition}
              ballotStyleId={ballotStyle.id}
              precinctId={mockPrecinctId}
              votes={mockVotes}
              isLiveMode
              machineType="mark"
            />
          </BackendLanguageContextProvider>
        ),
      });

      return Promise.resolve(ok(mockPdf));
    });

    const mockPrint = vi.fn<PrintFunction>();
    await printBallot({
      ballotStyleId: ballotStyle.id,
      languageCode: 'es-US',
      precinctId: mockPrecinctId,
      printer: mockPrinter({ print: mockPrint }),
      store: mockStore({
        getElectionRecord: () => ({
          electionDefinition,
          electionPackageHash: 'unused',
        }),
        getPrintMode: () => 'summary',
        getTestMode: () => false,
        getUiStringsStore: () =>
          mockUiStringsStore({
            getAllUiStrings: () => mockUiStrings,
          }),
      }),
      votes: mockVotes,
    });

    expect(mockPrint.mock.calls).toEqual<Array<Parameters<PrintFunction>>>([
      [{ data: mockPdf, sides: PrintSides.OneSided }],
    ]);
  });
});

interface MockElectionOpts {
  paperSize?: HmpbBallotPaperSize;
}

function mockElection(opts: MockElectionOpts = {}): ElectionDefinition {
  return {
    ...electionDefBase,
    election: {
      ...electionDefBase.election,
      ballotLayout: {
        ...electionDefBase.election.ballotLayout,
        paperSize: opts.paperSize || HmpbBallotPaperSize.Letter,
      },
    },
  };
}

function mockPrinter(mocks: Partial<Printer>) {
  return mocks as unknown as Printer;
}

function mockStore(mocks: Partial<Store>) {
  return mocks as unknown as Store;
}

function mockUiStringsStore(mocks: Partial<UiStringsStore>) {
  return mocks as unknown as UiStringsStore;
}
