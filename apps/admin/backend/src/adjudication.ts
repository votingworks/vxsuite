import { assert, assertDefined, throwIllegalValue } from '@votingworks/basics';
import { LogEventId, BaseLogger, Logger } from '@votingworks/logging';
import {
  AdjudicatedCvrContest,
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
    : /* istanbul ignore next - @preserve */
      false;

  // if the vote is already the target status, do nothing
  if (voteAdjudication.isVote === scannedIsVote) {
    return;
  }

  store.createVoteAdjudication(voteAdjudication);
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
        /* istanbul ignore next - @preserve */
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
      case 'reset':
        return `unadjudicated`;
      default: {
        /* istanbul ignore next - @preserve */
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
export function adjudicateWriteIn(
  adjudicationAction: WriteInAdjudicationAction,
  store: Store,
  logger: BaseLogger
): void {
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
      // Delete invalid manually created write-in records
      if (initialWriteInRecord.isManuallyCreated) {
        store.deleteManualWriteInRecord(initialWriteInRecord);
      } else {
        store.setWriteInRecordInvalid(adjudicationAction);
      }
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
    default: {
      /* istanbul ignore next - @preserve */
      throwIllegalValue(adjudicationAction, 'type');
    }
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

  logWriteInAdjudication({
    initialWriteInRecord,
    adjudicationAction,
    logger,
  });
}

/**
 * Receives a fully adjudicated cvr contest as input
 * and updates write-in records, write-in candidates,
 * and vote adjudications to ensure the store reflects
 * the input, within a single transaction
 */
export function adjudicateCvrContest(
  adjudicatedCvrContest: AdjudicatedCvrContest,
  store: Store,
  logger: Logger
): void {
  const electionId = assertDefined(store.getCurrentElectionId());
  const { adjudicatedContestOptionById, cvrId, contestId, side } =
    adjudicatedCvrContest;

  const cvrWriteInRecords = store.getWriteInRecords({
    electionId,
    castVoteRecordId: cvrId,
    contestId,
  });
  const contestWriteInCandidates = store.getWriteInCandidates({
    electionId,
    contestId,
  });

  return store.withTransaction(() => {
    for (const [optionId, adjudicatedContestOption] of Object.entries(
      adjudicatedContestOptionById
    )) {
      const { hasVote: isVote, type } = adjudicatedContestOption;
      if (type === 'candidate-option') {
        adjudicateVote(
          {
            contestId,
            cvrId,
            electionId,
            isVote,
            optionId,
          },
          store
        );
        continue;
      }

      // write-in option
      let writeInId = cvrWriteInRecords.find(
        (record) => record.optionId === optionId
      )?.id;

      if (!isVote) {
        if (writeInId) {
          void adjudicateWriteIn(
            {
              type: 'invalid',
              writeInId,
            },
            store,
            logger
          );
        }
        continue;
      }

      // isVote = true
      if (!writeInId) {
        writeInId = store.addWriteIn({
          castVoteRecordId: cvrId,
          contestId,
          electionId,
          isUnmarked: true,
          isManuallyCreated: true,
          optionId,
          side,
        });
      }
      const { candidateType } = adjudicatedContestOption;
      switch (candidateType) {
        case 'official-candidate': {
          const { candidateId } = adjudicatedContestOption;
          void adjudicateWriteIn(
            {
              type: 'official-candidate',
              writeInId,
              candidateId,
            },
            store,
            logger
          );
          break;
        }
        case 'write-in-candidate': {
          const { candidateName } = adjudicatedContestOption;
          let candidateId = contestWriteInCandidates.find(
            (c) => c.name === candidateName
          )?.id;
          if (!candidateId) {
            candidateId = store.addWriteInCandidate({
              electionId,
              contestId,
              name: candidateName,
            }).id;
          }
          void adjudicateWriteIn(
            {
              type: 'write-in-candidate',
              writeInId,
              candidateId,
            },
            store,
            logger
          );
          break;
        }
        default: {
          /* istanbul ignore next - @preserve */
          throwIllegalValue(adjudicatedContestOption, 'type');
        }
      }
    }
  });
}
