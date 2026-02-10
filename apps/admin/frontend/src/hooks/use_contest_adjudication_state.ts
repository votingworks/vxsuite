import { useState, useEffect } from 'react';
import type {
  CvrContestTag,
  VoteAdjudication,
  WriteInCandidateRecord,
  WriteInRecord,
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

export interface InitialValues {
  votes: string[];
  writeIns: WriteInRecord[];
  writeInCandidates: WriteInCandidateRecord[];
  voteAdjudications: VoteAdjudication[];
  marginalMarks: ContestOptionId[];
  contestTag: CvrContestTag | null;
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
  isStateReady: boolean;
  isModified: boolean;
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
  initialValues: InitialValues
): ContestOptionAdjudicationStateById {
  const state = makeEmptyState(contestInfo);

  for (const optionId of initialValues.votes) {
    assertDefined(state.get(optionId)).hasVote = true;
  }
  for (const voteAdjudication of initialValues.voteAdjudications) {
    const { optionId, isVote } = voteAdjudication;
    assertDefined(state.get(optionId)).hasVote = isVote;
  }
  for (const optionId of initialValues.marginalMarks) {
    assertDefined(state.get(optionId)).marginalMarkStatus =
      !initialValues.contestTag || initialValues.contestTag.isResolved
        ? 'resolved'
        : 'pending';
  }

  for (const writeInOption of getWriteInOptions(state)) {
    const { optionId } = writeInOption;
    const writeInRecord = initialValues.writeIns.find(
      (record) => record.optionId === optionId
    );
    if (!writeInRecord) {
      continue;
    }
    if (writeInRecord.status === 'pending') {
      writeInOption.writeInAdjudicationStatus = { type: 'pending' };
      continue;
    }
    switch (writeInRecord.adjudicationType) {
      case 'official-candidate': {
        const candidate = assertDefined(
          contestInfo.officialOptions.find(
            (o) => o.id === writeInRecord.candidateId
          )
        ) as Candidate;
        writeInOption.writeInAdjudicationStatus = {
          ...candidate,
          type: 'existing-official',
        };
        writeInOption.hasVote = true;
        break;
      }
      case 'write-in-candidate': {
        const candidate = assertDefined(
          initialValues.writeInCandidates.find(
            (c) => c.id === writeInRecord.candidateId
          )
        );
        writeInOption.writeInAdjudicationStatus = {
          ...candidate,
          type: 'existing-write-in',
        };
        writeInOption.hasVote = true;
        break;
      }
      case 'invalid': {
        writeInOption.writeInAdjudicationStatus = { type: 'invalid' };
        writeInOption.hasVote = false;
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
  initialValues?: Partial<InitialValues>
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
  resetState: () => void;
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
    isStateReady: false,
    isModified: false,
  });
  const optionsList = [...state.optionState.values()];

  function resetState() {
    setState({
      optionState: makeEmptyState(contestInfo),
      isStateReady: false,
      isModified: false,
    });
  }

  // Initialize state when initial values are loaded
  useEffect(() => {
    const isInputLoaded =
      initialValues &&
      initialValues.votes &&
      initialValues.writeIns &&
      initialValues.writeInCandidates &&
      initialValues.voteAdjudications &&
      initialValues.marginalMarks &&
      initialValues.contestTag !== undefined;
    if (isInputLoaded && !state.isStateReady) {
      setState({
        optionState: makeInitialState(
          contestInfo,
          initialValues as InitialValues
        ),
        isStateReady: true,
        isModified: false,
      });
    }
  }, [initialValues, state.isStateReady, contestInfo]);

  function getOptionHasVote(optionId: ContestOptionId): boolean {
    return assertDefined(state.optionState.get(optionId)).hasVote;
  }

  function setOptionHasVote(optionId: ContestOptionId, hasVote: boolean) {
    setState((prev) => ({
      ...prev,
      isModified: true,
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
          isModified: true,
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

  return {
    resetState,
    isStateReady: state.isStateReady,
    isModified: state.isModified,
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
