import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import { readElection } from '@votingworks/fs';
import {
  RendererPool,
  allBaseBallotProps,
  ballotTemplates,
  concatenatePdfs,
  createPlaywrightRendererPool,
  layOutBallotsAndCreateElectionDefinition,
  vxFamousNamesFixtures,
  vxGeneralElectionFixtures,
  vxPrimaryElectionFixtures,
} from '@votingworks/hmpb';
import { assert, find, iter, ok } from '@votingworks/basics';
import {
  buildContestResultsFixture,
  CachedElectionLookups,
  generateTestDeckBallots,
  getBallotStyleGroupsForPrecinctOrSplit,
} from '@votingworks/utils';
import {
  BallotType,
  Election,
  ElectionDefinition,
  hasSplits,
  LanguageCode,
  VotesDict,
} from '@votingworks/types';
import {
  renderToPdf,
  SummaryBallotLayoutRenderer,
} from '@votingworks/printing';
import {
  createTestElection,
  createElectionDefinition,
  createMockVotes,
} from '@votingworks/test-utils';
import {
  createPrecinctTestDeck,
  createPrecinctSummaryBallotTestDeck,
  createTestDeckTallyReports,
  generateTestDeckCastVoteRecords,
  getTallyReportResults,
  precinctTallyReportFileName,
  FULL_TEST_DECK_TALLY_REPORT_FILE_NAME,
} from './test_decks';

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
  return {
    ...actual,
    SummaryBallotLayoutRenderer: vi.fn(
      () => new actual.SummaryBallotLayoutRenderer()
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

let rendererPool: RendererPool;
beforeAll(async () => {
  rendererPool = await createPlaywrightRendererPool();
});
afterAll(async () => {
  await rendererPool.close();
});

describe('createPrecinctTestDeck', () => {
  test('for a precinct with one ballot style', async () => {
    const fixtures = vxFamousNamesFixtures;
    const { electionDefinition } = vxFamousNamesFixtures;
    const { election } = electionDefinition;
    const precinctId = election.precincts[0].id;
    assert(
      CachedElectionLookups.getBallotStylesByPrecinctId(
        electionDefinition,
        precinctId
      ).length === 1
    );
    const { ballotContents } = await layOutBallotsAndCreateElectionDefinition(
      rendererPool,
      ballotTemplates.VxDefaultBallot,
      fixtures.allBallotProps,
      'vxf'
    );
    const ballots = iter(fixtures.allBallotProps)
      .zip(ballotContents)
      .map(([props, contents]) => ({ props, contents }))
      .toArray();

    const ballotSpecs = generateTestDeckBallots({
      election,
      precinctId,
      ballotFormat: 'bubble',
    });
    const testDeckDocument = await createPrecinctTestDeck({
      rendererPool,
      electionDefinition,
      ballotSpecs,
      ballots,
    });
    await expect(testDeckDocument).toMatchPdfSnapshot();
  });

  test('for a precinct with multiple ballot styles', async () => {
    const fixtures = vxPrimaryElectionFixtures;
    const primaryElectionDefinition = fixtures.electionDefinition;
    // Test takes unnecessarily long if using all language ballot styles
    const electionDefinition: ElectionDefinition = {
      ...primaryElectionDefinition,
      election: {
        ...primaryElectionDefinition.election,
        ballotStyles: primaryElectionDefinition.election.ballotStyles.filter(
          (bs) =>
            bs.languages &&
            bs.languages.length === 1 &&
            bs.languages[0] === LanguageCode.ENGLISH
        ),
      },
    };
    const { election } = electionDefinition;
    const ballotProps = allBaseBallotProps(election).filter(
      (props) =>
        props.ballotMode === 'test' && props.ballotType === BallotType.Precinct
    );
    const [precinct] = election.precincts;
    assert(!hasSplits(precinct));
    assert(
      getBallotStyleGroupsForPrecinctOrSplit({
        election,
        precinctOrSplit: { precinct },
      }).length > 1
    );
    const layouts = await layOutBallotsAndCreateElectionDefinition(
      rendererPool,
      ballotTemplates.VxDefaultBallot,
      ballotProps,
      'vxf'
    );
    const ballots = iter(ballotProps)
      .zip(layouts.ballotContents)
      .map(([props, contents]) => ({ props, contents }))
      .toArray();

    const ballotSpecs = generateTestDeckBallots({
      election,
      precinctId: precinct.id,
      ballotFormat: 'bubble',
    });
    const testDeckDocument = await createPrecinctTestDeck({
      rendererPool,
      electionDefinition: layouts.electionDefinition,
      ballotSpecs,
      ballots,
    });
    await expect(testDeckDocument).toMatchPdfSnapshot();
  });

  test('for a precinct with no ballot styles', async () => {
    const fixtures = vxGeneralElectionFixtures.fixtureSpecs[0];
    const electionDefinition = (
      await readElection(fixtures.electionPath)
    ).unsafeUnwrap();

    const testDeckDocument = await createPrecinctTestDeck({
      rendererPool,
      electionDefinition,
      ballotSpecs: [],
      ballots: [], // doesn't matter
    });
    expect(testDeckDocument).toBeUndefined();
  });
});

describe('createPrecinctSummaryBallotTestDeck', () => {
  test('generates summary BMD ballots for a precinct', async () => {
    const { electionDefinition } = vxFamousNamesFixtures;
    const { election } = electionDefinition;
    const precinctId = election.precincts[0].id;

    const ballotSpecs = generateTestDeckBallots({
      election,
      precinctId,
      ballotFormat: 'summary',
    });

    const summaryBallotPdf = await createPrecinctSummaryBallotTestDeck({
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

    const summaryBallotPdf = await createPrecinctSummaryBallotTestDeck({
      electionDefinition,
      ballotSpecs: [],
      isLiveMode: false,
    });

    expect(summaryBallotPdf).toBeUndefined();
  });
});

describe('createTestDeckTallyReports', () => {
  test('without summary ballots', async () => {
    const fixtures = vxGeneralElectionFixtures.fixtureSpecs[0];
    const electionDefinition = (
      await readElection(fixtures.electionPath)
    ).unsafeUnwrap();
    const { election } = electionDefinition;

    const reports = await createTestDeckTallyReports({
      electionDefinition,
      generatedAtTime: new Date('2021-01-01T00:00:00.000'),
      includeSummaryBallots: false,
    });

    // Verify correct number of reports
    expect(reports.size).toEqual(election.precincts.length + 1);

    // Verify full report exists and matches snapshot
    const fullReport = reports.get(FULL_TEST_DECK_TALLY_REPORT_FILE_NAME);
    assert(fullReport);
    await expect(fullReport).toMatchPdfSnapshot({
      customSnapshotIdentifier: 'full-tally-report-no-summary',
      failureThreshold: 0.0001,
    });

    // Verify each precinct report exists and matches snapshot
    for (const precinct of election.precincts) {
      const precinctFileName = precinctTallyReportFileName(precinct.name);
      const precinctReport = reports.get(precinctFileName);
      assert(precinctReport, `Missing report for precinct: ${precinct.name}`);
      const sanitizedName = precinct.name.replaceAll(' ', '_');
      await expect(precinctReport).toMatchPdfSnapshot({
        customSnapshotIdentifier: `precinct-tally-report-${sanitizedName}-no-summary`,
        failureThreshold: 0.0001,
      });
    }
  });

  test('with summary ballots', async () => {
    const fixtures = vxGeneralElectionFixtures.fixtureSpecs[0];
    const electionDefinition = (
      await readElection(fixtures.electionPath)
    ).unsafeUnwrap();
    const { election } = electionDefinition;

    const reports = await createTestDeckTallyReports({
      electionDefinition,
      generatedAtTime: new Date('2021-01-01T00:00:00.000'),
      includeSummaryBallots: true,
    });

    // Verify correct number of reports
    expect(reports.size).toEqual(election.precincts.length + 1);

    // Verify full report exists and matches snapshot
    const fullReport = reports.get(FULL_TEST_DECK_TALLY_REPORT_FILE_NAME);
    assert(fullReport);
    await expect(fullReport).toMatchPdfSnapshot({
      customSnapshotIdentifier: 'full-tally-report-with-summary',
      failureThreshold: 0.0001,
    });

    // Verify each precinct report exists and matches snapshot
    for (const precinct of election.precincts) {
      const precinctFileName = precinctTallyReportFileName(precinct.name);
      const precinctReport = reports.get(precinctFileName);
      assert(precinctReport, `Missing report for precinct: ${precinct.name}`);
      const sanitizedName = precinct.name.replaceAll(' ', '_');
      await expect(precinctReport).toMatchPdfSnapshot({
        customSnapshotIdentifier: `precinct-tally-report-${sanitizedName}-with-summary`,
        failureThreshold: 0.0001,
      });
    }
  });

  test('single-precinct election only generates full report', async () => {
    const { electionDefinition: baseElectionDefinition } =
      vxFamousNamesFixtures;
    const { election: baseElection } = baseElectionDefinition;

    const singlePrecinct = baseElection.precincts[0];
    const singlePrecinctElection: Election = {
      ...baseElection,
      precincts: [singlePrecinct],
      ballotStyles: baseElection.ballotStyles
        .filter((bs) => bs.precincts.includes(singlePrecinct.id))
        .map((bs) => ({ ...bs, precincts: [singlePrecinct.id] })),
    };
    const singlePrecinctElectionDefinition: ElectionDefinition = {
      ...baseElectionDefinition,
      election: singlePrecinctElection,
    };

    const reports = await createTestDeckTallyReports({
      electionDefinition: singlePrecinctElectionDefinition,
      generatedAtTime: new Date('2021-01-01T00:00:00.000'),
      includeSummaryBallots: false,
    });

    expect(reports.size).toEqual(1);
    expect(reports.has(FULL_TEST_DECK_TALLY_REPORT_FILE_NAME)).toEqual(true);
    expect(
      reports.has(precinctTallyReportFileName(singlePrecinct.name))
    ).toEqual(false);
  });
});

describe('getTallyReportResults', () => {
  test('general election without summary ballots', async () => {
    const { electionDefinition } = vxFamousNamesFixtures;
    const { election } = electionDefinition;

    const cvrs = generateTestDeckCastVoteRecords(election, {
      includeSummaryBallots: false,
    });
    const tallyReportResults = await getTallyReportResults(election, cvrs);

    expect(tallyReportResults.hasPartySplits).toEqual(false);
    expect(tallyReportResults.contestIds).toEqual(
      election.contests.map((c) => c.id)
    );
    expect(tallyReportResults.manualResults).toBeUndefined();
    const { scannedResults } = tallyReportResults;
    // Without summary ballots, only HMPB counts
    expect(scannedResults.cardCounts).toEqual({
      bmd: [],
      hmpb: [52],
    });

    // check one contest
    expect(scannedResults.contestResults['board-of-alderman']).toEqual(
      buildContestResultsFixture({
        contest: find(election.contests, (c) => c.id === 'board-of-alderman'),
        contestResultsSummary: {
          type: 'candidate',
          ballots: 52,
          overvotes: 0,
          undervotes: 156,
          officialOptionTallies: {
            'helen-keller': 8,
            'nikola-tesla': 8,
            'pablo-picasso': 4,
            'steve-jobs': 8,
            'vincent-van-gogh': 4,
            'wolfgang-amadeus-mozart': 4,
            'write-in': 16,
          },
        },
        includeGenericWriteIn: true,
      })
    );
  });

  test('general election with summary ballots doubles the counts', async () => {
    const { electionDefinition } = vxFamousNamesFixtures;
    const { election } = electionDefinition;

    const cvrs = generateTestDeckCastVoteRecords(election, {
      includeSummaryBallots: true,
    });
    const tallyReportResults = await getTallyReportResults(election, cvrs);

    expect(tallyReportResults.hasPartySplits).toEqual(false);
    const { scannedResults } = tallyReportResults;
    // With summary ballots, we have both HMPB and BMD counts (doubled)
    expect(scannedResults.cardCounts).toEqual({
      bmd: [52],
      hmpb: [52],
    });

    // check one contest - tallies should be doubled
    expect(scannedResults.contestResults['board-of-alderman']).toEqual(
      buildContestResultsFixture({
        contest: find(election.contests, (c) => c.id === 'board-of-alderman'),
        contestResultsSummary: {
          type: 'candidate',
          ballots: 104, // doubled
          overvotes: 0,
          undervotes: 312, // doubled
          officialOptionTallies: {
            'helen-keller': 16, // doubled
            'nikola-tesla': 16,
            'pablo-picasso': 8,
            'steve-jobs': 16,
            'vincent-van-gogh': 8,
            'wolfgang-amadeus-mozart': 8,
            'write-in': 32,
          },
        },
        includeGenericWriteIn: true,
      })
    );
  });

  test('primary election without summary ballots', async () => {
    const { electionDefinition } = vxPrimaryElectionFixtures;
    const { election } = electionDefinition;

    const cvrs = generateTestDeckCastVoteRecords(election, {
      includeSummaryBallots: false,
    });
    const tallyReportResults = await getTallyReportResults(election, cvrs);

    expect(tallyReportResults.hasPartySplits).toEqual(true);
    expect(tallyReportResults.contestIds).toEqual(
      election.contests.map((c) => c.id)
    );
    expect(tallyReportResults.manualResults).toBeUndefined();
    expect(
      tallyReportResults.hasPartySplits && tallyReportResults.cardCountsByParty
    ).toEqual({
      '0': {
        bmd: [],
        hmpb: [100],
      },
      '1': {
        bmd: [],
        hmpb: [100],
      },
    });
    const { scannedResults } = tallyReportResults;
    expect(scannedResults.cardCounts).toEqual({
      bmd: [],
      hmpb: [200],
      manual: 0,
    });

    // check one contest
    expect(scannedResults.contestResults['county-leader-mammal']).toEqual(
      buildContestResultsFixture({
        contest: find(
          election.contests,
          (c) => c.id === 'county-leader-mammal'
        ),
        contestResultsSummary: {
          type: 'candidate',
          ballots: 100,
          overvotes: 0,
          undervotes: 0,
          officialOptionTallies: {
            fox: 20,
            horse: 40,
            otter: 40,
          },
        },
        includeGenericWriteIn: false,
      })
    );
  });

  test('primary election with summary ballots doubles the counts', async () => {
    const { electionDefinition } = vxPrimaryElectionFixtures;
    const { election } = electionDefinition;

    const cvrs = generateTestDeckCastVoteRecords(election, {
      includeSummaryBallots: true,
    });
    const tallyReportResults = await getTallyReportResults(election, cvrs);

    expect(tallyReportResults.hasPartySplits).toEqual(true);
    expect(
      tallyReportResults.hasPartySplits && tallyReportResults.cardCountsByParty
    ).toEqual({
      '0': {
        bmd: [100],
        hmpb: [100],
      },
      '1': {
        bmd: [100],
        hmpb: [100],
      },
    });
    const { scannedResults } = tallyReportResults;
    expect(scannedResults.cardCounts).toEqual({
      bmd: [200],
      hmpb: [200],
      manual: 0,
    });

    // check one contest - tallies should be doubled
    expect(scannedResults.contestResults['county-leader-mammal']).toEqual(
      buildContestResultsFixture({
        contest: find(
          election.contests,
          (c) => c.id === 'county-leader-mammal'
        ),
        contestResultsSummary: {
          type: 'candidate',
          ballots: 200, // doubled
          overvotes: 0,
          undervotes: 0,
          officialOptionTallies: {
            fox: 40, // doubled
            horse: 80,
            otter: 80,
          },
        },
        includeGenericWriteIn: false,
      })
    );
  });

  test('general election precinct-specific results', async () => {
    const { electionDefinition } = vxFamousNamesFixtures;
    const { election } = electionDefinition;
    const precinct = election.precincts[0];

    const cvrs = generateTestDeckCastVoteRecords(election, {
      includeSummaryBallots: false,
    });
    const precinctCvrs = cvrs.filter((cvr) => cvr.precinctId === precinct.id);
    const tallyReportResults = await getTallyReportResults(
      election,
      precinctCvrs,
      precinct.id
    );

    expect(tallyReportResults.hasPartySplits).toEqual(false);
    // Precinct-specific results only include contests for that precinct
    expect(tallyReportResults.contestIds.length).toEqual(8);
    const { scannedResults } = tallyReportResults;
    expect(scannedResults.cardCounts).toEqual({
      bmd: [],
      hmpb: [13],
    });

    // check one contest - should have precinct-specific counts
    expect(scannedResults.contestResults['board-of-alderman']).toEqual(
      buildContestResultsFixture({
        contest: find(election.contests, (c) => c.id === 'board-of-alderman'),
        contestResultsSummary: {
          type: 'candidate',
          ballots: 13,
          overvotes: 0,
          undervotes: 39,
          officialOptionTallies: {
            'helen-keller': 2,
            'nikola-tesla': 2,
            'pablo-picasso': 1,
            'steve-jobs': 2,
            'vincent-van-gogh': 1,
            'wolfgang-amadeus-mozart': 1,
            'write-in': 4,
          },
        },
        includeGenericWriteIn: true,
      })
    );
  });

  test('primary election precinct-specific results', async () => {
    const { electionDefinition } = vxPrimaryElectionFixtures;
    const { election } = electionDefinition;
    const precinct = election.precincts[0];

    const cvrs = generateTestDeckCastVoteRecords(election, {
      includeSummaryBallots: false,
    });
    const precinctCvrs = cvrs.filter((cvr) => cvr.precinctId === precinct.id);
    const tallyReportResults = await getTallyReportResults(
      election,
      precinctCvrs,
      precinct.id
    );

    expect(tallyReportResults.hasPartySplits).toEqual(true);
    assert(tallyReportResults.hasPartySplits);
    // Precinct-specific results only include contests for that precinct
    expect(tallyReportResults.contestIds.length).toEqual(5);
    expect(tallyReportResults.cardCountsByParty).toEqual({
      '0': {
        bmd: [],
        hmpb: [20],
      },
      '1': {
        bmd: [],
        hmpb: [20],
      },
    });
    const { scannedResults } = tallyReportResults;
    expect(scannedResults.cardCounts).toEqual({
      bmd: [],
      hmpb: [40],
      manual: 0,
    });

    // check one contest - should have precinct-specific counts
    expect(scannedResults.contestResults['county-leader-mammal']).toEqual(
      buildContestResultsFixture({
        contest: find(
          election.contests,
          (c) => c.id === 'county-leader-mammal'
        ),
        contestResultsSummary: {
          type: 'candidate',
          ballots: 20,
          overvotes: 0,
          undervotes: 0,
          officialOptionTallies: {
            fox: 4,
            horse: 8,
            otter: 8,
          },
        },
        includeGenericWriteIn: false,
      })
    );
  });
});

describe('createPrecinctSummaryBallotTestDeck - multi-page flow', () => {
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
      () =>
        ({
          computePageBreaks: mockComputePageBreaks,
          close: mockClose,
        }) as unknown as SummaryBallotLayoutRenderer
    );

    // Mock renderToPdf to return mock PDFs (one per React element)
    const mockPdf1 = Uint8Array.of(0x01);
    const mockPdf2 = Uint8Array.of(0x02);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(renderToPdf).mockResolvedValue(ok([mockPdf1, mockPdf2]) as any);

    // Mock concatenatePdfs to return a combined PDF
    const mockCombinedPdf = Uint8Array.of(0x01, 0x02);
    vi.mocked(concatenatePdfs).mockResolvedValue(mockCombinedPdf);

    const result = await createPrecinctSummaryBallotTestDeck({
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
    expect(page1Props.ballotAuditId).toBeDefined();
    expect(
      page1Props.contestsForPage.map((c: { id: string }) => c.id).sort()
    ).toEqual([...page1ContestIds].sort());

    // Verify page 2 props
    const page2Props = documents[1].document.props;
    expect(page2Props.pageNumber).toEqual(2);
    expect(page2Props.totalPages).toEqual(2);
    expect(page2Props.ballotAuditId).toBeDefined();

    // Same ballotAuditId across both pages
    expect(page1Props.ballotAuditId).toEqual(page2Props.ballotAuditId);

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
      () =>
        ({
          computePageBreaks: mockComputePageBreaks,
          close: vi.fn().mockResolvedValue(undefined),
        }) as unknown as SummaryBallotLayoutRenderer
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

    const result = await createPrecinctSummaryBallotTestDeck({
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

    // Third document is single-page (no pageNumber/totalPages)
    expect(documents[2].document.props.pageNumber).toBeUndefined();
    expect(documents[2].document.props.totalPages).toBeUndefined();

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
      () =>
        ({
          computePageBreaks: vi
            .fn()
            .mockResolvedValue([
              { pageNumber: 1, contestIds: allContestIds, layout: undefined },
            ]),
          close: vi.fn().mockResolvedValue(undefined),
        }) as unknown as SummaryBallotLayoutRenderer
    );
    vi.mocked(renderToPdf).mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ok([Uint8Array.of(0x01), Uint8Array.of(0x02)]) as any
    );
    vi.mocked(concatenatePdfs).mockResolvedValue(Uint8Array.of(0xff));

    const emitProgress = vi.fn();

    await createPrecinctSummaryBallotTestDeck({
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
      () =>
        ({
          computePageBreaks: vi
            .fn()
            .mockRejectedValue(new Error('render failed')),
          close: mockClose,
        }) as unknown as SummaryBallotLayoutRenderer
    );

    await expect(
      createPrecinctSummaryBallotTestDeck({
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
      () =>
        ({
          computePageBreaks: vi.fn().mockResolvedValue([
            { pageNumber: 1, contestIds: page1ContestIds, layout: undefined },
            { pageNumber: 2, contestIds: page2ContestIds, layout: undefined },
          ]),
          close: vi.fn().mockResolvedValue(undefined),
        }) as unknown as SummaryBallotLayoutRenderer
    );

    vi.mocked(renderToPdf).mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ok([Uint8Array.of(0x01), Uint8Array.of(0x02)]) as any
    );
    vi.mocked(concatenatePdfs).mockResolvedValue(Uint8Array.of(0xff));

    await createPrecinctSummaryBallotTestDeck({
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
