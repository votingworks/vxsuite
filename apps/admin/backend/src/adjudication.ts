import { assert, assertDefined, throwIllegalValue } from '@votingworks/basics';
import { LogEventId, BaseLogger } from '@votingworks/logging';
import { ContestOptionId, Id } from '@votingworks/types';
import {
  AdjudicatedContestOption,
  AdjudicatedCvr,
  AdjudicatedCvrContest,
  WriteInAdjudicationAction,
  WriteInRecord,
} from './types.js';
import { type Store } from './store.js';

/**
 * Builds an adjudicated contest option for a given option.
 */
export function buildAdjudicatedContestOption({
  hasVote,
  isWriteIn,
  writeInRecord,
  writeInCandidateNameById,
}: {
  isWriteIn: boolean;
  hasVote: boolean;
  writeInRecord?: WriteInRecord;
  writeInCandidateNameById: Map<Id, string>;
}): AdjudicatedContestOption {
  if (isWriteIn) {
    if (!writeInRecord) return { type: 'write-in-option', hasVote: false };
    assert(writeInRecord.status === 'adjudicated');
    switch (writeInRecord.adjudicationType) {
      case 'invalid':
        return { type: 'write-in-option', hasVote: false };
      case 'official-candidate':
        return {
          type: 'write-in-option',
          candidateType: 'official-candidate',
          hasVote: true,
          candidateId: writeInRecord.candidateId,
        };
      case 'write-in-candidate':
        return {
          type: 'write-in-option',
          candidateType: 'write-in-candidate',
          hasVote: true,
          candidateName: assertDefined(
            writeInCandidateNameById.get(writeInRecord.candidateId)
          ),
        };
      default:
        throwIllegalValue(writeInRecord, 'adjudicationType');
    }
  }
  return { type: 'official-option', hasVote };
}

function logWriteInAdjudication({
  initialWriteInRecord,
  adjudicationAction,
  logger,
}: {
  initialWriteInRecord: WriteInRecord;
  adjudicationAction: WriteInAdjudicationAction;
  logger: BaseLogger;
}): void {
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
      default: {
        throwIllegalValue(initialWriteInRecord, 'adjudicationType');
      }
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
      default: {
        throwIllegalValue(adjudicationAction, 'type');
      }
    }
  })();

  const message = `User adjudicated a write-in from ${formerStatusText} to ${newStatusText}.`;
  logger.log(LogEventId.WriteInAdjudicated, 'election_manager', {
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
 * or marks it as invalid. Vote tallies are handled by the caller via
 * {@link applyAdjudicatedCvrContest} which writes to `adjudicated_votes`.
 * Function should remain private to ensure it's only used within the context
 * of adjudicating a full cvr contest, to ensure consistency between write-in
 * record statuses and adjudicated votes.
 */
function adjudicateWriteIn(
  adjudicationAction: WriteInAdjudicationAction,
  store: Store,
  logger: BaseLogger
): void {
  const electionId = assertDefined(store.getCurrentElectionId());
  const [initialWriteInRecord] = store.getWriteInRecords({
    electionId,
    writeInId: adjudicationAction.writeInId,
  });
  assert(initialWriteInRecord, 'write-in record does not exist');

  switch (adjudicationAction.type) {
    case 'official-candidate':
      store.setWriteInRecordOfficialCandidate(adjudicationAction);
      break;
    case 'write-in-candidate':
      store.setWriteInRecordUnofficialCandidate(adjudicationAction);
      break;
    case 'invalid':
      // Delete invalid undetected write-in records, as a user created and deleted it
      if (initialWriteInRecord.isUndetected) {
        store.deleteUndetectedWriteInRecord(initialWriteInRecord);
      } else {
        store.setWriteInRecordInvalid(adjudicationAction);
      }
      break;
    default: {
      throwIllegalValue(adjudicationAction, 'type');
    }
  }

  // If we are switching away from a write-in candidate, we may have to clean
  // up the record if it has no other references. In qualified mode, candidates
  // are intentionally managed via the management UI and should not be
  // auto-deleted.
  const { areWriteInCandidatesQualified } = store.getSystemSettings(electionId);
  if (
    !areWriteInCandidatesQualified &&
    initialWriteInRecord.status === 'adjudicated' &&
    initialWriteInRecord.adjudicationType === 'write-in-candidate'
  ) {
    store.deleteWriteInCandidateIfNotReferenced(
      initialWriteInRecord.candidateId
    );
  }

  logWriteInAdjudication({
    initialWriteInRecord,
    adjudicationAction,
    logger,
  });
}

/**
 * Applies a fully adjudicated cvr contest to the store: updates write-in
 * records, write-in candidates, and adjudicated votes. Does NOT open its own
 * transaction — callers must wrap this in `store.withTransaction()`.
 */
function applyAdjudicatedCvrContest(
  cvrId: Id,
  adjudicatedCvrContest: AdjudicatedCvrContest,
  existingContestVotes: ContestOptionId[] | undefined,
  store: Store,
  logger: BaseLogger
): void {
  const electionId = assertDefined(store.getCurrentElectionId());
  const { adjudicatedContestOptionById, contestId } = adjudicatedCvrContest;

  const cvrWriteInRecords = store.getWriteInRecords({
    electionId,
    castVoteRecordId: cvrId,
    contestId,
  });
  const contestWriteInCandidates = store.getWriteInCandidates({
    electionId,
    contestIds: [contestId],
  });

  const adjudicatedVotes = new Set(existingContestVotes);
  for (const [optionId, option] of Object.entries(
    adjudicatedContestOptionById
  )) {
    if (option.hasVote) {
      adjudicatedVotes.add(optionId);
    } else {
      adjudicatedVotes.delete(optionId);
    }
  }
  store.setContestAdjudicatedVotes({
    cvrId,
    contestId,
    votes: [...adjudicatedVotes],
  });

  // Handle write-ins
  for (const [optionId, option] of Object.entries(
    adjudicatedContestOptionById
  )) {
    if (option.type === 'official-option') {
      continue;
    }

    let writeInId = cvrWriteInRecords.find(
      (record) => record.optionId === optionId
    )?.id;

    if (!option.hasVote) {
      if (writeInId) {
        adjudicateWriteIn({ type: 'invalid', writeInId }, store, logger);
      }
      continue;
    }

    if (!writeInId) {
      writeInId = store.addWriteIn({
        castVoteRecordId: cvrId,
        contestId,
        electionId,
        isUnmarked: true,
        isUndetected: true,
        optionId,
      });
    }

    const { candidateType } = option;
    switch (candidateType) {
      case 'official-candidate':
        adjudicateWriteIn(
          {
            type: 'official-candidate',
            writeInId,
            candidateId: option.candidateId,
          },
          store,
          logger
        );
        break;
      case 'write-in-candidate': {
        let candidateId = contestWriteInCandidates.find(
          (c) => c.name === option.candidateName
        )?.id;
        if (!candidateId) {
          candidateId = store.addWriteInCandidate({
            electionId,
            contestId,
            name: option.candidateName,
          }).id;
        }
        adjudicateWriteIn(
          { type: 'write-in-candidate', writeInId, candidateId },
          store,
          logger
        );
        break;
      }
      default: {
        throwIllegalValue(option, 'candidateType');
      }
    }
  }
}

/**
 * Applies all per-contest adjudications for a single ballot, marks the cvr as
 * resolved, and completes the ballot claim — atomically in one transaction.
 */
export function adjudicateCvr(
  adjudicatedCvr: AdjudicatedCvr,
  machineId: string,
  store: Store,
  logger: BaseLogger
): void {
  const electionId = assertDefined(store.getCurrentElectionId());
  const { votes } = store.getCastVoteRecordVoteInfo({
    electionId,
    cvrId: adjudicatedCvr.cvrId,
  });
  store.withTransaction(() => {
    for (const contest of adjudicatedCvr.contests) {
      applyAdjudicatedCvrContest(
        adjudicatedCvr.cvrId,
        contest,
        votes[contest.contestId],
        store,
        logger
      );
    }
    store.setCvrAdjudicated({ cvrId: adjudicatedCvr.cvrId, machineId });
  });
}
