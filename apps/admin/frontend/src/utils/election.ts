import {
  AnyContest,
  Candidate,
  CandidateContest,
  Election,
  getContests,
  Party,
  VotesDict,
  PartyId,
  BallotStyleId,
  PrecinctId,
  WriteInCandidate,
  YesNoVote,
  Tabulation,
  CandidateVote,
  ElectionDefinition,
} from '@votingworks/types';
import { assert, find } from '@votingworks/basics';
import type {
  CardCountsByParty,
  TallyReportResults,
} from '@votingworks/admin-backend';
import {
  getBallotStyleIdPartyIdLookup,
  getContestsForPrecinct,
  getEmptyCardCounts,
  groupMapToGroupList,
  tabulateCastVoteRecords,
} from '@votingworks/utils';

export interface TestDeckBallot {
  ballotStyleId: BallotStyleId;
  precinctId: PrecinctId;
  markingMethod: 'hand' | 'machine';
  votes: VotesDict;
}

export function getPartiesWithPrimaryElections(election: Election): Party[] {
  const partyIds = election.ballotStyles
    .map((bs) => bs.partyId)
    .filter((id): id is PartyId => id !== undefined);
  return election.parties.filter((party) => partyIds.includes(party.id));
}

/**
 * Returns whether a ballot style ID corresponds to the super ballot, a special ballot only
 * available to system admins that includes all contests across all precincts
 */
export function numBallotPositions(contest: AnyContest): number {
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
    return contest.candidates[position];
  }
  return generateTestDeckWriteIn(position - contest.candidates.length);
}

interface GenerateTestDeckParams {
  election: Election;
  precinctId?: PrecinctId;
  markingMethod: TestDeckBallot['markingMethod'];
}

export function generateTestDeckBallots({
  election,
  precinctId,
  markingMethod,
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
          if (contest.type === 'yesno') {
            votes[contest.id] =
              ballotNum % 2 === 0
                ? [contest.yesOption.id]
                : [contest.noOption.id];
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
          markingMethod,
          votes,
        });
      }
    }
  }

  return ballots;
}

export function testDeckBallotToCastVoteRecord(
  testDeckBallot: TestDeckBallot
): Tabulation.CastVoteRecord {
  const votes: Tabulation.CastVoteRecord['votes'] = {};

  for (const [contestId, vote] of Object.entries(testDeckBallot.votes)) {
    if (vote) {
      if (typeof vote[0] === 'string') {
        // yes no vote
        const yesNoVote = vote as YesNoVote;
        votes[contestId] = [...yesNoVote];
      } else {
        // candidate vote
        const candidates = vote as CandidateVote;
        votes[contestId] = candidates.map((c) => c.id);
      }
    }
  }

  return {
    votes,
    precinctId: testDeckBallot.precinctId,
    ballotStyleId: testDeckBallot.ballotStyleId,
    votingMethod: 'precinct',
    scannerId: 'test-deck',
    batchId: 'test-deck',
    card:
      testDeckBallot.markingMethod === 'machine'
        ? { type: 'bmd' }
        : { type: 'hmpb', sheetNumber: 1 },
  };
}

export async function generateResultsFromTestDeckBallots({
  electionDefinition,
  testDeckBallots,
  precinctId,
}: {
  electionDefinition: ElectionDefinition;
  testDeckBallots: TestDeckBallot[];
  precinctId?: PrecinctId;
}): Promise<TallyReportResults> {
  const { election } = electionDefinition;
  const ballotStyleIdPartyIdLookup = getBallotStyleIdPartyIdLookup(election);

  const scannedResults = groupMapToGroupList(
    await tabulateCastVoteRecords({
      election,
      cvrs: testDeckBallots.map((testDeckBallot) => ({
        ...testDeckBallotToCastVoteRecord(testDeckBallot),
        partyId: ballotStyleIdPartyIdLookup[testDeckBallot.ballotStyleId],
      })),
    })
  )[0];
  const contestIds = getContestsForPrecinct(electionDefinition, precinctId).map(
    (c) => c.id
  );

  if (election.type === 'general') {
    return {
      scannedResults,
      contestIds,
      hasPartySplits: false,
      cardCounts: scannedResults.cardCounts,
    };
  }

  assert(election.type === 'primary');
  const cardCountsByParty: CardCountsByParty = new Map();
  for (const testDeckBallot of testDeckBallots) {
    const partyId = ballotStyleIdPartyIdLookup[testDeckBallot.ballotStyleId];
    const partyCardCounts =
      cardCountsByParty.get(partyId) ?? getEmptyCardCounts();
    partyCardCounts.bmd += 1;
    cardCountsByParty.set(partyId, partyCardCounts);
  }

  return {
    scannedResults,
    contestIds,
    hasPartySplits: true,
    cardCountsByParty,
  };
}
