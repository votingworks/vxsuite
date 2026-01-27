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
  SummaryBallotLayoutRenderer,
  type Printer,
} from '@votingworks/printing';

import {
  BackendLanguageContextProvider,
  BmdPaperBallot,
  filterVotesForContests,
} from '@votingworks/ui';
import { UiStringsStore } from '@votingworks/backend';
import { ok } from '@votingworks/basics';
import { type Store } from '../store';
import { closeLayoutRenderer, printBallot } from './print_ballot';

vi.mock('@votingworks/hmpb');
vi.mock('@votingworks/printing');
vi.mock('@votingworks/ui');

// Mock SummaryBallotLayoutRenderer to return single page layout
vi.mocked(SummaryBallotLayoutRenderer).mockImplementation(
  () =>
    ({
      computePageBreaks: vi.fn().mockResolvedValue({
        pages: [{ pageNumber: 1, contestIds: [], layout: {} }],
        totalPages: 1,
      }),
      close: vi.fn().mockResolvedValue(undefined),
    }) as unknown as SummaryBallotLayoutRenderer
);

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

  test('prints multi-page summary ballot with correct page structure', async () => {
    // Reset shared renderer so our new mock is picked up
    await closeLayoutRenderer();

    const electionDefinition = electionDefBase;
    const { election } = electionDefinition;
    const ballotStyle = election.ballotStyles[0];
    const precinctId = ballotStyle.precincts[0];

    // Get real contest IDs from the election and split them into two pages
    const allContests = election.contests.filter((c) =>
      ballotStyle.districts.includes(c.districtId)
    );
    const page1ContestIds = allContests.slice(0, 5).map((c) => c.id);
    const page2ContestIds = allContests.slice(5).map((c) => c.id);

    // Override SummaryBallotLayoutRenderer mock to return 2 pages
    vi.mocked(SummaryBallotLayoutRenderer).mockImplementation(
      () =>
        ({
          computePageBreaks: vi.fn().mockResolvedValue({
            pages: [
              {
                pageNumber: 1,
                contestIds: page1ContestIds,
                layout: { page: 1 },
              },
              {
                pageNumber: 2,
                contestIds: page2ContestIds,
                layout: { page: 2 },
              },
            ],
            totalPages: 2,
          }),
          close: vi.fn().mockResolvedValue(undefined),
        }) as unknown as SummaryBallotLayoutRenderer
    );

    const mockVotes: VotesDict = {
      [page1ContestIds[0]]: ['vote-1'],
      [page2ContestIds[0]]: ['vote-2'],
    };

    // Mock filterVotesForContests to track calls and return filtered votes
    const filterCalls: Array<{ votes: VotesDict; contestIds: string[] }> = [];
    vi.mocked(filterVotesForContests).mockImplementation((votes, contests) => {
      const contestIds = contests.map((c) => c.id);
      filterCalls.push({ votes, contestIds });
      const filtered: VotesDict = {};
      for (const [id, vote] of Object.entries(votes)) {
        if (contestIds.includes(id)) {
          filtered[id] = vote;
        }
      }
      return filtered;
    });

    vi.mocked(BackendLanguageContextProvider).mockImplementation((p) => (
      <div>{p.children}</div>
    ));
    vi.mocked(BmdPaperBallot).mockImplementation(() => <div>ballot</div>);

    const mockUiStrings: UiStringsPackage = {};
    const mockPdf1 = Uint8Array.of(0x01);
    const mockPdf2 = Uint8Array.of(0x02);

    let renderCallCount = 0;
    vi.mocked(renderToPdf).mockImplementation(() => {
      renderCallCount += 1;
      return Promise.resolve(ok(renderCallCount === 1 ? mockPdf1 : mockPdf2));
    });

    const mockPrint = vi.fn<PrintFunction>();
    await printBallot({
      ballotStyleId: ballotStyle.id,
      languageCode: 'en',
      precinctId,
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

    // All pages should be printed in a single call with OneSided
    expect(mockPrint).toHaveBeenCalledTimes(1);
    expect(mockPrint.mock.calls[0]).toEqual([
      { data: mockPdf1, sides: PrintSides.OneSided },
    ]);

    // renderToPdf should be called once with a combined document
    const renderCalls = vi.mocked(renderToPdf).mock.calls;
    expect(renderCalls).toHaveLength(1);

    // filterVotesForContests should be called once per page with correct contests
    expect(filterCalls).toHaveLength(2);
    expect([...filterCalls[0].contestIds].sort()).toEqual(
      [...page1ContestIds].sort()
    );
    expect([...filterCalls[1].contestIds].sort()).toEqual(
      [...page2ContestIds].sort()
    );

    // Verify BmdPaperBallot props via the JSX passed to renderToPdf
    // renderToPdf receives { document: <div>[...pages]</div> }
    const wrapperElement = renderCalls[0][0].document as React.ReactElement;
    const pageElements = wrapperElement.props.children as React.ReactElement[];

    const page1Element = pageElements[0] ;
    const page1BmdElement = page1Element.props.children as React.ReactElement;
    const page1Props = page1BmdElement.props;
    expect(page1Props.pageNumber).toEqual(1);
    expect(page1Props.totalPages).toEqual(2);
    expect(page1Props.ballotAuditId).toBeDefined();
    expect(
      page1Props.contestsForPage?.map((c: { id: string }) => c.id).sort()
    ).toEqual([...page1ContestIds].sort());

    const page2Element = pageElements[1] ;
    const page2BmdElement = page2Element.props.children as React.ReactElement;
    const page2Props = page2BmdElement.props;
    expect(page2Props.pageNumber).toEqual(2);
    expect(page2Props.totalPages).toEqual(2);
    expect(page2Props.ballotAuditId).toBeDefined();

    // Same ballotAuditId should be used across both pages
    expect(page1Props.ballotAuditId).toEqual(page2Props.ballotAuditId);

    expect(
      page2Props.contestsForPage?.map((c: { id: string }) => c.id).sort()
    ).toEqual([...page2ContestIds].sort());
  });

  test('multi-page ballot uses live mode correctly', async () => {
    await closeLayoutRenderer();

    const electionDefinition = electionDefBase;
    const { election } = electionDefinition;
    const ballotStyle = election.ballotStyles[0];
    const precinctId = ballotStyle.precincts[0];

    const allContests = election.contests.filter((c) =>
      ballotStyle.districts.includes(c.districtId)
    );
    const contestIds = allContests.map((c) => c.id);

    vi.mocked(SummaryBallotLayoutRenderer).mockImplementation(
      () =>
        ({
          computePageBreaks: vi.fn().mockResolvedValue({
            pages: [
              { pageNumber: 1, contestIds, layout: {} },
              { pageNumber: 2, contestIds: [], layout: {} },
            ],
            totalPages: 2,
          }),
          close: vi.fn().mockResolvedValue(undefined),
        }) as unknown as SummaryBallotLayoutRenderer
    );

    vi.mocked(filterVotesForContests).mockReturnValue({});
    vi.mocked(BackendLanguageContextProvider).mockImplementation((p) => (
      <div>{p.children}</div>
    ));
    vi.mocked(BmdPaperBallot).mockImplementation(() => <div>ballot</div>);
    vi.mocked(renderToPdf).mockResolvedValue(ok(Uint8Array.of(0x00)));

    const mockPrint = vi.fn<PrintFunction>();

    // Test with test mode ON (isLiveMode should be false)
    await printBallot({
      ballotStyleId: ballotStyle.id,
      languageCode: 'en',
      precinctId,
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
        getTestMode: () => true,
        getUiStringsStore: () =>
          mockUiStringsStore({ getAllUiStrings: () => ({}) }),
      }),
      votes: {},
    });

    // All pages should have isLiveMode: false when in test mode
    const renderCalls = vi.mocked(renderToPdf).mock.calls;
    expect(renderCalls).toHaveLength(1);
    const wrapperElement = renderCalls[0][0].document as React.ReactElement;
    const pageElements = wrapperElement.props.children as React.ReactElement[];
    for (const pageElement of pageElements) {
      const bmdElement = pageElement.props.children as React.ReactElement;
      expect(bmdElement.props.isLiveMode).toEqual(false);
    }
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
