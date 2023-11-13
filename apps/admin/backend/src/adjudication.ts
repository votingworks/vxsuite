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
  const { votes } = store.getCastVoteRecordVoteInfo({
    electionId: voteAdjudication.electionId,
    cvrId: voteAdjudication.cvrId,
  });

  const contestVotes = votes[voteAdjudication.contestId];

  const isScannedVote = contestVotes
    ? contestVotes.includes(voteAdjudication.optionId)
    : /* c8 ignore next 1 */
      false;

  const existingVoteAdjudication = store.getVoteAdjudication(voteAdjudication);

  const existingIsVote = existingVoteAdjudication?.isVote ?? isScannedVote;

  // if either the vote is scanned as the target status and has not been
  // adjudicated, or it has already been adjudicated to the target status,
  // do nothing
  if (voteAdjudication.isVote === existingIsVote) {
    return;
  }

  // if the vote is not the target status due to a prior adjudication, delete it
  if (existingVoteAdjudication) {
    assert(voteAdjudication.isVote !== existingVoteAdjudication.isVote);
    assert(voteAdjudication.isVote === isScannedVote);
    store.deleteVoteAdjudication(existingVoteAdjudication);
    return;
  }

  // create an adjudication record to reflect the target status
  assert(voteAdjudication.isVote !== isScannedVote);
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
    status: adjudicationAction.type,
    candidateId:
      adjudicationAction.type !== 'invalid'
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
    case 'invalid':
      store.setWriteInRecordInvalid(adjudicationAction);
      break;
    case 'official-candidate':
      store.setWriteInRecordOfficialCandidate(adjudicationAction);
      break;
    case 'write-in-candidate':
      store.setWriteInRecordUnofficialCandidate(adjudicationAction);
      break;
    /* c8 ignore start */
    default:
      throwIllegalValue(adjudicationAction, 'type');
    /* c8 ignore stop */
  }

  // ensure the vote's validity is reflected properly
  if (adjudicationAction.type === 'invalid') {
    adjudicateVote(
      {
        ...initialWriteInRecord,
        isVote: false,
      },
      store
    );
  } else {
    adjudicateVote(
      {
        ...initialWriteInRecord,
        isVote: true,
      },
      store
    );
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
