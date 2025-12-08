import { describe, expect, test, vi } from 'vitest';
import { Buffer } from 'node:buffer';

import { electionGeneralFixtures } from '@votingworks/fixtures';
import { generateMarkOverlay, PrintCalibration } from '@votingworks/hmpb';
import {
  BallotType,
  ElectionDefinition,
  HmpbBallotPaperSize,
  SystemSettings,
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

describe(`printMode === "marks_on_preprinted_ballot"`, () => {
  const testValidSizes = test.each<HmpbBallotPaperSize>(
    Object.values(HmpbBallotPaperSize)
  );

  testValidSizes('prints bubble marks - %s', async (size) => {
    const electionDefinition = mockElection({
      paperSize: size,
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

    const mockMarkedBallotPdf = Uint8Array.of(0xca, 0xfe, 0xf0, 0x0d);

    vi.mocked(generateMarkOverlay).mockImplementation(
      (election, ballotStyleId, votes, calibration) => {
        expect(election).toEqual(electionDefinition.election);
        expect(ballotStyleId).toEqual(ballotStyle.id);
        expect(votes).toEqual(mockVotes);
        expect(calibration).toEqual(mockCalibration);

        return Promise.resolve(mockMarkedBallotPdf);
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
        getSystemSettings: () => {
          const settings: Partial<SystemSettings> = {
            bmdPrintMode: 'marks_on_preprinted_ballot',
          };
          return settings as SystemSettings;
        },
      }),
      votes: mockVotes,
    });

    expect(mockPrint.mock.calls).toEqual<Array<Parameters<PrintFunction>>>([
      [
        {
          data: mockMarkedBallotPdf,
          sides: PrintSides.TwoSidedLongEdge,
          size,
        },
      ],
    ]);
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
        getSystemSettings: () => {
          const settings: Partial<SystemSettings> = {
            bmdPrintMode: 'summary',
          };
          return settings as SystemSettings;
        },
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

describe(`printMode === "bubble_ballot"`, () => {
  const testValidSizes = test.each<HmpbBallotPaperSize>(
    Object.values(HmpbBallotPaperSize)
  );

  testValidSizes('prints bubble ballot with marks - %s', async (size) => {
    const electionDefinition = mockElection({
      paperSize: size,
    });
    const ballotStyle = electionDefinition.election.ballotStyles[0];
    const mockVotes: VotesDict = {
      foo: ['yes'],
      bar: [{ id: 'one', name: 'Hon. One III' }],
    };

    const mockBallotPdf = Uint8Array.of(0xba, 0x11, 0x07);
    const mockMarkedBallotPdf = Uint8Array.of(0xca, 0xfe, 0xf0, 0x0d);

    vi.mocked(generateMarkOverlay).mockImplementation(
      (election, ballotStyleId, votes, calibration, baseBallotPdf?) => {
        expect(election).toEqual(electionDefinition.election);
        expect(ballotStyleId).toEqual(ballotStyle.id);
        expect(votes).toEqual(mockVotes);
        expect(calibration).toEqual({ offsetMmX: 0, offsetMmY: 0 });
        expect(baseBallotPdf).toEqual(mockBallotPdf);

        return Promise.resolve(mockMarkedBallotPdf);
      }
    );

    const mockPrint = vi.fn<PrintFunction>();
    await printBallot({
      ballotStyleId: ballotStyle.id,
      languageCode: 'unused',
      precinctId: 'precinct-1',
      printer: mockPrinter({ print: mockPrint }),
      store: mockStore({
        getBallot: ({ ballotStyleId, precinctId, isLiveMode }) => {
          expect(ballotStyleId).toEqual(ballotStyle.id);
          expect(precinctId).toEqual('precinct-1');
          expect(isLiveMode).toEqual(true);

          return {
            ballotStyleId,
            precinctId,
            ballotType: BallotType.Precinct,
            ballotMode: 'official' as const,
            encodedBallot: Buffer.from(mockBallotPdf).toString('base64'),
          };
        },
        getElectionRecord: () => ({
          electionDefinition,
          electionPackageHash: 'unused',
        }),
        getSystemSettings: () => {
          const settings: Partial<SystemSettings> = {
            bmdPrintMode: 'bubble_ballot',
          };
          return settings as SystemSettings;
        },
        getTestMode: () => false,
      }),
      votes: mockVotes,
    });

    expect(mockPrint.mock.calls).toEqual<Array<Parameters<PrintFunction>>>([
      [
        {
          data: mockMarkedBallotPdf,
          sides: PrintSides.TwoSidedLongEdge,
          size,
        },
      ],
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
