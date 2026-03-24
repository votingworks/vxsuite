import { expect, test } from 'vitest';
import {
  ContestAdjudicationData,
  ContestOptionAdjudicationData,
  WriteInCandidateRecord,
} from '@votingworks/admin-backend';
import { ContestOption } from '@votingworks/types';
import { act, renderHook } from '@testing-library/react';
import {
  ContestInfo,
  isWriteInPending,
  makeInitialState,
  useContestAdjudicationState,
} from './use_contest_adjudication_state';

function makeOption(
  definition: ContestOption,
  overrides: Partial<Omit<ContestOptionAdjudicationData, 'definition'>> = {}
): ContestOptionAdjudicationData {
  return {
    definition,
    initialVote: false,
    hasMarginalMark: false,
    voteAdjudication: undefined,
    writeInRecord: undefined,
    ...overrides,
  };
}

test('useContestAdjudicationState can manage adjudications', () => {
  const cvrId = 'cvr';
  const contestId = 'contest';
  const electionId = 'election';

  const candidateOptions = [
    { id: 'alice', name: 'Alice' },
    { id: 'bob', name: 'Bob' },
  ];

  const writeInCandidates: WriteInCandidateRecord[] = [
    { id: 'lion', name: 'Lion', electionId, contestId },
    { id: 'elephant', name: 'Elephant', electionId, contestId },
  ];

  const contestInfo: ContestInfo = {
    officialOptions: candidateOptions,
    isCandidateContest: true,
    numberOfWriteIns: 2,
  };

  const contestAdjudicationData: ContestAdjudicationData = {
    contestId,
    tag: { isResolved: false, source: 'scanner', cvrId, contestId },
    options: [
      makeOption(
        {
          type: 'candidate',
          id: 'alice',
          contestId,
          name: 'Alice',
          isWriteIn: false,
        },
        { initialVote: true }
      ),
      makeOption(
        {
          type: 'candidate',
          id: 'bob',
          contestId,
          name: 'Bob',
          isWriteIn: false,
        },
        { hasMarginalMark: true }
      ),
      makeOption(
        {
          type: 'candidate',
          id: 'write-in-0',
          contestId,
          name: 'Write-In',
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
          name: 'Write-In',
          isWriteIn: true,
          writeInIndex: 1,
        },
        { hasMarginalMark: true }
      ),
    ],
  };

  const { result } = renderHook(() =>
    useContestAdjudicationState(contestInfo, {
      contestAdjudicationData,
      writeInCandidates,
    })
  );

  expect(result.current.voteCount).toEqual(1);
  expect(result.current.isModified).toEqual(false);
  expect(result.current.selectedCandidateNames).toEqual(['Alice']);
  expect(result.current.allAdjudicationsCompleted).toEqual(false);
  expect(result.current.firstOptionIdPendingAdjudication).toEqual('bob');

  // Toggle candidate vote to true
  expect(result.current.getOptionHasVote('bob')).toEqual(false);
  act(() => {
    result.current.setOptionHasVote('bob', true);
  });
  expect(result.current.getOptionHasVote('bob')).toEqual(true);
  expect(result.current.voteCount).toEqual(2);
  expect(result.current.isModified).toEqual(true);
  expect(result.current.selectedCandidateNames).toEqual(['Alice', 'Bob']);

  // Toggle candidate vote to false
  act(() => {
    result.current.setOptionHasVote('bob', false);
  });
  expect(result.current.getOptionHasVote('bob')).toEqual(false);
  expect(result.current.voteCount).toEqual(1);
  expect(result.current.isModified).toEqual(false);
  expect(result.current.selectedCandidateNames).toEqual(['Alice']);

  // Dismiss candidate marginal mark
  expect(result.current.getOptionMarginalMarkStatus('bob')).toEqual('pending');
  act(() => {
    result.current.resolveOptionMarginalMark('bob');
  });
  expect(result.current.getOptionMarginalMarkStatus('bob')).toEqual('resolved');

  // Toggle write-in vote to true
  expect(result.current.firstOptionIdPendingAdjudication).toEqual('write-in-0');
  expect(result.current.getOptionHasVote('write-in-0')).toEqual(false);
  act(() => {
    result.current.setOptionHasVote('write-in-0', true);
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
      type: 'existing-official',
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

  // Dismiss write-in marginal mark
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

  // isModified is true when write-in status differs from initial)
  expect(result.current.isModified).toEqual(true);

  expect(result.current.allAdjudicationsCompleted).toEqual(true);
});

test('makeInitialState initializes official and write-in options correctly for candidate contest', () => {
  const cvrId = 'cvr';
  const contestId = 'contest';
  const electionId = 'election';

  const candidateOptions = [
    { id: 'alice', name: 'Alice' },
    { id: 'bob', name: 'Bob' },
  ];

  const writeInCandidates: WriteInCandidateRecord[] = [
    { id: 'lion', name: 'Lion', electionId, contestId },
    { id: 'elephant', name: 'Elephant', electionId, contestId },
  ];

  const contestInfo: ContestInfo = {
    officialOptions: candidateOptions,
    isCandidateContest: true,
    numberOfWriteIns: 3,
  };

  const contestAdjudicationData: ContestAdjudicationData = {
    contestId,
    tag: { isResolved: false, source: 'scanner', cvrId, contestId },
    options: [
      makeOption(
        {
          type: 'candidate',
          id: 'alice',
          contestId,
          name: 'Alice',
          isWriteIn: false,
        },
        { initialVote: true }
      ),
      makeOption(
        {
          type: 'candidate',
          id: 'bob',
          contestId,
          name: 'Bob',
          isWriteIn: false,
        },
        { hasMarginalMark: true }
      ),
      makeOption(
        {
          type: 'candidate',
          id: 'write-in-0',
          contestId,
          name: 'Write-In',
          isWriteIn: true,
          writeInIndex: 0,
        },
        {
          initialVote: true,
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
          name: 'Write-In',
          isWriteIn: true,
          writeInIndex: 1,
        },
        { hasMarginalMark: true }
      ),
      makeOption({
        type: 'candidate',
        id: 'write-in-2',
        contestId,
        name: 'Write-In',
        isWriteIn: true,
        writeInIndex: 2,
      }),
    ],
  };

  const state = makeInitialState(
    contestInfo,
    contestAdjudicationData,
    writeInCandidates
  );

  expect(state.get('alice')!.hasVote).toEqual(true);
  expect(state.get('alice')!.marginalMarkStatus).toEqual('none');

  expect(state.get('bob')!.hasVote).toEqual(false);
  expect(state.get('bob')!.marginalMarkStatus).toEqual('pending');

  {
    // Write-in 0 should be pending
    const writeIn0 = state.get('write-in-0')!;
    expect(writeIn0.hasVote).toEqual(true);
    expect(writeIn0.isWriteIn && writeIn0.writeInAdjudicationStatus).toEqual({
      type: 'pending',
    });
  }

  {
    // Write-in 1 has marginal mark
    const writeIn1 = state.get('write-in-1')!;
    expect(writeIn1.hasVote).toEqual(false);
    expect(writeIn1.marginalMarkStatus).toEqual('pending');
    expect(writeIn1.isWriteIn && writeIn1.writeInAdjudicationStatus).toEqual(
      undefined
    );
  }

  {
    // Write-in 2 should be empty
    const writeIn2 = state.get('write-in-2')!;
    expect(writeIn2.hasVote).toEqual(false);
    expect(writeIn2.isWriteIn && writeIn2.writeInAdjudicationStatus).toEqual(
      undefined
    );
  }
  // Now try with the contest already resolved
  const adjudicatedContestAdjudicationData: ContestAdjudicationData = {
    contestId,
    tag: { isResolved: true, source: 'scanner', cvrId, contestId },
    options: [
      makeOption(
        {
          type: 'candidate',
          id: 'alice',
          contestId,
          name: 'Alice',
          isWriteIn: false,
        },
        { initialVote: true }
      ),
      makeOption(
        {
          type: 'candidate',
          id: 'bob',
          contestId,
          name: 'Bob',
          isWriteIn: false,
        },
        {
          hasMarginalMark: true,
          voteAdjudication: {
            optionId: 'bob',
            isVote: true,
            electionId,
            contestId,
            cvrId,
          },
        }
      ),
      makeOption(
        {
          type: 'candidate',
          id: 'write-in-0',
          contestId,
          name: 'Write-In',
          isWriteIn: true,
          writeInIndex: 0,
        },
        {
          initialVote: true,
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
          name: 'Write-In',
          isWriteIn: true,
          writeInIndex: 1,
        },
        {
          initialVote: true,
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
        name: 'Write-In',
        isWriteIn: true,
        writeInIndex: 2,
      }),
    ],
  };
  const adjudicatedState = makeInitialState(
    contestInfo,
    adjudicatedContestAdjudicationData,
    writeInCandidates
  );

  expect(adjudicatedState.get('alice')!.hasVote).toEqual(true);
  expect(adjudicatedState.get('alice')!.marginalMarkStatus).toEqual('none');

  expect(adjudicatedState.get('bob')!.hasVote).toEqual(true);
  expect(adjudicatedState.get('bob')!.marginalMarkStatus).toEqual('resolved');

  // Write-in 0 should be adjudicated to Bob (official candidate)
  {
    const writeIn0 = adjudicatedState.get('write-in-0')!;
    expect(writeIn0.hasVote).toEqual(true);
    expect(writeIn0.isWriteIn && writeIn0.writeInAdjudicationStatus).toEqual({
      type: 'existing-official',
      id: 'bob',
      name: 'Bob',
    });
  }

  // Write-in 1 should be adjudicated as invalid
  {
    const writeIn1 = adjudicatedState.get('write-in-1')!;
    expect(writeIn1.hasVote).toEqual(false);
    expect(writeIn1.isWriteIn && writeIn1.writeInAdjudicationStatus).toEqual({
      type: 'invalid',
    });
  }

  {
    // Write-in 2 should remain empty
    const writeIn2 = adjudicatedState.get('write-in-2')!;
    expect(writeIn2.hasVote).toEqual(false);
    expect(writeIn2.isWriteIn && writeIn2.writeInAdjudicationStatus).toEqual(
      undefined
    );
  }

  // Also test with write-in adjudicated to write-in candidate
  const writeInCandidateAdjudicationData: ContestAdjudicationData = {
    ...adjudicatedContestAdjudicationData,
    options: [
      ...adjudicatedContestAdjudicationData.options.slice(0, 2),
      makeOption(
        {
          type: 'candidate',
          id: 'write-in-0',
          contestId,
          name: 'Write-In',
          isWriteIn: true,
          writeInIndex: 0,
        },
        {
          initialVote: true,
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
  const writeInCandidateState = makeInitialState(
    contestInfo,
    writeInCandidateAdjudicationData,
    writeInCandidates
  );

  // Write-in 0 should be adjudicated to Lion
  {
    const writeIn0 = writeInCandidateState.get('write-in-0')!;
    expect(writeIn0.hasVote).toEqual(true);
    expect(writeIn0.isWriteIn && writeIn0.writeInAdjudicationStatus).toEqual({
      type: 'existing-write-in',
      id: 'lion',
      name: 'Lion',
      electionId,
      contestId,
    });
  }
});

test('makeInitialState initializes options correctly for yes/no contest', () => {
  const cvrId = 'cvr';
  const contestId = 'contest';

  const options = [
    { id: 'yes', name: 'Yes' },
    { id: 'no', name: 'No' },
  ];

  const contestInfo: ContestInfo = {
    officialOptions: options,
    isCandidateContest: false,
    numberOfWriteIns: 0,
  };

  const contestAdjudicationData: ContestAdjudicationData = {
    contestId,
    tag: { isResolved: false, source: 'scanner', cvrId, contestId },
    options: [
      makeOption(
        { type: 'yesno', id: 'yes', contestId, name: 'Yes' },
        { hasMarginalMark: true }
      ),
      makeOption(
        { type: 'yesno', id: 'no', contestId, name: 'No' },
        { hasMarginalMark: true }
      ),
    ],
  };

  const state = makeInitialState(contestInfo, contestAdjudicationData, []);

  expect(state.get('yes')!.hasVote).toEqual(false);
  expect(state.get('yes')!.marginalMarkStatus).toEqual('pending');

  expect(state.get('no')!.hasVote).toEqual(false);
  expect(state.get('no')!.marginalMarkStatus).toEqual('pending');

  // Now try with the contest already resolved
  const electionId = 'election';
  const adjudicatedContestAdjudicationData: ContestAdjudicationData = {
    contestId,
    tag: { isResolved: true, source: 'scanner', cvrId, contestId },
    options: [
      makeOption(
        { type: 'yesno', id: 'yes', contestId, name: 'Yes' },
        {
          hasMarginalMark: true,
          voteAdjudication: {
            optionId: 'yes',
            isVote: true,
            electionId,
            contestId,
            cvrId,
          },
        }
      ),
      makeOption(
        { type: 'yesno', id: 'no', contestId, name: 'No' },
        { hasMarginalMark: true }
      ),
    ],
  };
  const adjudicatedState = makeInitialState(
    contestInfo,
    adjudicatedContestAdjudicationData,
    []
  );

  expect(adjudicatedState.get('yes')!.hasVote).toEqual(true);
  expect(adjudicatedState.get('yes')!.marginalMarkStatus).toEqual('resolved');

  expect(adjudicatedState.get('no')!.hasVote).toEqual(false);
  expect(adjudicatedState.get('no')!.marginalMarkStatus).toEqual('resolved');
});

test('useContestAdjudicationState for yesno contest: selectedCandidateNames and checkWriteInNameForDoubleVote', () => {
  const cvrId = 'cvr';
  const contestId = 'contest';

  const options = [
    { id: 'yes', name: 'Yes' },
    { id: 'no', name: 'No' },
  ];

  const contestInfo: ContestInfo = {
    officialOptions: options,
    isCandidateContest: false,
    numberOfWriteIns: 0,
  };

  const contestAdjudicationData: ContestAdjudicationData = {
    contestId,
    tag: { isResolved: false, source: 'scanner', cvrId, contestId },
    options: [
      makeOption(
        { type: 'yesno', id: 'yes', contestId, name: 'Yes' },
        { hasMarginalMark: true }
      ),
      makeOption({ type: 'yesno', id: 'no', contestId, name: 'No' }),
    ],
  };

  const { result } = renderHook(() =>
    useContestAdjudicationState(contestInfo, {
      contestAdjudicationData,
      writeInCandidates: [],
    })
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
