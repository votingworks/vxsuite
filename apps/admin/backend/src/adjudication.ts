import { assert, assertDefined, throwIllegalValue } from '@votingworks/basics';
import { LogEventId, BaseLogger } from '@votingworks/logging';
import {
  AdjudicationReason,
  ContestId,
  ContestOptionId,
  Id,
} from '@votingworks/types';
import {
  AdjudicatedCvrContest,
  WriteInAdjudicationAction,
  WriteInRecord,
} from './types';
import { type Store } from './store';

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
 * {@link adjudicateCvrContest} which writes to `adjudicated_votes`.
 * Function should remain private to ensure it's only used within the context
 * of adjudicating a full cvr contest, to ensure consistency between write-in
 * record statuses and adjudicated votes.
 */
function adjudicateWriteIn(
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
 * and adjudicated votes to ensure the store reflects
 * the input, within a single transaction.
 */
export function adjudicateCvrContest(
  adjudicatedCvrContest: AdjudicatedCvrContest,
  store: Store,
  logger: BaseLogger
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
    // Start from scanned votes, then override with adjudicated options
    const { votes } = store.getCastVoteRecordVoteInfo({ electionId, cvrId });
    const scannedContestVotes = new Set(votes[contestId]);

    // Build the adjudicated vote set: start with scanned votes, apply overrides
    const adjudicatedVoteSet = new Set(scannedContestVotes);

    for (const [optionId, adjudicatedContestOption] of Object.entries(
      adjudicatedContestOptionById
    )) {
      const { hasVote: isVote, type } = adjudicatedContestOption;

      if (isVote) {
        adjudicatedVoteSet.add(optionId);
      } else {
        adjudicatedVoteSet.delete(optionId);
      }

      if (type === 'candidate-option') {
        continue;
      }

      // write-in option
      let writeInId = cvrWriteInRecords.find(
        (record) => record.optionId === optionId
      )?.id;

      if (!isVote) {
        if (writeInId) {
          adjudicateWriteIn(
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
          isUndetected: true,
          optionId,
          side,
        });
      }

      const { candidateType } = adjudicatedContestOption;
      switch (candidateType) {
        case 'official-candidate': {
          const { candidateId } = adjudicatedContestOption;
          adjudicateWriteIn(
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
          adjudicateWriteIn(
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

    // Store the adjudicated votes for this contest
    const adjudicatedVoteOptionIds = [...adjudicatedVoteSet];
    store.setContestAdjudicatedVotes({
      cvrId,
      contestId,
      votes: adjudicatedVoteOptionIds,
    });
  });
}

/**
 * Resolves the ballot tag and all remaining unresolved contest tags.
 */
export function resolveBallotTags(
  { cvrId }: { cvrId: Id },
  store: Store
): void {
  store.setCvrResolved({ cvrId });
}

/**
 * Returns a list of option ids for a cvr-contest
 * that are below the definite threshold and above
 * the marginal threshold
 */
export function getMarginalMarks({
  store,
  cvrId,
  contestId,
}: {
  store: Store;
  cvrId: Id;
  contestId: ContestId;
}): ContestOptionId[] {
  const electionId = assertDefined(store.getCurrentElectionId());
  const { adminAdjudicationReasons, markThresholds } =
    store.getSystemSettings(electionId);
  if (!adminAdjudicationReasons.includes(AdjudicationReason.MarginalMark)) {
    return [];
  }

  const [cvr] = store.getCastVoteRecords({ electionId, cvrId, filter: {} });
  assert(cvr !== undefined);

  const isBmd = !cvr.markScores;
  if (isBmd) {
    return [];
  }

  const contestMarkScores = assertDefined(
    cvr.markScores[contestId],
    `no mark scores found for cvr Id ${cvrId} for contest Id ${contestId}`
  );
  const marginallyMarkedOptionIds = [];
  for (const [optionId, optionMarkScore] of Object.entries(contestMarkScores)) {
    const hasMarginalMark =
      optionMarkScore >= markThresholds.marginal &&
      optionMarkScore < markThresholds.definite;
    if (hasMarginalMark) {
      marginallyMarkedOptionIds.push(optionId);
    }
  }
  return marginallyMarkedOptionIds;
}
