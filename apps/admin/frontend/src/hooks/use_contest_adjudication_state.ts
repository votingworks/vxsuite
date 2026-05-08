import { useState } from 'react';
import type {
  AdjudicatedContestOption,
  AdjudicatedContestOptions,
  ContestAdjudicationData,
  WriteInCandidateRecord,
} from '@votingworks/admin-backend';
import type { ContestOptionId, Candidate } from '@votingworks/types';
import {
  assertDefined,
  deepEqual,
  throwIllegalValue,
} from '@votingworks/basics';

import type { DoubleVoteAlert } from '../components/adjudication_double_vote_alert_modal';
import { normalizeWriteInName } from '../utils/adjudication';

interface ExistingOfficialCandidate {
  type: 'existing-official';
  id: string;
  name: string;
}

interface ExistingWriteInCandidate {
  type: 'existing-write-in';
  id: string;
  name: string;
}

interface NewWriteInCandidate {
  type: 'new-write-in';
  name: string;
}

interface InvalidWriteIn {
  type: 'invalid';
}

interface PendingWriteIn {
  type: 'pending';
}

export type WriteInAdjudicationStatus =
  | ExistingOfficialCandidate
  | ExistingWriteInCandidate
  | NewWriteInCandidate
  | InvalidWriteIn
  | PendingWriteIn
  | undefined;

export function isValidCandidate(
  status: WriteInAdjudicationStatus
): status is
  | ExistingOfficialCandidate
  | ExistingWriteInCandidate
  | NewWriteInCandidate {
  return (
    status?.type === 'existing-official' ||
    status?.type === 'existing-write-in' ||
    status?.type === 'new-write-in'
  );
}

export function isOfficialCandidate(
  status: WriteInAdjudicationStatus
): status is ExistingOfficialCandidate {
  return status?.type === 'existing-official';
}

export function isWriteInPending(
  status: WriteInAdjudicationStatus
): status is PendingWriteIn {
  return status?.type === 'pending';
}

export function isWriteInInvalid(
  status: WriteInAdjudicationStatus
): status is InvalidWriteIn {
  return status?.type === 'invalid';
}

export type MarginalMarkStatus = 'pending' | 'resolved' | 'none';

export function isMarginalMarkPending(
  status?: MarginalMarkStatus
): status is 'pending' {
  return status === 'pending';
}

export function useContestAdjudicationState(initialValues: {
  contestAdjudicationData: ContestAdjudicationData;
  writeInCandidates: WriteInCandidateRecord[];
  isCandidateContest: boolean;
  unsavedAdjudication?: AdjudicatedContestOptions;
}): {
  setOptionHasVote: (optionId: ContestOptionId, hasVote: boolean) => void;
  getOptionHasVote: (optionId: ContestOptionId) => boolean;
  setOptionWriteInStatus: (
    optionId: ContestOptionId,
    writeInAdjudicationStatus: WriteInAdjudicationStatus
  ) => void;
  getOptionWriteInStatus: (
    optionId: ContestOptionId
  ) => WriteInAdjudicationStatus | undefined;
  resolveOptionMarginalMark: (optionId: ContestOptionId) => void;
  getOptionMarginalMarkStatus: (
    optionId: ContestOptionId
  ) => MarginalMarkStatus;
  getAdjudicatedContestOptions: () => AdjudicatedContestOptions;
  isModified: boolean;
  checkWriteInNameForDoubleVote: ({
    writeInName,
    optionId,
  }: {
    writeInName: string;
    optionId: ContestOptionId;
  }) => DoubleVoteAlert | undefined;
  allAdjudicationsCompleted: boolean;
  firstOptionIdPendingAdjudication?: ContestOptionId;
  selectedCandidateNames: string[];
  voteCount: number;
} {
  const {
    contestAdjudicationData,
    isCandidateContest,
    unsavedAdjudication,
    writeInCandidates,
  } = initialValues;
  const [optionState, setState] = useState<AdjudicatedContestOptions>(
    unsavedAdjudication ?? {}
  );

  const officialOptions = contestAdjudicationData.options
    .filter((o) => o.definition.type !== 'candidate' || !o.definition.isWriteIn)
    .map((o) => o.definition);

  function getOptionState(
    optionId: ContestOptionId
  ): AdjudicatedContestOption | undefined {
    return optionState[optionId];
  }

  function setOptionState(
    optionId: ContestOptionId,
    option: AdjudicatedContestOption
  ): void {
    setState((prev) => ({ ...prev, [optionId]: option }));
  }

  function clearOptionState(optionId: ContestOptionId): void {
    setState((prev) => {
      const updated: AdjudicatedContestOptions = { ...prev };
      delete updated[optionId];
      return updated;
    });
  }

  function getOptionData(optionId: ContestOptionId) {
    return assertDefined(
      contestAdjudicationData.options.find((o) => o.definition.id === optionId)
    );
  }

  function getOptionHasVote(optionId: ContestOptionId): boolean {
    const option = getOptionState(optionId);
    if (option) return option.hasVote;
    const optionData = getOptionData(optionId);
    return optionData.adjudicatedVote ?? optionData.scannedVote;
  }

  function setOptionHasVote(optionId: ContestOptionId, hasVote: boolean): void {
    setOptionState(optionId, { type: 'candidate-option', hasVote });
  }

  function getOptionWriteInStatus(
    optionId: ContestOptionId
  ): WriteInAdjudicationStatus | undefined {
    const option = getOptionState(optionId);
    if (option) {
      if (option.type === 'candidate-option') return undefined;
      if (!option.hasVote) return { type: 'invalid' };
      if (option.candidateType === 'official-candidate') {
        const candidate = assertDefined(
          officialOptions.find((o) => o.id === option.candidateId)
        ) as Candidate;
        return {
          type: 'existing-official',
          id: candidate.id,
          name: candidate.name,
        };
      }
      // write-in-candidate: empty name is when the user has flipped an unmarked
      // write-in option but hasn't entered a name yet
      if (option.candidateName === '') return { type: 'pending' };
      const existing = writeInCandidates.find(
        (c) => c.name === option.candidateName
      );
      if (existing) {
        return {
          type: 'existing-write-in',
          id: existing.id,
          name: existing.name,
        };
      }
      return { type: 'new-write-in', name: option.candidateName };
    }

    // No option state — derive from the backend writeInRecord
    const optionData = getOptionData(optionId);
    if (!optionData.writeInRecord) return undefined;
    const { writeInRecord } = optionData;
    if (writeInRecord.status === 'pending') return { type: 'pending' };
    switch (writeInRecord.adjudicationType) {
      case 'official-candidate': {
        const candidate = assertDefined(
          officialOptions.find((o) => o.id === writeInRecord.candidateId)
        ) as Candidate;
        return {
          type: 'existing-official',
          id: candidate.id,
          name: candidate.name,
        };
      }
      case 'write-in-candidate': {
        const candidate = assertDefined(
          writeInCandidates.find((c) => c.id === writeInRecord.candidateId)
        );
        return {
          type: 'existing-write-in',
          id: candidate.id,
          name: candidate.name,
        };
      }
      case 'invalid':
        return { type: 'invalid' };
      /* istanbul ignore next - @preserve */
      default:
        throwIllegalValue(writeInRecord, 'adjudicationType');
    }
  }

  function writeInStatusToOption(
    status: WriteInAdjudicationStatus
  ): AdjudicatedContestOption {
    if (!status || status.type === 'invalid') {
      return { type: 'write-in-option', hasVote: false };
    }
    if (status.type === 'pending') {
      return {
        type: 'write-in-option',
        candidateType: 'write-in-candidate',
        hasVote: true,
        candidateName: '',
      };
    }
    if (status.type === 'existing-official') {
      return {
        type: 'write-in-option',
        candidateType: 'official-candidate',
        hasVote: true,
        candidateId: status.id,
      };
    }
    return {
      type: 'write-in-option',
      candidateType: 'write-in-candidate',
      hasVote: true,
      candidateName: status.name,
    };
  }

  function setOptionWriteInStatus(
    optionId: ContestOptionId,
    status: WriteInAdjudicationStatus
  ): void {
    if (status === undefined) {
      clearOptionState(optionId);
      return;
    }
    setOptionState(optionId, writeInStatusToOption(status));
  }

  function getOptionMarginalMarkStatus(
    optionId: ContestOptionId
  ): MarginalMarkStatus {
    const optionData = getOptionData(optionId);
    if (!optionData.hasMarginalMark) return 'none';
    if (contestAdjudicationData.tag?.isResolved) {
      return 'resolved';
    }
    if (getOptionState(optionId)) return 'resolved';
    return 'pending';
  }

  function resolveOptionMarginalMark(optionId: ContestOptionId): void {
    setState((prev) => {
      if (prev[optionId]) return prev;
      const optionData = getOptionData(optionId);
      const hasVote =
        optionData.adjudicatedVote ?? optionData.scannedVote ?? false;
      return { ...prev, [optionId]: { type: 'candidate-option', hasVote } };
    });
  }

  const optionsList = contestAdjudicationData.options.map((o) => ({
    id: o.definition.id,
    isWriteIn: o.definition.type === 'candidate' && o.definition.isWriteIn,
  }));

  function isOptionFullyAdjudicated(option: {
    id: ContestOptionId;
    isWriteIn: boolean;
  }): boolean {
    if (
      option.isWriteIn &&
      isWriteInPending(getOptionWriteInStatus(option.id))
    ) {
      return false;
    }
    if (isMarginalMarkPending(getOptionMarginalMarkStatus(option.id))) {
      return false;
    }
    return true;
  }

  const allAdjudicationsCompleted = optionsList.every(isOptionFullyAdjudicated);

  const firstOptionIdPendingAdjudication = optionsList.find(
    (option) => !isOptionFullyAdjudicated(option)
  )?.id;

  const selectedCandidateNames: string[] = (() => {
    if (!isCandidateContest) return [];
    const names: string[] = [];
    for (const option of optionsList) {
      if (!getOptionHasVote(option.id)) continue;
      if (option.isWriteIn) {
        const writeInStatus = getOptionWriteInStatus(option.id);
        if (!isValidCandidate(writeInStatus)) continue;
        names.push(writeInStatus.name);
      } else {
        const candidate = assertDefined(
          officialOptions.find((c) => c.id === option.id)
        ) as Candidate;
        names.push(candidate.name);
      }
    }
    return names;
  })();

  function checkWriteInNameForDoubleVote({
    writeInName,
    optionId,
  }: {
    writeInName: string;
    optionId: ContestOptionId;
  }): DoubleVoteAlert | undefined {
    if (!isCandidateContest) return undefined;

    const normalizedName = normalizeWriteInName(writeInName);
    const officialCandidateMatch = (officialOptions as Candidate[]).find(
      (c) => normalizeWriteInName(c.name) === normalizedName
    );
    if (officialCandidateMatch && getOptionHasVote(officialCandidateMatch.id)) {
      return {
        type: 'marked-official-candidate',
        name: officialCandidateMatch.name,
        optionId,
      };
    }

    for (const option of optionsList) {
      if (!option.isWriteIn) continue;
      if (option.id === optionId) continue;
      if (!getOptionHasVote(option.id)) continue;
      const writeInStatus = getOptionWriteInStatus(option.id);
      if (!isValidCandidate(writeInStatus)) continue;
      if (normalizeWriteInName(writeInStatus.name) !== normalizedName) continue;
      return {
        type: isOfficialCandidate(writeInStatus)
          ? 'adjudicated-official-candidate'
          : 'adjudicated-write-in-candidate',
        name: writeInName,
        optionId,
      };
    }
    return undefined;
  }

  function getAdjudicatedContestOptions(): AdjudicatedContestOptions {
    const result: AdjudicatedContestOptions = { ...optionState };
    for (const o of optionsList) {
      if (result[o.id]) continue;
      if (o.isWriteIn) {
        result[o.id] = writeInStatusToOption(getOptionWriteInStatus(o.id));
      } else {
        const optionData = getOptionData(o.id);
        result[o.id] = {
          type: 'candidate-option',
          hasVote: optionData.adjudicatedVote ?? optionData.scannedVote,
        };
      }
    }
    return result;
  }

  const voteCount = optionsList.filter((o) => getOptionHasVote(o.id)).length;

  const isModified = !deepEqual(optionState, unsavedAdjudication ?? {});

  return {
    isModified,
    setOptionHasVote,
    getOptionHasVote,
    setOptionWriteInStatus,
    getOptionWriteInStatus,
    getOptionMarginalMarkStatus,
    resolveOptionMarginalMark,
    getAdjudicatedContestOptions,
    checkWriteInNameForDoubleVote,
    allAdjudicationsCompleted,
    firstOptionIdPendingAdjudication,
    selectedCandidateNames,
    voteCount,
  };
}
