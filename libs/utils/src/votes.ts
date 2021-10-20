import {
  Candidate,
  CandidateContest,
  CandidateVote,
  CastVoteRecord,
  ContestOptionTally,
  ContestTally,
  Dictionary,
  Election,
  expandEitherNeitherContests,
  getDistrictIdsForPartyId,
  getEitherNeitherContests,
  Tally,
  VotesDict,
  VotingMethod,
  YesNoContest,
  YesNoVote,
  YesNoVoteID,
  YesOrNo,
} from '@votingworks/types';
import { strict as assert } from 'assert';
import { find } from './find';

export function getSingleYesNoVote(vote?: YesNoVote): YesOrNo | undefined {
  if (vote?.length === 1) {
    return vote[0];
  }
  return undefined;
}

export const writeInCandidate: Candidate = {
  id: '__write-in',
  name: 'Write-In',
  isWriteIn: true,
};

export function normalizeWriteInId(candidateId: string): string {
  if (
    candidateId.startsWith('__writein') ||
    candidateId.startsWith('__write-in') ||
    candidateId.startsWith('writein') ||
    candidateId.startsWith('write-in')
  ) {
    return writeInCandidate.id;
  }

  return candidateId;
}

export function buildVoteFromCvr({
  election,
  cvr,
}: {
  election: Election;
  cvr: CastVoteRecord;
}): VotesDict {
  const vote: VotesDict = {};
  const mutableCVR = { ...cvr };

  // If the CVR is malformed for this question -- only one of the pair'ed contest IDs
  // is there -- we don't want to count this as a ballot in this contest.
  for (const c of getEitherNeitherContests(election.contests)) {
    const hasEitherNeither = mutableCVR[c.eitherNeitherContestId] !== undefined;
    const hasPickOne = mutableCVR[c.pickOneContestId] !== undefined;

    if (!(hasEitherNeither && hasPickOne)) {
      mutableCVR[c.eitherNeitherContestId] = undefined;
      mutableCVR[c.pickOneContestId] = undefined;
    }
  }

  for (const contest of expandEitherNeitherContests(election.contests)) {
    if (!mutableCVR[contest.id]) {
      continue;
    }

    if (contest.type === 'yesno') {
      // the CVR is encoded the same way
      vote[contest.id] = mutableCVR[contest.id] as unknown as YesNoVote;
      continue;
    }

    /* istanbul ignore else */
    if (contest.type === 'candidate') {
      vote[contest.id] = (mutableCVR[contest.id] as string[])
        .map((candidateId) => normalizeWriteInId(candidateId))
        .map((candidateId) =>
          find(
            [writeInCandidate, ...contest.candidates],
            (c) => c.id === candidateId
          )
        );
    }
  }

  return vote;
}

/**
 * Gets all the vote options a voter can make for a given yes/no contest.
 */
export function getContestVoteOptionsForYesNoContest(
  contest: YesNoContest
): readonly YesNoVoteID[] {
  assert.equal(contest.type, 'yesno');
  return ['yes', 'no'];
}

/**
 * Gets all the vote options a voter can make for a given contest. If write-ins are allowed a single write-in candidate ID is included.
 * @returns ContestVoteOption[] ex. ['yes', 'no'] or ['aaron', 'bob', '__write-in']
 */
export function getContestVoteOptionsForCandidateContest(
  contest: CandidateContest
): readonly Candidate[] {
  const options = contest.candidates;
  if (contest.allowWriteIns) {
    return options.concat(writeInCandidate);
  }
  return options;
}

export function getVotingMethodForCastVoteRecord(
  CVR: CastVoteRecord
): VotingMethod {
  return Object.values(VotingMethod).includes(CVR._ballotType as VotingMethod)
    ? (CVR._ballotType as VotingMethod)
    : VotingMethod.Unknown;
}

interface TallyParams {
  election: Election;
  votes: VotesDict[];
  filterContestsByParty?: string;
}
export function tallyVotesByContest({
  election,
  votes,
  filterContestsByParty,
}: TallyParams): Dictionary<ContestTally> {
  const contestTallies: Dictionary<ContestTally> = {};
  const { contests } = election;

  const districtsForParty = filterContestsByParty
    ? getDistrictIdsForPartyId(election, filterContestsByParty)
    : [];

  for (const contest of expandEitherNeitherContests(contests)) {
    if (
      filterContestsByParty === undefined ||
      (districtsForParty.includes(contest.districtId) &&
        contest.partyId === filterContestsByParty)
    ) {
      const tallies: Dictionary<ContestOptionTally> = {};
      if (contest.type === 'yesno') {
        tallies.yes = { option: ['yes'], tally: 0 };
        tallies.no = { option: ['no'], tally: 0 };
      }

      if (contest.type === 'candidate') {
        for (const candidate of contest.candidates) {
          tallies[candidate.id] = { option: candidate, tally: 0 };
        }
        if (contest.allowWriteIns) {
          tallies[writeInCandidate.id] = { option: writeInCandidate, tally: 0 };
        }
      }

      let numberOfUndervotes = 0;
      let numberOfOvervotes = 0;
      let numberOfVotes = 0;
      for (const vote of votes) {
        const selected = vote[contest.id];
        if (!selected) {
          continue;
        }

        numberOfVotes += 1;
        // overvotes & undervotes
        const maxSelectable = contest.type === 'yesno' ? 1 : contest.seats;
        if (selected.length > maxSelectable) {
          numberOfOvervotes += maxSelectable;
          continue;
        }
        if (selected.length < maxSelectable) {
          numberOfUndervotes += maxSelectable - selected.length;
        }
        if (selected.length === 0) {
          continue;
        }

        if (contest.type === 'yesno') {
          const optionId = selected[0] as string;
          const optionTally = tallies[optionId];
          assert(optionTally);
          tallies[optionId] = {
            option: optionTally.option,
            tally: optionTally.tally + 1,
          };
        } else {
          for (const selectedOption of selected as CandidateVote) {
            const optionTally = tallies[selectedOption.id];
            assert(optionTally);
            tallies[selectedOption.id] = {
              option: optionTally.option,
              tally: optionTally.tally + 1,
            };
          }
        }
      }
      const metadataForContest = {
        undervotes: numberOfUndervotes,
        overvotes: numberOfOvervotes,
        ballots: numberOfVotes,
      };

      contestTallies[contest.id] = {
        contest,
        tallies,
        metadata: metadataForContest,
      };
    }
  }

  return contestTallies;
}

export function calculateTallyForCastVoteRecords(
  election: Election,
  castVoteRecords: Set<CastVoteRecord>,
  filterContestsByParty?: string
): Tally {
  const allVotes: VotesDict[] = [];
  const ballotCountsByVotingMethod: Dictionary<number> = {};
  for (const votingMethod of Object.values(VotingMethod)) {
    ballotCountsByVotingMethod[votingMethod] = 0;
  }
  for (const CVR of castVoteRecords) {
    const vote = buildVoteFromCvr({ election, cvr: CVR });
    const votingMethod = getVotingMethodForCastVoteRecord(CVR);
    const count = ballotCountsByVotingMethod[votingMethod];
    assert(typeof count !== 'undefined');
    ballotCountsByVotingMethod[votingMethod] = count + 1;
    allVotes.push(vote);
  }

  const overallTally = tallyVotesByContest({
    election,
    votes: allVotes,
    filterContestsByParty,
  });

  return {
    contestTallies: overallTally,
    castVoteRecords,
    numberOfBallotsCounted: allVotes.length,
    ballotCountsByVotingMethod,
  };
}
