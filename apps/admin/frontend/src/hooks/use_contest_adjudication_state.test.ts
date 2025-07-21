import { expect, test } from 'vitest';
import {
  WriteInCandidateRecord,
  WriteInRecord,
} from '@votingworks/admin-backend';
import { act, renderHook } from '@testing-library/react';
import {
  ContestInfo,
  InitialValues,
  isWriteInPending,
  makeInitialState,
  useContestAdjudicationState,
} from './use_contest_adjudication_state';

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

  const writeIns: WriteInRecord[] = [
    {
      optionId: 'write-in-0',
      status: 'pending',
      electionId,
      contestId,
      cvrId,
      id: 'write-in-0',
      isUnmarked: true,
    },
  ];

  const contestInfo: ContestInfo = {
    officialOptions: candidateOptions,
    isCandidateContest: true,
    numberOfWriteIns: 2,
  };

  const initialValues: InitialValues = {
    votes: ['alice'],
    voteAdjudications: [],
    marginalMarks: ['bob', 'write-in-1'],
    contestTag: { isResolved: false, cvrId, contestId },
    writeIns,
    writeInCandidates,
  };

  const { result } = renderHook(() =>
    useContestAdjudicationState(contestInfo, initialValues)
  );

  expect(result.current.voteCount).toEqual(1);
  expect(result.current.isModified).toEqual(false);
  expect(result.current.selectedCandidateNames).toEqual(['Alice']);
  expect(result.current.allAdjudicationsCompleted).toEqual(false);
  expect(result.current.firstOptionIdRequiringAdjudication).toEqual('bob');

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
  expect(result.current.isModified).toEqual(true);
  expect(result.current.selectedCandidateNames).toEqual(['Alice']);

  // Dismiss candidate marginal mark
  expect(result.current.getOptionMarginalMarkStatus('bob')).toEqual('pending');
  act(() => {
    result.current.resolveOptionMarginalMark('bob');
  });
  expect(result.current.getOptionMarginalMarkStatus('bob')).toEqual('resolved');

  // Toggle write-in vote to true
  expect(result.current.firstOptionIdRequiringAdjudication).toEqual(
    'write-in-0'
  );
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
  expect(result.current.firstOptionIdRequiringAdjudication).toEqual(
    'write-in-1'
  );
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

  expect(result.current.allAdjudicationsCompleted).toEqual(true);

  // Reset state
  act(() => {
    result.current.resetState();
  });
  expect(result.current.isModified).toEqual(false);
  expect(result.current.allAdjudicationsCompleted).toEqual(false);
  expect(result.current.voteCount).toEqual(1);
  expect(result.current.selectedCandidateNames).toEqual(['Alice']);
  expect(result.current.firstOptionIdRequiringAdjudication).toEqual('bob');
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
    numberOfWriteIns: 2,
  };

  const initialValues: InitialValues = {
    votes: ['alice', 'write-in-0'],
    voteAdjudications: [],
    marginalMarks: ['bob'],
    contestTag: { isResolved: false, cvrId, contestId },
    writeIns: [
      {
        optionId: 'write-in-0',
        status: 'pending',
        electionId,
        contestId,
        cvrId,
        id: 'write-in-0',
      },
    ],
    writeInCandidates,
  };

  const state = makeInitialState(contestInfo, initialValues);

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
    // Write-in 1 should be empty
    const writeIn1 = state.get('write-in-1')!;
    expect(writeIn1.hasVote).toEqual(false);
    expect(writeIn1.isWriteIn && writeIn1.writeInAdjudicationStatus).toEqual(
      undefined
    );
  }

  // Now try with the contest already resolved
  initialValues.contestTag.isResolved = true;
  initialValues.writeIns = [
    {
      optionId: 'write-in-0',
      status: 'adjudicated',
      adjudicationType: 'write-in-candidate',
      candidateId: 'lion',
      electionId,
      contestId,
      cvrId,
      id: 'write-in-0',
    },
  ];
  initialValues.voteAdjudications = [
    {
      optionId: 'bob',
      isVote: true,
      electionId: 'election',
      contestId,
      cvrId,
    },
  ];
  const adjudicatedState = makeInitialState(contestInfo, initialValues);

  expect(adjudicatedState.get('alice')!.hasVote).toEqual(true);
  expect(adjudicatedState.get('alice')!.marginalMarkStatus).toEqual('none');

  expect(adjudicatedState.get('bob')!.hasVote).toEqual(true);
  expect(adjudicatedState.get('bob')!.marginalMarkStatus).toEqual('resolved');

  // Write-in 0 should be adjudicated to Lion
  {
    const writeIn0 = adjudicatedState.get('write-in-0')!;
    expect(writeIn0.hasVote).toEqual(true);
    expect(writeIn0.isWriteIn && writeIn0.writeInAdjudicationStatus).toEqual({
      type: 'existing-write-in',
      id: 'lion',
      name: 'Lion',
      electionId,
      contestId,
    });
  }

  {
    // Write-in 1 should remain empty
    const writeIn1 = adjudicatedState.get('write-in-1')!;
    expect(writeIn1.hasVote).toEqual(false);
    expect(writeIn1.isWriteIn && writeIn1.writeInAdjudicationStatus).toEqual(
      undefined
    );
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

  const initialValues: InitialValues = {
    votes: [],
    voteAdjudications: [],
    marginalMarks: ['yes', 'no'],
    contestTag: { isResolved: false, cvrId, contestId },
    writeIns: [],
    writeInCandidates: [],
  };

  const state = makeInitialState(contestInfo, initialValues);

  expect(state.get('yes')!.hasVote).toEqual(false);
  expect(state.get('yes')!.marginalMarkStatus).toEqual('pending');

  expect(state.get('no')!.hasVote).toEqual(false);
  expect(state.get('no')!.marginalMarkStatus).toEqual('pending');

  // Now try with the contest already resolved
  initialValues.contestTag.isResolved = true;
  initialValues.voteAdjudications = [
    {
      optionId: 'yes',
      isVote: true,
      electionId: 'election',
      contestId,
      cvrId,
    },
  ];
  const adjudicatedState = makeInitialState(contestInfo, initialValues);

  expect(adjudicatedState.get('yes')!.hasVote).toEqual(true);
  expect(adjudicatedState.get('yes')!.marginalMarkStatus).toEqual('resolved');

  expect(adjudicatedState.get('no')!.hasVote).toEqual(false);
  expect(adjudicatedState.get('no')!.marginalMarkStatus).toEqual('resolved');
});
