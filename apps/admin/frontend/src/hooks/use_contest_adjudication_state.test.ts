import { expect, test } from 'vitest';
import {
  AdjudicatedCvrContest,
  ContestAdjudicationData,
  ContestOptionAdjudicationData,
  WriteInCandidateRecord,
} from '@votingworks/admin-backend';
import {
  CandidateContest,
  Contest,
  ContestOption,
  YesNoContest,
} from '@votingworks/types';
import { act, renderHook } from '@testing-library/react';
import {
  isWriteInPending,
  useContestAdjudicationState,
} from './use_contest_adjudication_state';

const candidateContest: CandidateContest = {
  id: 'contest',
  districtId: 'district',
  title: 'Contest',
  type: 'candidate',
  seats: 2,
  allowWriteIns: true,
  candidates: [
    { id: 'alice', name: 'Alice' },
    { id: 'bob', name: 'Bob' },
  ],
};

const yesNoContest: YesNoContest = {
  id: 'contest',
  districtId: 'district',
  title: 'Contest',
  type: 'yesno',
  description: 'Question',
  yesOption: { id: 'yes', label: 'Yes' },
  noOption: { id: 'no', label: 'No' },
};

function makeOption(
  definition: ContestOption,
  overrides: Partial<Omit<ContestOptionAdjudicationData, 'definition'>> = {}
): ContestOptionAdjudicationData {
  return {
    definition,
    scannedVote: false,
    hasMarginalMark: false,
    writeInRecord: undefined,
    ...overrides,
  };
}

function renderAdjudicationState(
  contest: Contest,
  contestAdjudicationData: ContestAdjudicationData,
  writeInCandidates: WriteInCandidateRecord[],
  adjudicatedContest?: AdjudicatedCvrContest
) {
  return renderHook(() =>
    useContestAdjudicationState({
      contestAdjudicationData,
      writeInCandidates,
      contest,
      adjudicatedOptions: adjudicatedContest?.adjudicatedContestOptionById,
    })
  );
}

test('useContestAdjudicationState can manage adjudications', () => {
  const cvrId = 'cvr';
  const contestId = 'contest';
  const electionId = 'election';

  const writeInCandidates: WriteInCandidateRecord[] = [
    { id: 'lion', name: 'Lion', electionId, contestId },
    { id: 'elephant', name: 'Elephant', electionId, contestId },
  ];

  const contestAdjudicationData: ContestAdjudicationData = {
    contestId,
    tag: {},
    options: [
      makeOption(
        {
          type: 'candidate',
          id: 'alice',
          contestId,
          isWriteIn: false,
        },
        { scannedVote: true }
      ),
      makeOption(
        {
          type: 'candidate',
          id: 'bob',
          contestId,
          isWriteIn: false,
        },
        { hasMarginalMark: true }
      ),
      makeOption(
        {
          type: 'candidate',
          id: 'write-in-0',
          contestId,
          isWriteIn: true,
          writeInIndex: 0,
        },
        {
          writeInRecord: {
            id: 'write-in-0',
            optionId: 'write-in-0',
            status: 'pending',
            electionId,
            contestId,
            cvrId,
            isUnmarked: true,
          },
        }
      ),
      makeOption(
        {
          type: 'candidate',
          id: 'write-in-1',
          contestId,
          isWriteIn: true,
          writeInIndex: 1,
        },
        { hasMarginalMark: true }
      ),
    ],
  };

  const { result } = renderAdjudicationState(
    candidateContest,
    contestAdjudicationData,
    writeInCandidates
  );

  expect(result.current.voteCount).toEqual(1);
  expect(result.current.isModified).toEqual(false);
  expect(result.current.selectedCandidateNames).toEqual(['Alice']);
  expect(result.current.allAdjudicationsCompleted).toEqual(false);
  expect(result.current.firstOptionIdPendingAdjudication).toEqual('bob');

  // Toggle candidate vote to true — also auto-resolves the marginal mark
  expect(result.current.getOptionHasVote('bob')).toEqual(false);
  expect(result.current.getOptionMarginalMarkStatus('bob')).toEqual('pending');
  act(() => {
    result.current.setOptionHasVote('bob', true);
  });
  expect(result.current.getOptionHasVote('bob')).toEqual(true);
  expect(result.current.getOptionMarginalMarkStatus('bob')).toEqual('resolved');
  expect(result.current.voteCount).toEqual(2);
  expect(result.current.isModified).toEqual(true);
  expect(result.current.selectedCandidateNames).toEqual(['Alice', 'Bob']);

  // Toggle candidate vote back to false — mark stays resolved (entry persists)
  act(() => {
    result.current.setOptionHasVote('bob', false);
  });
  expect(result.current.getOptionHasVote('bob')).toEqual(false);
  expect(result.current.getOptionMarginalMarkStatus('bob')).toEqual('resolved');
  expect(result.current.voteCount).toEqual(1);
  expect(result.current.selectedCandidateNames).toEqual(['Alice']);

  // Open the unmarked write-in by setting it to pending; hasVote ticks via the
  // empty-name sentinel entry.
  expect(result.current.firstOptionIdPendingAdjudication).toEqual('write-in-0');
  expect(result.current.getOptionHasVote('write-in-0')).toEqual(false);
  act(() => {
    result.current.setOptionWriteInStatus('write-in-0', { type: 'pending' });
  });
  expect(result.current.getOptionHasVote('write-in-0')).toEqual(true);
  expect(
    isWriteInPending(result.current.getOptionWriteInStatus('write-in-0'))
  ).toEqual(true);
  expect(result.current.voteCount).toEqual(2);
  expect(result.current.selectedCandidateNames).toEqual(['Alice']);

  // Adjudicate write-in as existing official candidate
  act(() => {
    result.current.setOptionWriteInStatus('write-in-0', {
      type: 'existing-official',
      id: 'bob',
      name: 'Bob',
    });
  });
  expect(result.current.selectedCandidateNames).toEqual(['Alice', 'Bob']);

  // Adjudicate write-in as existing write-in candidate
  act(() => {
    result.current.setOptionWriteInStatus('write-in-0', {
      type: 'existing-write-in',
      id: 'lion',
      name: 'Lion',
    });
  });
  expect(result.current.selectedCandidateNames).toEqual(['Alice', 'Lion']);

  // Adjudicate write-in as new write-in candidate
  act(() => {
    result.current.setOptionWriteInStatus('write-in-0', {
      type: 'new-write-in',
      name: 'Siena',
    });
  });
  expect(result.current.selectedCandidateNames).toEqual(['Alice', 'Siena']);

  // Dismiss write-in marginal mark via resolveOptionMarginalMark
  expect(result.current.firstOptionIdPendingAdjudication).toEqual('write-in-1');
  expect(result.current.getOptionMarginalMarkStatus('write-in-1')).toEqual(
    'pending'
  );
  act(() => {
    result.current.resolveOptionMarginalMark('write-in-1');
  });
  expect(result.current.getOptionMarginalMarkStatus('write-in-1')).toEqual(
    'resolved'
  );

  // Check double vote alert
  expect(
    result.current.checkWriteInNameForDoubleVote({
      writeInName: 'siena',
      optionId: 'write-in-1',
    })
  ).toEqual({
    optionId: 'write-in-1',
    name: 'siena',
    type: 'adjudicated-write-in-candidate',
  });

  // New name is allowed
  expect(
    result.current.checkWriteInNameForDoubleVote({
      writeInName: 'New candidate',
      optionId: 'write-in-1',
    })
  ).toEqual(undefined);

  // Alice is not allowed, since she is already selected
  expect(
    result.current.checkWriteInNameForDoubleVote({
      writeInName: 'Alice',
      optionId: 'write-in-1',
    })
  ).toEqual({
    optionId: 'write-in-1',
    name: 'Alice',
    type: 'marked-official-candidate',
  });

  // Bob is allowed, since he is not selected
  expect(
    result.current.checkWriteInNameForDoubleVote({
      writeInName: 'Bob',
      optionId: 'write-in-1',
    })
  ).toEqual(undefined);

  // getOptionWriteInStatus on non-write-in option returns undefined
  expect(result.current.getOptionWriteInStatus('alice')).toEqual(undefined);

  // resolveOptionMarginalMark on already-resolved mark is a no-op
  expect(result.current.getOptionMarginalMarkStatus('write-in-1')).toEqual(
    'resolved'
  );
  act(() => {
    result.current.resolveOptionMarginalMark('write-in-1');
  });
  expect(result.current.getOptionMarginalMarkStatus('write-in-1')).toEqual(
    'resolved'
  );

  // isModified is true when state differs from initial
  expect(result.current.isModified).toEqual(true);

  expect(result.current.allAdjudicationsCompleted).toEqual(true);
});

test('initializes derived state correctly for candidate contest', () => {
  const cvrId = 'cvr';
  const contestId = 'contest';
  const electionId = 'election';

  const writeInCandidates: WriteInCandidateRecord[] = [
    { id: 'lion', name: 'Lion', electionId, contestId },
    { id: 'elephant', name: 'Elephant', electionId, contestId },
  ];

  const contestAdjudicationData: ContestAdjudicationData = {
    contestId,
    tag: {},
    options: [
      makeOption(
        {
          type: 'candidate',
          id: 'alice',
          contestId,
          isWriteIn: false,
        },
        { scannedVote: true }
      ),
      makeOption(
        {
          type: 'candidate',
          id: 'bob',
          contestId,
          isWriteIn: false,
        },
        { hasMarginalMark: true }
      ),
      makeOption(
        {
          type: 'candidate',
          id: 'write-in-0',
          contestId,
          isWriteIn: true,
          writeInIndex: 0,
        },
        {
          scannedVote: true,
          writeInRecord: {
            id: 'write-in-0',
            optionId: 'write-in-0',
            status: 'pending',
            electionId,
            contestId,
            cvrId,
          },
        }
      ),
      makeOption(
        {
          type: 'candidate',
          id: 'write-in-1',
          contestId,
          isWriteIn: true,
          writeInIndex: 1,
        },
        { hasMarginalMark: true }
      ),
      makeOption({
        type: 'candidate',
        id: 'write-in-2',
        contestId,
        isWriteIn: true,
        writeInIndex: 2,
      }),
    ],
  };

  const { result } = renderAdjudicationState(
    candidateContest,
    contestAdjudicationData,
    writeInCandidates
  );

  expect(result.current.getOptionHasVote('alice')).toEqual(true);
  expect(result.current.getOptionMarginalMarkStatus('alice')).toEqual('none');

  expect(result.current.getOptionHasVote('bob')).toEqual(false);
  expect(result.current.getOptionMarginalMarkStatus('bob')).toEqual('pending');

  // Backend-pending detected write-in
  expect(result.current.getOptionHasVote('write-in-0')).toEqual(true);
  expect(result.current.getOptionWriteInStatus('write-in-0')).toEqual({
    type: 'pending',
  });

  // Marginal-mark write-in
  expect(result.current.getOptionHasVote('write-in-1')).toEqual(false);
  expect(result.current.getOptionMarginalMarkStatus('write-in-1')).toEqual(
    'pending'
  );
  expect(result.current.getOptionWriteInStatus('write-in-1')).toEqual(
    undefined
  );

  // Empty write-in
  expect(result.current.getOptionHasVote('write-in-2')).toEqual(false);
  expect(result.current.getOptionWriteInStatus('write-in-2')).toEqual(
    undefined
  );

  // Now with the contest already adjudicated (write-in records adjudicated to
  // various outcomes, baseline supplied via adjudicatedContest)
  const adjudicatedContestAdjudicationData: ContestAdjudicationData = {
    contestId,
    tag: {},
    options: [
      makeOption(
        {
          type: 'candidate',
          id: 'alice',
          contestId,
          isWriteIn: false,
        },
        { scannedVote: true }
      ),
      makeOption(
        {
          type: 'candidate',
          id: 'bob',
          contestId,
          isWriteIn: false,
        },
        { hasMarginalMark: true }
      ),
      makeOption(
        {
          type: 'candidate',
          id: 'write-in-0',
          contestId,
          isWriteIn: true,
          writeInIndex: 0,
        },
        {
          scannedVote: true,
          writeInRecord: {
            id: 'write-in-0',
            optionId: 'write-in-0',
            status: 'adjudicated',
            adjudicationType: 'official-candidate',
            candidateId: 'bob',
            electionId,
            contestId,
            cvrId,
          },
        }
      ),
      makeOption(
        {
          type: 'candidate',
          id: 'write-in-1',
          contestId,
          isWriteIn: true,
          writeInIndex: 1,
        },
        {
          scannedVote: true,
          writeInRecord: {
            id: 'write-in-1',
            optionId: 'write-in-1',
            status: 'adjudicated',
            adjudicationType: 'invalid',
            electionId,
            contestId,
            cvrId,
          },
        }
      ),
      makeOption({
        type: 'candidate',
        id: 'write-in-2',
        contestId,
        isWriteIn: true,
        writeInIndex: 2,
      }),
    ],
  };

  const adjudicatedContest: AdjudicatedCvrContest = {
    contestId,
    adjudicatedContestOptionById: {
      alice: { type: 'official-option', hasVote: true },
      bob: { type: 'official-option', hasVote: true },
      'write-in-0': {
        type: 'write-in-option',
        candidateType: 'official-candidate',
        hasVote: true,
        candidateId: 'bob',
      },
      'write-in-1': { type: 'write-in-option', hasVote: false },
    },
  };

  const { result: adjResult } = renderAdjudicationState(
    candidateContest,
    adjudicatedContestAdjudicationData,
    writeInCandidates,
    adjudicatedContest
  );

  expect(adjResult.current.getOptionHasVote('alice')).toEqual(true);
  expect(adjResult.current.getOptionMarginalMarkStatus('alice')).toEqual(
    'none'
  );

  expect(adjResult.current.getOptionHasVote('bob')).toEqual(true);
  expect(adjResult.current.getOptionMarginalMarkStatus('bob')).toEqual(
    'resolved'
  );

  // Write-in 0 — adjudicated to official candidate Bob
  expect(adjResult.current.getOptionHasVote('write-in-0')).toEqual(true);
  expect(adjResult.current.getOptionWriteInStatus('write-in-0')).toEqual({
    type: 'existing-official',
    id: 'bob',
    name: 'Bob',
  });

  // Write-in 1 — adjudicated as invalid
  expect(adjResult.current.getOptionHasVote('write-in-1')).toEqual(false);
  expect(adjResult.current.getOptionWriteInStatus('write-in-1')).toEqual({
    type: 'invalid',
  });

  // Write-in 2 — empty
  expect(adjResult.current.getOptionWriteInStatus('write-in-2')).toEqual(
    undefined
  );

  // Now with a write-in adjudicated to an existing write-in candidate
  const writeInCandidateData: ContestAdjudicationData = {
    ...adjudicatedContestAdjudicationData,
    options: [
      ...adjudicatedContestAdjudicationData.options.slice(0, 2),
      makeOption(
        {
          type: 'candidate',
          id: 'write-in-0',
          contestId,
          isWriteIn: true,
          writeInIndex: 0,
        },
        {
          scannedVote: true,
          writeInRecord: {
            id: 'write-in-0',
            optionId: 'write-in-0',
            status: 'adjudicated',
            adjudicationType: 'write-in-candidate',
            candidateId: 'lion',
            electionId,
            contestId,
            cvrId,
          },
        }
      ),
      adjudicatedContestAdjudicationData.options[3],
      adjudicatedContestAdjudicationData.options[4],
    ],
  };
  const writeInCandidateAdjudicatedContest: AdjudicatedCvrContest = {
    contestId,
    adjudicatedContestOptionById: {
      'write-in-0': {
        type: 'write-in-option',
        candidateType: 'write-in-candidate',
        hasVote: true,
        candidateName: 'Lion',
      },
      'write-in-1': { type: 'write-in-option', hasVote: false },
    },
  };
  const { result: writeInResult } = renderAdjudicationState(
    candidateContest,
    writeInCandidateData,
    writeInCandidates,
    writeInCandidateAdjudicatedContest
  );

  expect(writeInResult.current.getOptionHasVote('write-in-0')).toEqual(true);
  expect(writeInResult.current.getOptionWriteInStatus('write-in-0')).toEqual({
    type: 'existing-write-in',
    id: 'lion',
    name: 'Lion',
  });
});

test('initializes derived state correctly for yes/no contest', () => {
  const contestId = 'contest';

  const contestAdjudicationData: ContestAdjudicationData = {
    contestId,
    tag: {},
    options: [
      makeOption(
        { type: 'yesno', id: 'yes', contestId },
        { hasMarginalMark: true }
      ),
      makeOption(
        { type: 'yesno', id: 'no', contestId },
        { hasMarginalMark: true }
      ),
    ],
  };

  const { result } = renderAdjudicationState(
    yesNoContest,
    contestAdjudicationData,
    []
  );

  expect(result.current.getOptionHasVote('yes')).toEqual(false);
  expect(result.current.getOptionMarginalMarkStatus('yes')).toEqual('pending');

  expect(result.current.getOptionHasVote('no')).toEqual(false);
  expect(result.current.getOptionMarginalMarkStatus('no')).toEqual('pending');

  // Now with the contest already adjudicated (baseline supplied via adjudicatedContest)
  const adjudicatedContestAdjudicationData: ContestAdjudicationData = {
    contestId,
    tag: {},
    options: [
      makeOption(
        { type: 'yesno', id: 'yes', contestId },
        { hasMarginalMark: true }
      ),
      makeOption(
        { type: 'yesno', id: 'no', contestId },
        { hasMarginalMark: true }
      ),
    ],
  };
  const adjudicatedContest: AdjudicatedCvrContest = {
    contestId,
    adjudicatedContestOptionById: {
      yes: { type: 'official-option', hasVote: true },
      no: { type: 'official-option', hasVote: false },
    },
  };
  const { result: adjResult } = renderAdjudicationState(
    yesNoContest,
    adjudicatedContestAdjudicationData,
    [],
    adjudicatedContest
  );

  expect(adjResult.current.getOptionHasVote('yes')).toEqual(true);
  expect(adjResult.current.getOptionMarginalMarkStatus('yes')).toEqual(
    'resolved'
  );

  expect(adjResult.current.getOptionHasVote('no')).toEqual(false);
  expect(adjResult.current.getOptionMarginalMarkStatus('no')).toEqual(
    'resolved'
  );
});

test('useContestAdjudicationState for yesno contest: selectedCandidateNames and checkWriteInNameForDoubleVote', () => {
  const contestId = 'contest';

  const contestAdjudicationData: ContestAdjudicationData = {
    contestId,
    tag: {},
    options: [
      makeOption(
        { type: 'yesno', id: 'yes', contestId },
        { hasMarginalMark: true }
      ),
      makeOption({ type: 'yesno', id: 'no', contestId }),
    ],
  };

  const { result } = renderAdjudicationState(
    yesNoContest,
    contestAdjudicationData,
    []
  );

  // selectedCandidateNames returns [] for yesno contest
  expect(result.current.selectedCandidateNames).toEqual([]);

  // checkWriteInNameForDoubleVote returns undefined for yesno contest
  expect(
    result.current.checkWriteInNameForDoubleVote({
      writeInName: 'test',
      optionId: 'yes',
    })
  ).toEqual(undefined);
});

test('applies adjudicatedContest overlay across all option types', () => {
  const contestId = 'contest';
  const electionId = 'election';

  const writeInCandidates: WriteInCandidateRecord[] = [
    { id: 'lion', name: 'Lion', electionId, contestId },
  ];

  const contestAdjudicationData: ContestAdjudicationData = {
    contestId,
    tag: {},
    options: [
      makeOption(
        {
          type: 'candidate',
          id: 'alice',
          contestId,
          isWriteIn: false,
        },
        { scannedVote: false }
      ),
      makeOption({
        type: 'candidate',
        id: 'bob',
        contestId,
        isWriteIn: false,
      }),
      makeOption({
        type: 'candidate',
        id: 'write-in-0',
        contestId,
        isWriteIn: true,
        writeInIndex: 0,
      }),
      makeOption({
        type: 'candidate',
        id: 'write-in-1',
        contestId,
        isWriteIn: true,
        writeInIndex: 1,
      }),
      makeOption({
        type: 'candidate',
        id: 'write-in-2',
        contestId,
        isWriteIn: true,
        writeInIndex: 2,
      }),
      makeOption({
        type: 'candidate',
        id: 'write-in-3',
        contestId,
        isWriteIn: true,
        writeInIndex: 3,
      }),
    ],
  };

  const adjudicatedContest: AdjudicatedCvrContest = {
    contestId,
    adjudicatedContestOptionById: {
      // candidate option flipped to a vote
      alice: { type: 'official-option', hasVote: true },
      // write-in marked invalid
      'write-in-0': { type: 'write-in-option', hasVote: false },
      // write-in adjudicated to an official candidate
      'write-in-1': {
        type: 'write-in-option',
        hasVote: true,
        candidateType: 'official-candidate',
        candidateId: 'bob',
      },
      // write-in adjudicated to an existing write-in candidate (matched by name)
      'write-in-2': {
        type: 'write-in-option',
        hasVote: true,
        candidateType: 'write-in-candidate',
        candidateName: 'Lion',
      },
      // write-in adjudicated to a brand-new write-in candidate (not in list)
      'write-in-3': {
        type: 'write-in-option',
        hasVote: true,
        candidateType: 'write-in-candidate',
        candidateName: 'Mr. Hero',
      },
    },
  };

  const { result } = renderAdjudicationState(
    candidateContest,
    contestAdjudicationData,
    writeInCandidates,
    adjudicatedContest
  );

  expect(result.current.getOptionHasVote('alice')).toEqual(true);

  expect(result.current.getOptionHasVote('write-in-0')).toEqual(false);
  expect(result.current.getOptionWriteInStatus('write-in-0')).toEqual({
    type: 'invalid',
  });

  expect(result.current.getOptionHasVote('write-in-1')).toEqual(true);
  expect(result.current.getOptionWriteInStatus('write-in-1')).toEqual({
    type: 'existing-official',
    id: 'bob',
    name: 'Bob',
  });

  expect(result.current.getOptionHasVote('write-in-2')).toEqual(true);
  expect(result.current.getOptionWriteInStatus('write-in-2')).toEqual({
    type: 'existing-write-in',
    id: 'lion',
    name: 'Lion',
  });

  expect(result.current.getOptionHasVote('write-in-3')).toEqual(true);
  expect(result.current.getOptionWriteInStatus('write-in-3')).toEqual({
    type: 'new-write-in',
    name: 'Mr. Hero',
  });

  // isModified starts at false because optionState equals initialOptionState
  expect(result.current.isModified).toEqual(false);

  // Edits on top of the adjudicatedContest overlay take effect

  // Flip alice's vote off — overrides the unsaved hasVote=true
  act(() => {
    result.current.setOptionHasVote('alice', false);
  });
  expect(result.current.getOptionHasVote('alice')).toEqual(false);
  expect(result.current.isModified).toEqual(true);

  // Re-adjudicate write-in-1 from official candidate to invalid
  act(() => {
    result.current.setOptionWriteInStatus('write-in-1', { type: 'invalid' });
  });
  expect(result.current.getOptionHasVote('write-in-1')).toEqual(false);
  expect(result.current.getOptionWriteInStatus('write-in-1')).toEqual({
    type: 'invalid',
  });

  // Re-adjudicate write-in-3 to a different name
  act(() => {
    result.current.setOptionWriteInStatus('write-in-3', {
      type: 'new-write-in',
      name: 'Different Hero',
    });
  });
  expect(result.current.getOptionWriteInStatus('write-in-3')).toEqual({
    type: 'new-write-in',
    name: 'Different Hero',
  });
});
