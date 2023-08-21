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
  electionHasPrimaryContest,
} from '@votingworks/types';
import { assert, find, mapObject } from '@votingworks/basics';
import type { TallyReportResults } from '@votingworks/admin-backend';
import {
  getBallotStyleIdPartyIdLookup,
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

const superBallotStyleId = 'vx-super-ballot';
/**
 * Returns whether a ballot style ID corresponds to the super ballot, a special ballot only
 * available to system admins that includes all contests across all precincts
 */
export function isSuperBallotStyle(ballotStyleId: BallotStyleId): boolean {
  return ballotStyleId === superBallotStyleId;
}

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

const yesOrNo: YesNoVote[] = [['yes'], ['no']];

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
            votes[contest.id] = yesOrNo[ballotNum % 2];
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

export function generateBlankBallots({
  election,
  precinctId,
  numBlanks,
}: {
  election: Election;
  precinctId: PrecinctId;
  numBlanks: number;
}): TestDeckBallot[] {
  const ballots: TestDeckBallot[] = [];

  const blankBallotStyle = election.ballotStyles.find((bs) =>
    bs.precincts.includes(precinctId)
  );

  if (blankBallotStyle && numBlanks > 0) {
    for (let blankNum = 0; blankNum < numBlanks; blankNum += 1) {
      ballots.push({
        ballotStyleId: blankBallotStyle.id,
        precinctId,
        markingMethod: 'hand',
        votes: {},
      });
    }
  }

  return ballots;
}

// Generates a minimally overvoted ballot - a single overvote in the first contest where an
// overvote is possible. Does not overvote candidate contests where you must select a write-in
// to overvote. See discussion: https://github.com/votingworks/vxsuite/issues/1711.
//
// In cases where it is not possible to overvote a ballot style, returns undefined.
export function generateOvervoteBallot({
  election,
  precinctId,
}: {
  election: Election;
  precinctId: PrecinctId;
}): TestDeckBallot | undefined {
  const precinctBallotStyles = election.ballotStyles.filter((bs) =>
    bs.precincts.includes(precinctId)
  );

  const votes: VotesDict = {};
  for (const ballotStyle of precinctBallotStyles) {
    const contests = election.contests.filter((c) => {
      const contestPartyId = c.type === 'candidate' ? c.partyId : undefined;
      return (
        ballotStyle.districts.includes(c.districtId) &&
        ballotStyle.partyId === contestPartyId
      );
    });

    const candidateContests = contests.filter(
      (c) => c.type === 'candidate'
    ) as CandidateContest[];
    const otherContests = contests.filter((c) => c.type !== 'candidate');

    for (const candidateContest of candidateContests) {
      if (candidateContest.candidates.length > candidateContest.seats) {
        votes[candidateContest.id] = candidateContest.candidates.slice(
          0,
          candidateContest.seats + 1
        );
        return {
          ballotStyleId: ballotStyle.id,
          precinctId,
          markingMethod: 'hand',
          votes,
        };
      }
    }

    if (otherContests.length > 0) {
      const otherContest = otherContests[0];
      if (otherContest.type === 'yesno') {
        votes[otherContest.id] = ['yes', 'no'];
      }
      return {
        ballotStyleId: ballotStyle.id,
        precinctId,
        markingMethod: 'hand',
        votes,
      };
    }
  }
  return undefined;
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
  election,
  testDeckBallots,
}: {
  election: Election;
  testDeckBallots: TestDeckBallot[];
}): Promise<Tabulation.GroupList<TallyReportResults>> {
  const ballotStyleIdPartyIdLookup = getBallotStyleIdPartyIdLookup(election);

  return groupMapToGroupList(
    mapObject(
      await tabulateCastVoteRecords({
        election,
        cvrs: testDeckBallots.map((testDeckBallot) => ({
          ...testDeckBallotToCastVoteRecord(testDeckBallot),
          partyId: ballotStyleIdPartyIdLookup[testDeckBallot.ballotStyleId],
        })),
        groupBy: electionHasPrimaryContest(election)
          ? { groupByParty: true }
          : undefined,
      }),
      (scannedResults) => ({ scannedResults })
    )
  );
}
