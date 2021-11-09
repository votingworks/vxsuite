import { electionSample, electionSampleRotation } from '@votingworks/fixtures';
import { Candidate, CandidateContest } from '@votingworks/types';
import {
  getContestCandidatesInRotatedOrder,
  getContestVoteInRotatedOrder,
  rotateArrayByLength,
} from './rotation';

test('rotate array by 0', () => {
  const array = [1, 2, 3];
  expect(rotateArrayByLength(array, 0)).toEqual(array);
});

test('rotate array by 1', () => {
  const array = [1, 2, 3];
  expect(rotateArrayByLength(array, 1)).toEqual([2, 3, 1]);
});

test('rotate array by 3', () => {
  const array = [1, 2, 3, 4, 5, 6, 7];
  expect(rotateArrayByLength(array, 3)).toEqual([4, 5, 6, 7, 1, 2, 3]);
});

test('rotate array by more than array length', () => {
  const array = [1, 2, 3, 4, 5, 6, 7];
  expect(rotateArrayByLength(array, 9)).toEqual([3, 4, 5, 6, 7, 1, 2]);
});

test('negative lengths are not supported', () => {
  const array = [1, 2, 3, 4, 5, 6, 7];
  expect(rotateArrayByLength(array, -3)).toEqual(array);
});

test('Get contest candidates in rotated order', () => {
  const singleSeatCandidateContest = electionSampleRotation.contests.find(
    (c) => c.type === 'candidate'
  ) as CandidateContest;
  expect(
    getContestCandidatesInRotatedOrder({
      contest: singleSeatCandidateContest,
      precinctIndex: 0,
    }).findIndex((c) => c.id === 'white')
  ).toBe(0);
  expect(
    getContestCandidatesInRotatedOrder({
      contest: singleSeatCandidateContest,
      precinctIndex: 1,
    }).findIndex((c) => c.id === 'white')
  ).toBe(3);
  expect(
    getContestCandidatesInRotatedOrder({
      contest: singleSeatCandidateContest,
      precinctIndex: 2,
    }).findIndex((c) => c.id === 'white')
  ).toBe(2);

  const nonRotationSingleCandidateContest = electionSample.contests.find(
    (c) => c.type === 'candidate' && c.seats === 1
  ) as CandidateContest;
  expect(
    getContestCandidatesInRotatedOrder({
      contest: nonRotationSingleCandidateContest,
      precinctIndex: 0,
    }).findIndex((c) => c.id === 'barchi-hallaren')
  ).toBe(0);
});

test('Get contest vote in rotated order', () => {
  const multiSeatCandidateContest = electionSampleRotation.contests.find(
    (c) => c.type === 'candidate' && c.seats > 1 && c.allowWriteIns
  ) as CandidateContest;
  expect(
    getContestVoteInRotatedOrder({
      contest: multiSeatCandidateContest,
      precinctIndex: 0,
      vote: [],
    })
  ).toMatchInlineSnapshot(`Array []`);
  expect(
    getContestVoteInRotatedOrder({
      contest: multiSeatCandidateContest,
      precinctIndex: 0,
      vote: [
        {
          id: '__writeIn',
          name: 'first write-in',
          isWriteIn: true,
        },
        multiSeatCandidateContest.candidates[1] as Candidate,
        multiSeatCandidateContest.candidates[2] as Candidate,
        multiSeatCandidateContest.candidates[0] as Candidate,
        {
          id: '__writeIn',
          name: 'last write-in',
          isWriteIn: true,
        },
      ],
    }).map((c) => c.name)
  ).toMatchInlineSnapshot(`
    Array [
      "Camille Argent 1",
      "Chloe Witherspoon-Smithson 2",
      "Clayton Bainbridge 3",
      "first write-in",
      "last write-in",
    ]
  `);
  expect(
    getContestVoteInRotatedOrder({
      contest: multiSeatCandidateContest,
      precinctIndex: 1,
      vote: [
        {
          id: '__writeIn',
          name: 'first write-in',
          isWriteIn: true,
        },
        multiSeatCandidateContest.candidates[1] as Candidate,
        multiSeatCandidateContest.candidates[2] as Candidate,
        multiSeatCandidateContest.candidates[0] as Candidate,
        {
          id: '__writeIn',
          name: 'last write-in',
          isWriteIn: true,
        },
      ],
    }).map((c) => c.name)
  ).toMatchInlineSnapshot(`
    Array [
      "Chloe Witherspoon-Smithson 2",
      "Clayton Bainbridge 3",
      "Camille Argent 1",
      "first write-in",
      "last write-in",
    ]
  `);

  const nonRotatedMultiSeatCandidateContest = electionSample.contests.find(
    (c) => c.type === 'candidate' && c.seats > 1 && c.allowWriteIns
  ) as CandidateContest;
  expect(
    getContestVoteInRotatedOrder({
      contest: nonRotatedMultiSeatCandidateContest,
      precinctIndex: 1,
      vote: [
        {
          id: '__writeIn',
          name: 'first write-in',
          isWriteIn: true,
        },
        nonRotatedMultiSeatCandidateContest.candidates[1]!,
        nonRotatedMultiSeatCandidateContest.candidates[2]!,
        nonRotatedMultiSeatCandidateContest.candidates[0]!,
        {
          id: '__writeIn',
          name: 'last write-in',
          isWriteIn: true,
        },
      ],
    }).map((c) => c.name)
  ).toMatchInlineSnapshot(`
    Array [
      "Camille Argent",
      "Chloe Witherspoon-Smithson",
      "Clayton Bainbridge",
      "first write-in",
      "last write-in",
    ]
  `);
});
