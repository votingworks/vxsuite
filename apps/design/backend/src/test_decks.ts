import { assert, assertDefined, find, uniqueBy } from '@votingworks/basics';
import {
  Admin,
  BallotStyleId,
  BaseBallotProps,
  ContestId,
  Election,
  ElectionDefinition,
  GridLayout,
  PrecinctId,
  Tabulation,
  getGroupIdFromBallotStyleId,
} from '@votingworks/types';
import {
  combineElectionResults,
  convertVotesDictToTabulationVotes,
  filterVotesByContestIds,
  generateTestDeckBallots,
  getBallotStyleIdPartyIdLookup,
  getContestsForPrecinctAndElection,
  groupMapToGroupList,
  tabulateCastVoteRecords,
  TestDeckBallot as TestDeckBallotSpec,
} from '@votingworks/utils';
import { renderToPdf } from '@votingworks/printing';
import React from 'react';

import { AdminTallyReportByParty, BmdPaperBallot } from '@votingworks/ui';
import {
  markBallotDocument,
  concatenatePdfs,
  renderBallotPdfWithMetadataQrCode,
  RendererPool,
} from '@votingworks/hmpb';

/**
 * Creates a test deck for a precinct that includes:
 * - Pre-voted ballots that cover all contest options
 * - 2 blank ballots
 * - 1 overvoted ballot
 *
 * The test deck is one long document (intended to be rendered as a single PDF).
 */
export async function createPrecinctTestDeck({
  rendererPool,
  electionDefinition,
  ballotSpecs,
  ballots,
  emitProgress,
}: {
  rendererPool: RendererPool;
  electionDefinition: ElectionDefinition;
  ballotSpecs: TestDeckBallotSpec[];
  ballots: Array<{ props: BaseBallotProps; contents: string }>;
  emitProgress?: (ballotsRendered: number) => void;
}): Promise<Uint8Array | undefined> {
  if (ballotSpecs.length === 0) {
    return undefined;
  }
  const markedBallots = await rendererPool.runTasks(
    ballotSpecs.map((ballotSpec) => async (renderer) => {
      const { props, contents } = find(
        ballots,
        (ballot) =>
          ballot.props.ballotStyleId === ballotSpec.ballotStyleId &&
          ballot.props.precinctId === ballotSpec.precinctId
      );
      const document = await renderer.loadDocumentFromContent(contents);
      const markedBallot = await markBallotDocument(document, ballotSpec.votes);
      const ballotPdf = await renderBallotPdfWithMetadataQrCode(
        props,
        markedBallot,
        electionDefinition
      );
      return ballotPdf;
    }),
    emitProgress
  );
  return await concatenatePdfs(markedBallots);
}

/**
 * Creates a test deck of summary BMD ballots for a precinct and the given ballot specs.
 */
export async function createPrecinctSummaryBallotTestDeck({
  electionDefinition,
  ballotSpecs,
  isLiveMode,
  emitProgress,
}: {
  electionDefinition: ElectionDefinition;
  ballotSpecs: TestDeckBallotSpec[];
  isLiveMode: boolean;
  emitProgress?: (ballotsRendered: number) => void;
}): Promise<Uint8Array | undefined> {
  if (ballotSpecs.length === 0) {
    return undefined;
  }

  // Create all ballot React elements
  const reactDocuments = ballotSpecs.map((ballotSpec) => ({
    document: React.createElement(BmdPaperBallot, {
      electionDefinition,
      ballotStyleId: ballotSpec.ballotStyleId,
      precinctId: ballotSpec.precinctId,
      votes: ballotSpec.votes,
      isLiveMode,
      machineType: 'mark' as const,
    }),
  }));

  // Render all ballots in a single batch call for better performance
  const pdfResults = await renderToPdf(reactDocuments);
  const ballotPdfs = pdfResults.unsafeUnwrap();

  // Emit progress after all ballots are rendered
  emitProgress?.(ballotSpecs.length);

  return await concatenatePdfs(ballotPdfs);
}

/**
 * In order to generate CVRs per sheet, we want to know how contests are
 * arranged by sheet so we can arrange the votes accordingly.
 */
interface BallotContestLayout {
  ballotStyleId: BallotStyleId;
  contestIdsBySheet: Array<ContestId[]>;
}

function getBallotContestLayouts(
  gridLayouts: readonly GridLayout[]
): BallotContestLayout[] {
  return gridLayouts.map((gridLayout) => {
    const { ballotStyleId } = gridLayout;
    const numSheets = Math.max(
      ...gridLayout.gridPositions.map((gp) => gp.sheetNumber)
    );
    const contestIdsBySheet: BallotContestLayout['contestIdsBySheet'] =
      Array.from({
        length: numSheets,
      }).map(() => []);
    const oneContestOptionPerContest = uniqueBy(
      gridLayout.gridPositions,
      ({ contestId }) => contestId
    );
    for (const contestOption of oneContestOptionPerContest) {
      const { contestId } = contestOption;
      const { sheetNumber } = contestOption;
      contestIdsBySheet[sheetNumber - 1].push(contestId);
    }
    return {
      ballotStyleId,
      contestIdsBySheet,
    };
  });
}

export function generateTestDeckCastVoteRecords(
  election: Election,
  options: { includeSummaryBallots: boolean }
): Tabulation.CastVoteRecord[] {
  const { includeSummaryBallots = false } = options;

  // Generate HMPB ballot specs
  const hmpbBallotSpecs: TestDeckBallotSpec[] = generateTestDeckBallots({
    election,
    ballotFormat: 'bubble',
    includeBlankBallots: false,
    includeOvervotedBallots: false,
  });

  // Generate summary ballot specs if configured
  const summaryBallotSpecs: TestDeckBallotSpec[] = includeSummaryBallots
    ? generateTestDeckBallots({
        election,
        ballotFormat: 'summary',
        includeBlankBallots: false,
        includeOvervotedBallots: false,
      })
    : [];

  const ballotContestLayouts: BallotContestLayout[] = getBallotContestLayouts(
    assertDefined(election.gridLayouts)
  );

  const ballotStyleIdPartyIdLookup = getBallotStyleIdPartyIdLookup(election);

  const cvrs: Tabulation.CastVoteRecord[] = [];

  // Process HMPB ballots
  for (const ballotSpec of hmpbBallotSpecs) {
    const ballotStyleGroupId = getGroupIdFromBallotStyleId({
      ballotStyleId: ballotSpec.ballotStyleId,
      election,
    });
    const CVR_ATTRIBUTES = {
      precinctId: ballotSpec.precinctId,
      ballotStyleGroupId,
      partyId: ballotStyleIdPartyIdLookup[ballotStyleGroupId],
      scannerId: 'test-deck',
      batchId: 'test-deck',
      votingMethod: 'precinct',
    } as const;

    const ballotContestLayout = find(
      ballotContestLayouts,
      ({ ballotStyleId }) => ballotStyleId === ballotSpec.ballotStyleId
    );

    // HMPB ballots may be multiple sheets, so generate a CVR for each sheet
    for (const [
      sheetZeroIndex,
      sheetContestIds,
    ] of ballotContestLayout.contestIdsBySheet.entries()) {
      cvrs.push({
        votes: filterVotesByContestIds({
          votes: convertVotesDictToTabulationVotes(ballotSpec.votes),
          contestIds: sheetContestIds,
        }),
        card: { type: 'hmpb', sheetNumber: sheetZeroIndex + 1 },
        ...CVR_ATTRIBUTES,
      });
    }
  }

  // Process summary ballots
  for (const ballotSpec of summaryBallotSpecs) {
    const ballotStyleGroupId = getGroupIdFromBallotStyleId({
      ballotStyleId: ballotSpec.ballotStyleId,
      election,
    });
    const CVR_ATTRIBUTES = {
      precinctId: ballotSpec.precinctId,
      ballotStyleGroupId,
      partyId: ballotStyleIdPartyIdLookup[ballotStyleGroupId],
      scannerId: 'test-deck',
      batchId: 'test-deck',
      votingMethod: 'precinct',
    } as const;

    // Summary/BMD ballots contain all votes on a single "sheet" (the QR code)
    cvrs.push({
      votes: convertVotesDictToTabulationVotes(ballotSpec.votes),
      card: { type: 'bmd' },
      ...CVR_ATTRIBUTES,
    });
  }

  return cvrs;
}

/**
 * Builds tally report results from CVRs, optionally filtered to a specific precinct.
 */
export async function getTallyReportResults(
  election: Election,
  cvrs: Tabulation.CastVoteRecord[],
  precinctId?: PrecinctId
): Promise<Admin.TallyReportResults> {
  const contestIds = precinctId
    ? getContestsForPrecinctAndElection(election, {
        kind: 'SinglePrecinct',
        precinctId,
      }).map(({ id }) => id)
    : election.contests.map(({ id }) => id);

  if (election.type === 'general') {
    const [electionResults] = groupMapToGroupList(
      await tabulateCastVoteRecords({
        election,
        cvrs,
      })
    );

    return {
      hasPartySplits: false,
      contestIds,
      scannedResults: electionResults,
      cardCounts: electionResults.cardCounts,
    };
  }

  // for primaries, we need to get card counts split by party
  const electionResultsByParty = groupMapToGroupList(
    await tabulateCastVoteRecords({
      election,
      groupBy: { groupByParty: true },
      cvrs,
    })
  );

  const electionResults = combineElectionResults({
    election,
    allElectionResults: electionResultsByParty,
  });
  const cardCountsByParty: Admin.CardCountsByParty = {};
  for (const partyElectionResults of electionResultsByParty) {
    const { partyId } = partyElectionResults;
    assert(partyId !== undefined);
    cardCountsByParty[partyId] = partyElectionResults.cardCounts;
  }

  return {
    hasPartySplits: true,
    cardCountsByParty,
    scannedResults: electionResults,
    contestIds,
  };
}

export const FULL_TEST_DECK_TALLY_REPORT_FILE_NAME =
  'full-test-deck-tally-report.pdf';

export function precinctTallyReportFileName(precinctName: string): string {
  return `${precinctName.replaceAll(' ', '_')}-test-deck-tally-report.pdf`;
}

/**
 * Returns a map of filename -> PDF for all test deck tally reports:
 * - One full test deck tally report
 * - One tally report per precinct
 */
export async function createTestDeckTallyReports({
  electionDefinition,
  generatedAtTime = new Date(),
  includeSummaryBallots,
}: {
  electionDefinition: ElectionDefinition;
  generatedAtTime?: Date;
  includeSummaryBallots: boolean;
}): Promise<Map<string, Uint8Array>> {
  const { election } = electionDefinition;
  const reports = new Map<string, Uint8Array>();

  const cvrs = generateTestDeckCastVoteRecords(election, {
    includeSummaryBallots,
  });

  const fullTallyReportResults = await getTallyReportResults(election, cvrs);
  const fullReport = (
    await renderToPdf({
      document: AdminTallyReportByParty({
        electionDefinition,
        electionPackageHash: undefined,
        title: undefined,
        isOfficial: false,
        isTest: true,
        isForLogicAndAccuracyTesting: true,
        testId: 'full-test-deck-tally-report',
        tallyReportResults: fullTallyReportResults,
        generatedAtTime,
      }),
    })
  ).unsafeUnwrap();
  reports.set(FULL_TEST_DECK_TALLY_REPORT_FILE_NAME, fullReport);

  // Generate per-precinct tally reports
  for (const precinct of election.precincts) {
    const precinctCvrs = cvrs.filter((cvr) => cvr.precinctId === precinct.id);
    const tallyReportResults = await getTallyReportResults(
      election,
      precinctCvrs,
      precinct.id
    );
    const precinctReport = (
      await renderToPdf({
        document: AdminTallyReportByParty({
          electionDefinition,
          electionPackageHash: undefined,
          title: `${precinct.name} Tally Report`,
          isOfficial: false,
          isTest: true,
          isForLogicAndAccuracyTesting: true,
          testId: `test-deck-tally-report-${precinct.id}`,
          tallyReportResults,
          generatedAtTime,
        }),
      })
    ).unsafeUnwrap();
    reports.set(precinctTallyReportFileName(precinct.name), precinctReport);
  }

  return reports;
}
