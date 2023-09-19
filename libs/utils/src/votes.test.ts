import {
  electionFamousNames2021Fixtures,
  electionGridLayoutNewHampshireAmherstFixtures,
  electionGeneral,
  electionWithMsEitherNeither,
} from '@votingworks/fixtures';
import {
  BallotTargetMark,
  CandidateContest,
  WriteInCandidate,
  writeInCandidate,
  YesNoContest,
} from '@votingworks/types';
import { find, typedAs } from '@votingworks/basics';
import {
  convertMarksToVotesDict,
  getContestVoteOptionsForCandidateContest,
  getContestVoteOptionsForYesNoContest,
  getSingleYesNoVote,
  getWriteInCount,
  hasWriteIns,
  normalizeWriteInId,
} from './votes';

test('getContestVoteOptionsForYesNoContest', () => {
  const contest = find(
    electionWithMsEitherNeither.contests,
    (c): c is YesNoContest => c.type === 'yesno'
  );
  expect(getContestVoteOptionsForYesNoContest(contest)).toEqual([
    contest.yesOption.id,
    contest.noOption.id,
  ]);
});

test('getContestVoteOptionsForCandidateContest', () => {
  const contestWithWriteIns = find(
    electionGeneral.contests,
    (c): c is CandidateContest => c.type === 'candidate' && c.allowWriteIns
  );
  const contestWithoutWriteIns = find(
    electionGeneral.contests,
    (c): c is CandidateContest => c.type === 'candidate' && !c.allowWriteIns
  );
  expect(
    getContestVoteOptionsForCandidateContest(contestWithWriteIns)
  ).toHaveLength(contestWithWriteIns.candidates.length + 1);
  expect(
    getContestVoteOptionsForCandidateContest(contestWithoutWriteIns)
  ).toHaveLength(contestWithoutWriteIns.candidates.length);
});

test('getSingleYesNoVote', () => {
  expect(getSingleYesNoVote()).toEqual(undefined);
  expect(getSingleYesNoVote([])).toEqual(undefined);
  expect(getSingleYesNoVote(['yes-option'])).toEqual('yes-option');
  expect(getSingleYesNoVote(['no-option'])).toEqual('no-option');
  expect(getSingleYesNoVote(['yes-option', 'no-option'])).toEqual(undefined);
});

test('normalizeWriteInId', () => {
  expect(normalizeWriteInId('arandomword')).toEqual('arandomword');
  expect(normalizeWriteInId('writeIn-123')).toEqual('writeIn-123');
  expect(normalizeWriteInId('__write-in-123')).toEqual('__write-in-123');
  expect(normalizeWriteInId('write-in-123456')).toEqual(writeInCandidate.id);
});

const ballotTargetMarkBase: Pick<
  BallotTargetMark,
  'bounds' | 'scoredOffset' | 'target'
> = {
  bounds: { x: 0, y: 0, width: 0, height: 0 },
  scoredOffset: { x: 0, y: 0 },
  target: {
    inner: { x: 0, y: 0, width: 0, height: 0 },
    bounds: { x: 0, y: 0, width: 0, height: 0 },
  },
};

test('markInfoToVotesDict candidate', () => {
  const { election } = electionFamousNames2021Fixtures;
  const sherlockForMayorMark: BallotTargetMark = {
    type: 'candidate',
    contestId: 'mayor',
    optionId: 'sherlock-holmes',
    score: 0.5,
    ...ballotTargetMarkBase,
  };
  const edisonForMayorMark: BallotTargetMark = {
    type: 'candidate',
    contestId: 'mayor',
    optionId: 'thomas-edison',
    score: 0.5,
    ...ballotTargetMarkBase,
  };
  const writeInCandidateForMayorMark: BallotTargetMark = {
    type: 'candidate',
    contestId: 'mayor',
    optionId: 'write-in',
    score: 0.5,
    ...ballotTargetMarkBase,
  };
  const indexedWriteInCandidateForMayorMark: BallotTargetMark = {
    ...writeInCandidateForMayorMark,
    optionId: 'write-in-0',
  };
  const mayorContest = find(
    election.contests,
    (c): c is CandidateContest =>
      c.id === sherlockForMayorMark.contestId && c.type === 'candidate'
  );
  const sherlockCandidate = find(
    mayorContest.candidates,
    (c) => c.id === sherlockForMayorMark.optionId
  );
  const edisonCandidate = find(
    mayorContest.candidates,
    (c) => c.id === edisonForMayorMark.optionId
  );
  expect(
    convertMarksToVotesDict(
      election.contests,
      { marginal: 0.04, definite: 0.1 },
      [sherlockForMayorMark]
    )
  ).toEqual({ [mayorContest.id]: [sherlockCandidate] });
  expect(
    convertMarksToVotesDict(
      election.contests,
      { marginal: 0.5, definite: 0.8 },
      [sherlockForMayorMark]
    )
  ).toEqual({});
  expect(
    convertMarksToVotesDict(
      election.contests,
      { marginal: 0.04, definite: 0.1 },
      [sherlockForMayorMark, edisonForMayorMark]
    )
  ).toEqual({
    [mayorContest.id]: [sherlockCandidate, edisonCandidate],
  });
  expect(
    convertMarksToVotesDict(
      election.contests,
      { marginal: 0.04, definite: 0.1 },
      [writeInCandidateForMayorMark]
    )
  ).toEqual({
    [mayorContest.id]: [writeInCandidate],
  });
  expect(
    convertMarksToVotesDict(
      election.contests,
      { marginal: 0.04, definite: 0.1 },
      [indexedWriteInCandidateForMayorMark]
    )
  ).toEqual({
    [mayorContest.id]: [
      typedAs<WriteInCandidate>({
        id: 'write-in-0',
        name: 'Write-In #1',
        isWriteIn: true,
      }),
    ],
  });
});

test('markInfoToVotesDict yesno', () => {
  const { election } = electionGridLayoutNewHampshireAmherstFixtures;
  const yesnoContest = find(
    election.contests,
    (c): c is YesNoContest => c.type === 'yesno'
  );
  const yesMark: BallotTargetMark = {
    type: 'yesno',
    contestId: yesnoContest.id,
    optionId: yesnoContest.yesOption.id,
    score: 0.5,
    bounds: { x: 0, y: 0, width: 0, height: 0 },
    scoredOffset: { x: 0, y: 0 },
    target: {
      inner: { x: 0, y: 0, width: 0, height: 0 },
      bounds: { x: 0, y: 0, width: 0, height: 0 },
    },
  };
  const noMark: BallotTargetMark = {
    type: 'yesno',
    contestId: yesnoContest.id,
    optionId: yesnoContest.noOption.id,
    score: 0.5,
    bounds: { x: 0, y: 0, width: 0, height: 0 },
    scoredOffset: { x: 0, y: 0 },
    target: {
      inner: { x: 0, y: 0, width: 0, height: 0 },
      bounds: { x: 0, y: 0, width: 0, height: 0 },
    },
  };
  expect(
    convertMarksToVotesDict(
      election.contests,
      { marginal: 0.04, definite: 0.1 },
      [yesMark]
    )
  ).toEqual({ [yesnoContest.id]: [yesnoContest.yesOption.id] });
  expect(
    convertMarksToVotesDict(
      election.contests,
      { marginal: 0.5, definite: 0.8 },
      [yesMark]
    )
  ).toEqual({});
  expect(
    convertMarksToVotesDict(
      election.contests,
      { marginal: 0.04, definite: 0.1 },
      [yesMark, noMark]
    )
  ).toEqual({
    [yesnoContest.id]: [yesnoContest.yesOption.id, yesnoContest.noOption.id],
  });
});

test('getWriteInCount', () => {
  expect(getWriteInCount({ fishing: ['ban-fishing'] })).toEqual(0);
  expect(
    getWriteInCount({
      council: [
        {
          id: 'zebra',
          name: 'Zebra',
        },
      ],
    })
  ).toEqual(0);
  expect(
    getWriteInCount({
      council: [
        {
          id: 'write-in-0',
          name: 'Write In #0',
          isWriteIn: true,
        },
      ],
    })
  ).toEqual(1);
  expect(
    getWriteInCount({
      council: [
        {
          id: 'write-in-0',
          name: 'Write In #0',
          isWriteIn: true,
        },
      ],
      board: [
        {
          id: 'write-in-0',
          name: 'Write In #0',
          isWriteIn: true,
        },
      ],
    })
  ).toEqual(2);
});

test('hasWriteIns', () => {
  expect(hasWriteIns({ fishing: ['ban-fishing'] })).toEqual(false);
  expect(
    hasWriteIns({
      council: [
        {
          id: 'zebra',
          name: 'Zebra',
        },
      ],
    })
  ).toEqual(false);
  expect(
    hasWriteIns({
      council: [
        {
          id: 'write-in-0',
          name: 'Write In #0',
          isWriteIn: true,
        },
      ],
    })
  ).toEqual(true);
});
