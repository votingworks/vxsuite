import { useState, useEffect } from 'react';
import type {
  ContestAdjudicationData,
  WriteInCandidateRecord,
} from '@votingworks/admin-backend';
import type {
  ContestOptionId,
  Candidate,
  YesNoOption,
} from '@votingworks/types';
import {
  assert,
  assertDefined,
  iter,
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

export interface ContestInfo {
  officialOptions: Candidate[] | YesNoOption[];
  isCandidateContest: boolean;
  numberOfWriteIns: number;
}

interface OfficialOptionAdjudicationState {
  optionId: ContestOptionId;
  hasVote: boolean;
  marginalMarkStatus: MarginalMarkStatus;
  isWriteIn: false;
}

interface WriteInOptionAdjudicationState {
  optionId: ContestOptionId;
  hasVote: boolean;
  marginalMarkStatus: MarginalMarkStatus;
  writeInAdjudicationStatus: WriteInAdjudicationStatus;
  isWriteIn: true;
}

type ContestOptionAdjudicationState =
  | OfficialOptionAdjudicationState
  | WriteInOptionAdjudicationState;

type ContestOptionAdjudicationStateById = Map<
  ContestOptionId,
  ContestOptionAdjudicationState
>;

interface ContestAdjudicationState {
  optionState: ContestOptionAdjudicationStateById;
  initialOptionState: ContestOptionAdjudicationStateById | null;
  isStateReady: boolean;
}

function writeInStatusesEqual(
  a: WriteInAdjudicationStatus,
  b: WriteInAdjudicationStatus
): boolean {
  if (a === undefined && b === undefined) return true;
  if (a === undefined || b === undefined) return false;
  if (a.type !== b.type) return false;
  if (
    (a.type === 'existing-official' || a.type === 'existing-write-in') &&
    (b.type === 'existing-official' || b.type === 'existing-write-in')
  ) {
    return a.id === b.id;
  }
  if (a.type === 'new-write-in' && b.type === 'new-write-in') {
    return a.name === b.name;
  }
  return true;
}

function optionStateMapsEqual(
  a: ContestOptionAdjudicationStateById,
  b: ContestOptionAdjudicationStateById
): boolean {
  for (const [id, stateA] of a) {
    const stateB = b.get(id);
    if (!stateB) return false;
    if (stateA.hasVote !== stateB.hasVote) return false;
    if (stateA.marginalMarkStatus !== stateB.marginalMarkStatus) return false;
    if (
      stateA.isWriteIn &&
      stateB.isWriteIn &&
      !writeInStatusesEqual(
        stateA.writeInAdjudicationStatus,
        stateB.writeInAdjudicationStatus
      )
    ) {
      return false;
    }
  }
  return true;
}

function getWriteInOptions(
  state: ContestOptionAdjudicationStateById
): WriteInOptionAdjudicationState[] {
  return iter(state.values())
    .filter((option) => option.isWriteIn)
    .toArray();
}

function makeEmptyState(
  contestInfo: ContestInfo
): ContestOptionAdjudicationStateById {
  const state: ContestOptionAdjudicationStateById = new Map();
  for (const option of contestInfo.officialOptions) {
    state.set(option.id, {
      optionId: option.id,
      hasVote: false,
      marginalMarkStatus: 'none',
      isWriteIn: false,
    });
  }
  for (let i = 0; i < contestInfo.numberOfWriteIns; i += 1) {
    const writeInOptionId = `write-in-${i}`;
    state.set(writeInOptionId, {
      optionId: writeInOptionId,
      hasVote: false,
      marginalMarkStatus: 'none',
      isWriteIn: true,
      writeInAdjudicationStatus: undefined,
    });
  }
  return state;
}

export function makeInitialState(
  contestInfo: ContestInfo,
  contestAdjudicationData: ContestAdjudicationData,
  writeInCandidates: WriteInCandidateRecord[]
): ContestOptionAdjudicationStateById {
  const state = makeEmptyState(contestInfo);

  for (const option of contestAdjudicationData.options) {
    const optionState = assertDefined(state.get(option.definition.id));

    optionState.hasVote = option.voteAdjudication
      ? option.voteAdjudication.isVote
      : option.initialVote;

    if (option.hasMarginalMark) {
      assert(contestAdjudicationData.tag !== undefined);
      optionState.marginalMarkStatus = contestAdjudicationData.tag.isResolved
        ? 'resolved'
        : 'pending';
    }

    if (!optionState.isWriteIn) {
      continue;
    }

    const { writeInRecord } = option;
    if (!writeInRecord) {
      continue;
    }

    if (writeInRecord.status === 'pending') {
      optionState.writeInAdjudicationStatus = { type: 'pending' };
      continue;
    }
    switch (writeInRecord.adjudicationType) {
      case 'official-candidate': {
        const candidate = assertDefined(
          contestInfo.officialOptions.find(
            (o) => o.id === writeInRecord.candidateId
          )
        ) as Candidate;
        optionState.writeInAdjudicationStatus = {
          ...candidate,
          type: 'existing-official',
        };
        optionState.hasVote = true;
        break;
      }
      case 'write-in-candidate': {
        const candidate = assertDefined(
          writeInCandidates.find((c) => c.id === writeInRecord.candidateId)
        );
        optionState.writeInAdjudicationStatus = {
          ...candidate,
          type: 'existing-write-in',
        };
        optionState.hasVote = true;
        break;
      }
      case 'invalid': {
        optionState.writeInAdjudicationStatus = { type: 'invalid' };
        optionState.hasVote = false;
        break;
      }
      default: {
        /* istanbul ignore next - @preserve */
        throwIllegalValue(writeInRecord, 'adjudicationType');
      }
    }
  }
  return state;
}

export function useContestAdjudicationState(
  contestInfo: ContestInfo,
  initialValues?: {
    contestAdjudicationData: ContestAdjudicationData;
    writeInCandidates: WriteInCandidateRecord[];
  }
): {
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
  isStateReady: boolean;
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
  const [state, setState] = useState<ContestAdjudicationState>({
    optionState: makeEmptyState(contestInfo),
    initialOptionState: null,
    isStateReady: false,
  });
  const optionsList = [...state.optionState.values()];

  // Initialize state when initial values are loaded
  useEffect(() => {
    if (initialValues && !state.isStateReady) {
      const initialOptionState = makeInitialState(
        contestInfo,
        initialValues.contestAdjudicationData,
        initialValues.writeInCandidates
      );
      setState({
        optionState: initialOptionState,
        initialOptionState,
        isStateReady: true,
      });
    }
  }, [initialValues, state.isStateReady, contestInfo]);

  function getOptionHasVote(optionId: ContestOptionId): boolean {
    return assertDefined(state.optionState.get(optionId)).hasVote;
  }

  function setOptionHasVote(optionId: ContestOptionId, hasVote: boolean) {
    setState((prev) => ({
      ...prev,
      optionState: new Map([
        ...prev.optionState,
        [
          optionId,
          { ...assertDefined(prev.optionState.get(optionId)), hasVote },
        ],
      ]),
    }));
  }

  function getOptionWriteInStatus(
    optionId: ContestOptionId
  ): WriteInAdjudicationStatus | undefined {
    const optionState = assertDefined(state.optionState.get(optionId));
    if (!optionState.isWriteIn) {
      return undefined;
    }
    return optionState.writeInAdjudicationStatus;
  }

  function setOptionWriteInStatus(
    optionId: ContestOptionId,
    writeInAdjudicationStatus: WriteInAdjudicationStatus
  ) {
    setState((prev) => {
      const option = assertDefined(prev.optionState.get(optionId));
      assert(option.isWriteIn);
      return {
        ...prev,
        optionState: new Map([
          ...prev.optionState,
          [optionId, { ...option, writeInAdjudicationStatus }],
        ]),
      };
    });
  }

  function getOptionMarginalMarkStatus(
    optionId: ContestOptionId
  ): MarginalMarkStatus {
    return assertDefined(state.optionState.get(optionId)).marginalMarkStatus;
  }

  function resolveOptionMarginalMark(optionId: ContestOptionId) {
    setState((prev) => {
      const option = assertDefined(prev.optionState.get(optionId));
      if (isMarginalMarkPending(option.marginalMarkStatus)) {
        return {
          ...prev,
          optionState: new Map([
            ...prev.optionState,
            [optionId, { ...option, marginalMarkStatus: 'resolved' }],
          ]),
        };
      }
      return prev;
    });
  }

  function checkWriteInNameForDoubleVote({
    writeInName,
    optionId,
  }: {
    writeInName: string;
    optionId: ContestOptionId;
  }): DoubleVoteAlert | undefined {
    if (!contestInfo.isCandidateContest) {
      return undefined;
    }

    const normalizedName = normalizeWriteInName(writeInName);
    const officialCandidateMatch = (
      contestInfo.officialOptions as Candidate[]
    ).find((c) => normalizeWriteInName(c.name) === normalizedName);
    if (officialCandidateMatch && getOptionHasVote(officialCandidateMatch.id)) {
      return {
        type: 'marked-official-candidate',
        name: officialCandidateMatch.name,
        optionId,
      };
    }
    const writeInOptionMatch = getWriteInOptions(state.optionState)
      .filter(({ optionId: id }) => id !== optionId && getOptionHasVote(id))
      .find(
        ({ writeInAdjudicationStatus }) =>
          isValidCandidate(writeInAdjudicationStatus) &&
          normalizeWriteInName(writeInAdjudicationStatus.name) ===
            normalizedName
      );
    if (writeInOptionMatch) {
      return {
        type: isOfficialCandidate(writeInOptionMatch.writeInAdjudicationStatus)
          ? 'adjudicated-official-candidate'
          : 'adjudicated-write-in-candidate',
        name: writeInName,
        optionId,
      };
    }
    return undefined;
  }

  const allAdjudicationsCompleted = optionsList.every(
    (option) =>
      (!option.isWriteIn ||
        !isWriteInPending(option.writeInAdjudicationStatus)) &&
      !isMarginalMarkPending(option.marginalMarkStatus)
  );

  const firstOptionIdPendingAdjudication = state.isStateReady
    ? optionsList.find(
        (option) =>
          isMarginalMarkPending(option.marginalMarkStatus) ||
          (option.isWriteIn &&
            isWriteInPending(option.writeInAdjudicationStatus))
      )?.optionId
    : undefined;

  const selectedCandidateNames: string[] = (() => {
    if (!contestInfo.isCandidateContest) {
      return [];
    }
    const contestOptionsWithVote = optionsList.filter(
      (option) => option.hasVote
    );
    const names: string[] = [];
    for (const contestOption of contestOptionsWithVote) {
      if (contestOption.isWriteIn) {
        if (!isValidCandidate(contestOption.writeInAdjudicationStatus)) {
          continue;
        }
        names.push(contestOption.writeInAdjudicationStatus.name);
      } else {
        const officialCandidate = assertDefined(
          contestInfo.officialOptions.find(
            (c) => c.id === contestOption.optionId
          )
        ) as Candidate;
        names.push(officialCandidate.name);
      }
    }
    return names;
  })();

  const isModified =
    state.initialOptionState !== null &&
    !optionStateMapsEqual(state.optionState, state.initialOptionState);

  return {
    isStateReady: state.isStateReady,
    isModified,
    setOptionHasVote,
    getOptionHasVote,
    setOptionWriteInStatus,
    getOptionWriteInStatus,
    getOptionMarginalMarkStatus,
    resolveOptionMarginalMark,
    checkWriteInNameForDoubleVote,
    allAdjudicationsCompleted,
    firstOptionIdPendingAdjudication,
    selectedCandidateNames,
    voteCount: optionsList.filter((o) => o.hasVote).length,
  };
}
