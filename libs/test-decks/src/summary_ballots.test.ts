import { afterEach, describe, expect, test, vi } from 'vitest';
import { ok } from '@votingworks/basics';
import { VotesDict } from '@votingworks/types';
import {
  renderToPdf,
  SummaryBallotLayoutRenderer,
} from '@votingworks/printing';
import { concatenatePdfs, vxFamousNamesFixtures } from '@votingworks/hmpb';
import {
  createElectionDefinition,
  createMockVotes,
  createTestElection,
  mockConstructor,
} from '@votingworks/test-utils';
import { encodeSummaryBallotPage } from '@votingworks/ballot-encoder';
import { createSummaryBallotTestDeck } from './summary_ballots.js';
import { generateTestDeckBallots } from './test_decks.js';

vi.setConfig({
  testTimeout: 90_000,
});

vi.mock(import('@votingworks/types'), async (importActual) => {
  const original = await importActual();
  return {
    ...original,
    formatBallotHash: vi.fn().mockReturnValue('0000000'),
  };
});

vi.mock('@votingworks/printing', async (importActual) => {
  const actual = await importActual<typeof import('@votingworks/printing')>();
  // vi.mock factories are hoisted above imports, so the top-level
  // `mockConstructor` is in TDZ here — resolve test-utils lazily and alias
  // to avoid shadowing the outer import.
  const { mockConstructor: mockCtor } = await import('@votingworks/test-utils');
  return {
    ...actual,
    SummaryBallotLayoutRenderer: vi.fn(
      mockCtor(() => new actual.SummaryBallotLayoutRenderer())
    ),
    renderToPdf: vi.fn(actual.renderToPdf),
  };
});

vi.mock('@votingworks/hmpb', async (importActual) => {
  const actual = await importActual<typeof import('@votingworks/hmpb')>();
  return {
    ...actual,
    concatenatePdfs: vi.fn(actual.concatenatePdfs),
  };
});

// The summary ballot test deck generates a random ballot audit ID per ballot,
// which is encoded into the QR code. Pin it so the PDF snapshots are stable.
// Spy on the encoder without changing what it produces: rendered ballots are
// compared against image snapshots elsewhere in this suite.
vi.mock(import('@votingworks/ballot-encoder'), async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    encodeSummaryBallotPage: vi.fn(actual.encodeSummaryBallotPage),
  };
});

vi.mock('node:crypto', async (importActual) => ({
  ...(await importActual<typeof import('node:crypto')>()),
  // eslint-disable-next-line vx/gts-identifiers
  randomUUID: () => '00000000-0000-0000-0000-000000000000',
}));

describe('createSummaryBallotTestDeck', () => {
  test('generates summary BMD ballots for a precinct', async () => {
    const { electionDefinition } = vxFamousNamesFixtures;
    const { election } = electionDefinition;
    const precinctId = election.precincts[0].id;

    const ballotSpecs = generateTestDeckBallots({
      election,
      precinctId,
      ballotFormat: 'summary',
    });

    const summaryBallotPdf = await createSummaryBallotTestDeck({
      electionDefinition,
      ballotSpecs,
      isLiveMode: false,
    });

    expect(summaryBallotPdf).toBeDefined();
    await expect(summaryBallotPdf).toMatchPdfSnapshot({
      failureThreshold: 0.0001,
    });
  });

  test('returns undefined for empty ballot specs', async () => {
    const { electionDefinition } = vxFamousNamesFixtures;

    const summaryBallotPdf = await createSummaryBallotTestDeck({
      electionDefinition,
      ballotSpecs: [],
      isLiveMode: false,
    });

    expect(summaryBallotPdf).toBeUndefined();
  });
});

describe('createSummaryBallotTestDeck - multi-page flow', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('creates multi-page ballot elements when computePageBreaks returns multiple pages', async () => {
    const election = createTestElection({
      numCandidateContests: 6,
      numYesNoContests: 4,
      candidatesPerContest: 3,
    });
    const electionDef = createElectionDefinition(election);
    const allContestIds = election.contests.map((c) => c.id);
    const page1ContestIds = allContestIds.slice(0, 5);
    const page2ContestIds = allContestIds.slice(5);

    const votes = createMockVotes([...election.contests]);
    const ballotSpecs = [
      {
        ballotStyleId: election.ballotStyles[0].id,
        precinctId: election.precincts[0].id,
        ballotFormat: 'summary' as const,
        votes,
      },
    ];

    // Mock SummaryBallotLayoutRenderer to return 2 pages
    const mockComputePageBreaks = vi.fn().mockResolvedValue([
      { pageNumber: 1, contestIds: page1ContestIds, layout: undefined },
      { pageNumber: 2, contestIds: page2ContestIds, layout: undefined },
    ]);
    const mockClose = vi.fn().mockResolvedValue(undefined);
    vi.mocked(SummaryBallotLayoutRenderer).mockImplementation(
      mockConstructor(
        () =>
          ({
            computePageBreaks: mockComputePageBreaks,
            close: mockClose,
          }) as unknown as SummaryBallotLayoutRenderer
      )
    );

    // Mock renderToPdf to return mock PDFs (one per React element)
    const mockPdf1 = Uint8Array.of(0x01);
    const mockPdf2 = Uint8Array.of(0x02);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(renderToPdf).mockResolvedValue(ok([mockPdf1, mockPdf2]) as any);

    // Mock concatenatePdfs to return a combined PDF
    const mockCombinedPdf = Uint8Array.of(0x01, 0x02);
    vi.mocked(concatenatePdfs).mockResolvedValue(mockCombinedPdf);

    const result = await createSummaryBallotTestDeck({
      electionDefinition: electionDef,
      ballotSpecs,
      isLiveMode: false,
    });

    expect(result).toEqual(mockCombinedPdf);

    // computePageBreaks should be called once per ballot spec
    expect(mockComputePageBreaks).toHaveBeenCalledTimes(1);

    // renderToPdf should receive 2 documents (one per page)
    const renderCall = vi.mocked(renderToPdf).mock.calls[0];
    const documents = renderCall[0] as unknown as Array<{
      document: React.ReactElement;
    }>;
    expect(documents).toHaveLength(2);

    // Verify page 1 props
    const page1Props = documents[0].document.props;
    expect(page1Props.pageNumber).toEqual(1);
    expect(page1Props.totalPages).toEqual(2);
    expect(
      page1Props.contestsForPage.map((c: { id: string }) => c.id).sort()
    ).toEqual([...page1ContestIds].sort());

    // Verify page 2 props
    const page2Props = documents[1].document.props;
    expect(page2Props.pageNumber).toEqual(2);
    expect(page2Props.totalPages).toEqual(2);

    // The audit id now travels in the encoded payload rather than as a prop.
    // Both pages must carry the same one so they can be correlated after they
    // are physically separated by scanning.
    const [[, firstPage], [, secondPage]] = vi.mocked(encodeSummaryBallotPage)
      .mock.calls;
    expect(firstPage.ballotAuditId).toBeDefined();
    expect(firstPage.ballotAuditId).toEqual(secondPage.ballotAuditId);
    expect(firstPage.pageNumber).toEqual(1);
    expect(secondPage.pageNumber).toEqual(2);

    expect(
      page2Props.contestsForPage.map((c: { id: string }) => c.id).sort()
    ).toEqual([...page2ContestIds].sort());

    // concatenatePdfs should be called with both page PDFs
    expect(concatenatePdfs).toHaveBeenCalledWith([mockPdf1, mockPdf2]);

    // layoutRenderer.close() should be called
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  test('mixes single-page and multi-page ballots correctly', async () => {
    const election = createTestElection({
      numCandidateContests: 4,
      numYesNoContests: 2,
      candidatesPerContest: 3,
    });
    const electionDef = createElectionDefinition(election);
    const allContestIds = election.contests.map((c) => c.id);

    const votes1 = createMockVotes([...election.contests]);
    const votes2 = createMockVotes([...election.contests]);

    const ballotSpecs = [
      {
        ballotStyleId: election.ballotStyles[0].id,
        precinctId: election.precincts[0].id,
        ballotFormat: 'summary' as const,
        votes: votes1,
      },
      {
        ballotStyleId: election.ballotStyles[0].id,
        precinctId: election.precincts[0].id,
        ballotFormat: 'summary' as const,
        votes: votes2,
      },
    ];

    // First ballot: multi-page (2 pages)
    // Second ballot: single-page (1 page)
    let callCount = 0;
    const mockComputePageBreaks = vi.fn().mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) {
        return Promise.resolve([
          {
            pageNumber: 1,
            contestIds: allContestIds.slice(0, 3),
            layout: undefined,
          },
          {
            pageNumber: 2,
            contestIds: allContestIds.slice(3),
            layout: undefined,
          },
        ]);
      }
      return Promise.resolve([
        { pageNumber: 1, contestIds: allContestIds, layout: undefined },
      ]);
    });
    vi.mocked(SummaryBallotLayoutRenderer).mockImplementation(
      mockConstructor(
        () =>
          ({
            computePageBreaks: mockComputePageBreaks,
            close: vi.fn().mockResolvedValue(undefined),
          }) as unknown as SummaryBallotLayoutRenderer
      )
    );

    // 3 documents: 2 from multi-page ballot + 1 from single-page ballot
    const mockPdfs = [
      Uint8Array.of(0x01),
      Uint8Array.of(0x02),
      Uint8Array.of(0x03),
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(renderToPdf).mockResolvedValue(ok(mockPdfs) as any);
    vi.mocked(concatenatePdfs).mockResolvedValue(Uint8Array.of(0xff));

    const result = await createSummaryBallotTestDeck({
      electionDefinition: electionDef,
      ballotSpecs,
      isLiveMode: true,
    });

    expect(result).toBeDefined();

    // computePageBreaks called once per ballot spec
    expect(mockComputePageBreaks).toHaveBeenCalledTimes(2);

    // renderToPdf should receive 3 documents total
    const renderCall = vi.mocked(renderToPdf).mock.calls[0];
    const documents = renderCall[0] as unknown as Array<{
      document: React.ReactElement;
    }>;
    expect(documents).toHaveLength(3);

    // First two documents are multi-page (have pageNumber/totalPages)
    expect(documents[0].document.props.pageNumber).toEqual(1);
    expect(documents[0].document.props.totalPages).toEqual(2);
    expect(documents[1].document.props.pageNumber).toEqual(2);
    expect(documents[1].document.props.totalPages).toEqual(2);

    // Third document is single-page
    expect(documents[2].document.props.pageNumber).toEqual(1);
    expect(documents[2].document.props.totalPages).toEqual(1);

    // All documents should have correct isLiveMode
    for (const doc of documents) {
      expect(doc.document.props.isLiveMode).toEqual(true);
    }

    // concatenatePdfs called with all 3 PDFs
    expect(concatenatePdfs).toHaveBeenCalledWith(mockPdfs);
  });

  test('calls emitProgress with ballot spec count', async () => {
    const election = createTestElection({
      numCandidateContests: 2,
      numYesNoContests: 1,
      candidatesPerContest: 2,
    });
    const electionDef = createElectionDefinition(election);
    const allContestIds = election.contests.map((c) => c.id);

    const ballotSpecs = [
      {
        ballotStyleId: election.ballotStyles[0].id,
        precinctId: election.precincts[0].id,
        ballotFormat: 'summary' as const,
        votes: createMockVotes([...election.contests]),
      },
      {
        ballotStyleId: election.ballotStyles[0].id,
        precinctId: election.precincts[0].id,
        ballotFormat: 'summary' as const,
        votes: createMockVotes([...election.contests]),
      },
    ];

    vi.mocked(SummaryBallotLayoutRenderer).mockImplementation(
      mockConstructor(
        () =>
          ({
            computePageBreaks: vi
              .fn()
              .mockResolvedValue([
                { pageNumber: 1, contestIds: allContestIds, layout: undefined },
              ]),
            close: vi.fn().mockResolvedValue(undefined),
          }) as unknown as SummaryBallotLayoutRenderer
      )
    );
    vi.mocked(renderToPdf).mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ok([Uint8Array.of(0x01), Uint8Array.of(0x02)]) as any
    );
    vi.mocked(concatenatePdfs).mockResolvedValue(Uint8Array.of(0xff));

    const emitProgress = vi.fn();

    await createSummaryBallotTestDeck({
      electionDefinition: electionDef,
      ballotSpecs,
      isLiveMode: false,
      emitProgress,
    });

    expect(emitProgress).toHaveBeenCalledTimes(1);
    expect(emitProgress).toHaveBeenCalledWith(2);
  });

  test('closes layoutRenderer even if an error occurs', async () => {
    const election = createTestElection({
      numCandidateContests: 2,
      numYesNoContests: 0,
      candidatesPerContest: 2,
    });
    const electionDef = createElectionDefinition(election);

    const ballotSpecs = [
      {
        ballotStyleId: election.ballotStyles[0].id,
        precinctId: election.precincts[0].id,
        ballotFormat: 'summary' as const,
        votes: createMockVotes([...election.contests]),
      },
    ];

    const mockClose = vi.fn().mockResolvedValue(undefined);
    vi.mocked(SummaryBallotLayoutRenderer).mockImplementation(
      mockConstructor(
        () =>
          ({
            computePageBreaks: vi
              .fn()
              .mockRejectedValue(new Error('render failed')),
            close: mockClose,
          }) as unknown as SummaryBallotLayoutRenderer
      )
    );

    await expect(
      createSummaryBallotTestDeck({
        electionDefinition: electionDef,
        ballotSpecs,
        isLiveMode: false,
      })
    ).rejects.toThrow('render failed');

    // close() should still be called despite the error (finally block)
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  test('filters votes correctly for multi-page ballots', async () => {
    const election = createTestElection({
      numCandidateContests: 4,
      numYesNoContests: 0,
      candidatesPerContest: 2,
    });
    const electionDef = createElectionDefinition(election);
    const allContestIds = election.contests.map((c) => c.id);
    const page1ContestIds = allContestIds.slice(0, 2);
    const page2ContestIds = allContestIds.slice(2);

    const votes: VotesDict = {};
    for (const contest of election.contests) {
      if (contest.type === 'candidate') {
        votes[contest.id] = [contest.candidates[0]];
      }
    }

    const ballotSpecs = [
      {
        ballotStyleId: election.ballotStyles[0].id,
        precinctId: election.precincts[0].id,
        ballotFormat: 'summary' as const,
        votes,
      },
    ];

    vi.mocked(SummaryBallotLayoutRenderer).mockImplementation(
      mockConstructor(
        () =>
          ({
            computePageBreaks: vi.fn().mockResolvedValue([
              { pageNumber: 1, contestIds: page1ContestIds, layout: undefined },
              { pageNumber: 2, contestIds: page2ContestIds, layout: undefined },
            ]),
            close: vi.fn().mockResolvedValue(undefined),
          }) as unknown as SummaryBallotLayoutRenderer
      )
    );

    vi.mocked(renderToPdf).mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ok([Uint8Array.of(0x01), Uint8Array.of(0x02)]) as any
    );
    vi.mocked(concatenatePdfs).mockResolvedValue(Uint8Array.of(0xff));

    await createSummaryBallotTestDeck({
      electionDefinition: electionDef,
      ballotSpecs,
      isLiveMode: false,
    });

    // Verify the votes passed to each page's BmdPaperBallot are filtered
    const renderCall = vi.mocked(renderToPdf).mock.calls[0];
    const documents = renderCall[0] as unknown as Array<{
      document: React.ReactElement;
    }>;

    const page1Votes = documents[0].document.props.votes;
    const page2Votes = documents[1].document.props.votes;

    // Page 1 should only have votes for page 1 contests
    for (const contestId of Object.keys(page1Votes)) {
      expect(page1ContestIds).toContain(contestId);
    }
    // Page 2 should only have votes for page 2 contests
    for (const contestId of Object.keys(page2Votes)) {
      expect(page2ContestIds).toContain(contestId);
    }
  });
});
