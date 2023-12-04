import { assert, assertDefined, throwIllegalValue } from '@votingworks/basics';
import { LogEventId, Logger } from '@votingworks/logging';
import {
  VoteAdjudication,
  WriteInAdjudicationAction,
  WriteInRecord,
} from './types';
import { type Store } from './store';

/**
 * Manipulates adjudication records so that a particular vote in a cast vote
 * record reflects the target marked or unmarked status. Ensures that
 * adjudications are not created when the scanned vote is already the target
 * status.
 */
export function adjudicateVote(
  voteAdjudication: Omit<VoteAdjudication, 'id'>,
  store: Store
): void {
  // remove any existing adjudication records for the vote
  store.deleteVoteAdjudication(voteAdjudication);

  const { votes } = store.getCastVoteRecordVoteInfo({
    electionId: voteAdjudication.electionId,
    cvrId: voteAdjudication.cvrId,
  });

  const contestVotes = votes[voteAdjudication.contestId];

  const scannedIsVote = contestVotes
    ? contestVotes.includes(voteAdjudication.optionId)
    : /* c8 ignore next 1 */
      false;

  // if the vote is already the target status, do nothing
  if (voteAdjudication.isVote === scannedIsVote) {
    return;
  }

  store.createVoteAdjudication(voteAdjudication);
}

async function logWriteInAdjudication({
  initialWriteInRecord,
  adjudicationAction,
  logger,
}: {
  initialWriteInRecord: WriteInRecord;
  adjudicationAction: WriteInAdjudicationAction;
  logger: Logger;
}): Promise<void> {
  const { cvrId, contestId, optionId } = initialWriteInRecord;

  const formerStatusText = (() => {
    if (initialWriteInRecord.status === 'pending') {
      return 'unadjudicated';
    }

    switch (initialWriteInRecord.adjudicationType) {
      case 'invalid':
        return 'invalid';
      case 'official-candidate':
        return `a vote for an official candidate (${initialWriteInRecord.candidateId})`;
      case 'write-in-candidate':
        return `a vote for a write-in candidate (${initialWriteInRecord.candidateId})`;
      /* c8 ignore start */
      default:
        throwIllegalValue(initialWriteInRecord, 'adjudicationType');
      /* c8 ignore stop */
    }
  })();

  const newStatusText = (() => {
    switch (adjudicationAction.type) {
      case 'invalid':
        return 'invalid';
      case 'official-candidate':
        return `a vote for an official candidate (${adjudicationAction.candidateId})`;
      case 'write-in-candidate':
        return `a vote for a write-in candidate (${adjudicationAction.candidateId})`;
      case 'reset':
        return `unadjudicated`;
      /* c8 ignore start */
      default:
        throwIllegalValue(adjudicationAction, 'type');
      /* c8 ignore stop */
    }
  })();

  const message = `User adjudicated a write-in from ${formerStatusText} to ${newStatusText}.`;
  await logger.log(LogEventId.WriteInAdjudicated, 'election_manager', {
    disposition: 'success',
    message,
    cvrId,
    contestId,
    optionId,
    previousStatus:
      initialWriteInRecord.status === 'pending'
        ? 'pending'
        : initialWriteInRecord.adjudicationType,
    previousCandidateId:
      initialWriteInRecord.status === 'adjudicated' &&
      initialWriteInRecord.adjudicationType !== 'invalid'
        ? initialWriteInRecord.candidateId
        : undefined,
    status:
      adjudicationAction.type === 'reset' ? 'pending' : adjudicationAction.type,
    candidateId:
      adjudicationAction.type !== 'invalid' &&
      adjudicationAction.type !== 'reset'
        ? adjudicationAction.candidateId
        : undefined,
  });
}

/**
 * Adjudicates a write-in record for an official candidate, write-in candidate,
 * or marks it as invalid.
 */
export async function adjudicateWriteIn(
  adjudicationAction: WriteInAdjudicationAction,
  store: Store,
  logger: Logger
): Promise<void> {
  const [initialWriteInRecord] = store.getWriteInRecords({
    electionId: assertDefined(store.getCurrentElectionId()),
    writeInId: adjudicationAction.writeInId,
  });
  assert(initialWriteInRecord, 'write-in record does not exist');

  switch (adjudicationAction.type) {
    case 'official-candidate':
      store.setWriteInRecordOfficialCandidate(adjudicationAction);
      // ensure the vote does not appear as an undervote in tallies, which is
      // only applicable to unmarked write-ins
      adjudicateVote(
        {
          ...initialWriteInRecord,
          isVote: true,
        },
        store
      );
      break;
    case 'write-in-candidate':
      store.setWriteInRecordUnofficialCandidate(adjudicationAction);
      // ensure the vote does not appear as an undervote in tallies, which is
      // only applicable to unmarked write-ins
      adjudicateVote(
        {
          ...initialWriteInRecord,
          isVote: true,
        },
        store
      );
      break;
    case 'invalid':
      store.setWriteInRecordInvalid(adjudicationAction);
      // ensure the vote appears as an undervote in tallies
      adjudicateVote(
        {
          ...initialWriteInRecord,
          isVote: false,
        },
        store
      );
      break;
    case 'reset':
      store.resetWriteInRecordToPending(adjudicationAction);
      // ensure the vote appears as it originally was in tallies
      store.deleteVoteAdjudication(initialWriteInRecord);
      break;
    /* c8 ignore start */
    default:
      throwIllegalValue(adjudicationAction, 'type');
    /* c8 ignore stop */
  }

  // if we are switching away from a write-in candidate, we may have to clean
  // up the record if it has no other references
  if (
    initialWriteInRecord.status === 'adjudicated' &&
    initialWriteInRecord.adjudicationType === 'write-in-candidate'
  ) {
    store.deleteWriteInCandidateIfNotReferenced(
      initialWriteInRecord.candidateId
    );
  }

  await logWriteInAdjudication({
    initialWriteInRecord,
    adjudicationAction,
    logger,
  });
}
