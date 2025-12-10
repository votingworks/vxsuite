import { assert, assertDefined, find, uniqueBy } from '@votingworks/basics';
import {
  Admin,
  BallotStyleId,
  BaseBallotProps,
  ContestId,
  Election,
  ElectionDefinition,
  GridLayout,
  Tabulation,
  getGroupIdFromBallotStyleId,
} from '@votingworks/types';
import {
  combineElectionResults,
  convertVotesDictToTabulationVotes,
  filterVotesByContestIds,
  generateTestDeckBallots,
  getBallotStyleIdPartyIdLookup,
  groupMapToGroupList,
  tabulateCastVoteRecords,
  TestDeckBallot as TestDeckBallotSpec,
} from '@votingworks/utils';
import { renderToPdf } from '@votingworks/printing';

import { AdminTallyReportByParty } from '@votingworks/ui';
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

function generateTestDeckCastVoteRecords(
  election: Election
): Tabulation.CastVoteRecord[] {
  const ballotSpecs: TestDeckBallotSpec[] = generateTestDeckBallots({
    election,
    ballotType: 'bubble',
    includeBlankBallots: false,
    includeOvervotedBallots: false,
  });

  const ballotContestLayouts: BallotContestLayout[] = getBallotContestLayouts(
    assertDefined(election.gridLayouts)
  );

  const ballotStyleIdPartyIdLookup = getBallotStyleIdPartyIdLookup(election);

  const cvrs: Tabulation.CastVoteRecord[] = [];
  for (const ballotSpec of ballotSpecs) {
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

  return cvrs;
}

export async function getTallyReportResults(
  election: Election
): Promise<Admin.TallyReportResults> {
  const cvrs = generateTestDeckCastVoteRecords(election);

  if (election.type === 'general') {
    const [electionResults] = groupMapToGroupList(
      await tabulateCastVoteRecords({
        election,
        cvrs,
      })
    );

    return {
      hasPartySplits: false,
      contestIds: election.contests.map(({ id }) => id),
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
    contestIds: election.contests.map(({ id }) => id),
  };
}

/**
 * Returns a PDF of the test deck tally report as a buffer.
 */
export async function createTestDeckTallyReport({
  electionDefinition,
  generatedAtTime,
}: {
  electionDefinition: ElectionDefinition;
  generatedAtTime?: Date;
}): Promise<Uint8Array> {
  const { election } = electionDefinition;

  const tallyReportResults = await getTallyReportResults(election);

  return (
    await renderToPdf({
      document: AdminTallyReportByParty({
        electionDefinition,
        electionPackageHash: undefined,
        title: undefined,
        isOfficial: false,
        isTest: true,
        isForLogicAndAccuracyTesting: true,
        testId: 'full-test-deck-tally-report',
        tallyReportResults,
        generatedAtTime: generatedAtTime ?? new Date(),
      }),
    })
  ).unsafeUnwrap();
}

export const FULL_TEST_DECK_TALLY_REPORT_FILE_NAME =
  'full-test-deck-tally-report.pdf';
