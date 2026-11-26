import { Buffer } from 'node:buffer';
import { assert, find, throwIllegalValue } from '@votingworks/basics';
import type { DecodedSummaryBallotPage } from '@votingworks/ballot-encoder';
import type {
  BallotType,
  Contest,
  Election,
  Vote,
  VotesDict,
} from '@votingworks/types';
import type {
  RustCastVoteRecord,
  RustContestVote,
} from './bubble-ballot-ts/types.js';

function convertContestVote(contest: Contest, vote: RustContestVote): Vote {
  switch (vote.type) {
    case 'candidate': {
      assert(contest.type === 'candidate');
      return vote.value.map((candidateVote) =>
        candidateVote.type === 'namedCandidate'
          ? find(contest.candidates, (c) => c.id === candidateVote.candidateId)
          : {
              id: candidateVote.candidateId,
              name: candidateVote.name,
              isWriteIn: true,
            }
      );
    }
    case 'yesNo':
    case 'straightParty':
      return vote.value;
    default:
      throwIllegalValue(vote, 'type');
  }
}

/** Converts a summary ballot page decoded by Rust to its TS representation. */
export function convertSummaryBallotRecord(
  election: Election,
  record: RustCastVoteRecord
): DecodedSummaryBallotPage {
  const votes: VotesDict = {};
  for (const contestId of record.contestIds) {
    const contest = find(election.contests, (c) => c.id === contestId);
    const vote = record.votes[contestId];
    votes[contestId] = vote ? convertContestVote(contest, vote) : [];
  }

  return {
    metadata: {
      ballotHash: Buffer.from(record.ballotHash).toString('hex'),
      ballotStyleId: record.ballotStyleId,
      precinctId: record.precinctId,
      pageNumber: record.pageNumber,
      totalPages: record.totalPages,
      isTestMode: record.isTestMode,
      ballotType: record.ballotType as BallotType,
      ballotAuditId: record.ballotAuditId,
      contestIds: record.contestIds,
    },
    votes,
  };
}
