import {
  assert,
  assertDefined,
  find,
  iter,
  uniqueBy,
} from '@votingworks/basics';
import {
  Contest,
  WriteInCandidate,
  CandidateContest,
  Candidate,
  Election,
  PrecinctId,
  getContests,
  VotesDict,
  BallotStyleId,
  ContestId,
  GridLayout,
  Tabulation,
  getGroupIdFromBallotStyleId,
  straightPartyNotYetImplemented,
  Admin,
} from '@votingworks/types';
import {
  combineElectionResults,
  convertVotesDictToTabulationVotes,
  filterVotesByContestIds,
  getBallotStyleIdPartyIdLookup,
  getContestsForPrecinctAndElection,
  groupMapToGroupList,
  singlePrecinctSelectionFor,
  tabulateCastVoteRecords,
} from '@votingworks/utils';

/**
 * The type of ballot in a test deck:
 * - `bubble`: Bubble ballot (hmpb)
 * - `summary`: Summary ballot with QR-encoded votes
 */
export type TestDeckBallotFormat = 'bubble' | 'summary';

export interface TestDeckBallot {
  ballotStyleId: BallotStyleId;
  precinctId: PrecinctId;
  ballotFormat: TestDeckBallotFormat;
  votes: VotesDict;
}

export function numBallotPositions(contest: Contest): number {
  /* istanbul ignore next */
  if (contest.type === 'straight-party') {
    return straightPartyNotYetImplemented();
  }
  if (contest.type === 'candidate') {
    return (
      contest.candidates.length + (contest.allowWriteIns ? contest.seats : 0)
    );
  }
  return 2;
}

export function generateTestDeckWriteIn(index: number): WriteInCandidate {
  return {
    id: 'write-in',
    isWriteIn: true,
    name: 'WRITE-IN',
    writeInIndex: index,
  };
}

export function getTestDeckCandidateAtIndex(
  contest: CandidateContest,
  position: number
): Candidate {
  assert(position < numBallotPositions(contest)); // safety check
  if (position < contest.candidates.length) {
    return assertDefined(contest.candidates[position]);
  }
  return generateTestDeckWriteIn(position - contest.candidates.length);
}

interface GenerateTestDeckParams {
  election: Election;
  precinctId?: PrecinctId;
  ballotFormat: TestDeckBallotFormat;
  includeOvervotedBallots?: boolean;
  includeBlankBallots?: boolean;
}

export function generateTestDeckBallots({
  election,
  precinctId,
  ballotFormat,
  includeOvervotedBallots = true,
  includeBlankBallots = true,
}: GenerateTestDeckParams): TestDeckBallot[] {
  const precincts: string[] = precinctId
    ? [precinctId]
    : election.precincts.map((p) => p.id);

  const ballots: TestDeckBallot[] = [];

  for (const currentPrecinctId of precincts) {
    const precinct = find(
      election.precincts,
      (p) => p.id === currentPrecinctId
    );
    const precinctBallotStyles = election.ballotStyles.filter((bs) =>
      bs.precincts.includes(precinct.id)
    );

    for (const ballotStyle of precinctBallotStyles) {
      const contests = getContests({ election, ballotStyle });

      const numBallots = Math.max(
        ...contests.map((c) => numBallotPositions(c))
      );

      for (let ballotNum = 0; ballotNum < numBallots; ballotNum += 1) {
        const votes: VotesDict = {};
        for (const contest of contests) {
          if (contest.type === 'measure') {
            votes[contest.id] =
              ballotNum % 2 === 0
                ? [contest.options[0].id]
                : [contest.options[1].id];
          } else if (
            contest.type === 'candidate' &&
            contest.candidates.length > 0 // safety check
          ) {
            const choiceIndex = ballotNum % numBallotPositions(contest);
            votes[contest.id] = [
              getTestDeckCandidateAtIndex(contest, choiceIndex),
            ];
          }
        }
        ballots.push({
          ballotStyleId: ballotStyle.id,
          precinctId: currentPrecinctId,
          ballotFormat,
          votes,
        });
      }

      // Overvote and blank ballots only make sense for HMPB test decks
      if (ballotFormat === 'bubble') {
        if (includeOvervotedBallots) {
          // Generates a minimally overvoted ballot - a single overvote in the
          // first contest where an overvote is possible. Does not overvote
          // candidate contests where you must select a write-in to overvote. See
          // discussion: https://github.com/votingworks/vxsuite/issues/1711.
          const overvoteContest = contests.find((contest) => {
            /* istanbul ignore next */
            if (contest.type === 'straight-party') {
              straightPartyNotYetImplemented();
            }
            return (
              contest.type === 'measure' ||
              contest.candidates.length > contest.seats
            );
          });
          if (overvoteContest) {
            /* istanbul ignore next */
            if (overvoteContest.type === 'straight-party') {
              straightPartyNotYetImplemented();
            }
            ballots.push({
              ballotStyleId: ballotStyle.id,
              precinctId: currentPrecinctId,
              ballotFormat,
              votes: {
                [overvoteContest.id]:
                  overvoteContest.type === 'measure'
                    ? [
                        overvoteContest.options[0].id,
                        overvoteContest.options[1].id,
                      ]
                    : iter(overvoteContest.candidates)
                        .take(overvoteContest.seats + 1)
                        .toArray(),
              },
            });
          }
        }

        if (includeBlankBallots) {
          ballots.push({
            ballotStyleId: ballotStyle.id,
            precinctId: currentPrecinctId,
            ballotFormat,
            votes: {},
          });
          ballots.push({
            ballotStyleId: ballotStyle.id,
            precinctId: currentPrecinctId,
            ballotFormat,
            votes: {},
          });
        }
      }
    }
  }

  return ballots;
}

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
      const { sheetNumber, contestId } = contestOption;
      assertDefined(contestIdsBySheet[sheetNumber - 1]).push(contestId);
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
  const hmpbBallotSpecs: TestDeckBallot[] = generateTestDeckBallots({
    election,
    ballotFormat: 'bubble',
    includeBlankBallots: false,
    includeOvervotedBallots: false,
  });

  // Generate summary ballot specs if configured
  const summaryBallotSpecs: TestDeckBallot[] = includeSummaryBallots
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
    ? getContestsForPrecinctAndElection(
        election,
        singlePrecinctSelectionFor(precinctId)
      ).map(({ id }) => id)
    : election.contests.map(({ id }) => id);

  if (election.type === 'general') {
    const electionResults = assertDefined(
      groupMapToGroupList(
        await tabulateCastVoteRecords({
          election,
          cvrs,
        })
      )[0]
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
    assert(partyId !== undefined && !Tabulation.isNoPartyId(partyId));
    cardCountsByParty[partyId] = partyElectionResults.cardCounts;
  }

  return {
    hasPartySplits: true,
    cardCountsByParty,
    scannedResults: electionResults,
    contestIds,
  };
}
