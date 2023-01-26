import { electionSample } from '@votingworks/fixtures';
import { CandidateContest, YesNoContest } from '@votingworks/types';
import { assert } from '@votingworks/basics';
import { makeRect, vec } from '../utils';
import { convertMarksToVotes } from './convert_marks_to_votes';

test('no marks', () => {
  expect(convertMarksToVotes([], { definite: 0.1, marginal: 0.1 }, [])).toEqual(
    {}
  );
});

test('has votes for each mark that meets the threshold', () => {
  const [candidateContest1, candidateContest2] = electionSample.contests.filter(
    (c): c is CandidateContest => c.type === 'candidate'
  )!;
  assert(candidateContest1 && candidateContest2);

  const [contest1Candidate1, contest1Candidate2] = candidateContest1.candidates;
  assert(contest1Candidate1 && contest1Candidate2);

  const [contest2Candidate1, contest2Candidate2] = candidateContest2.candidates;
  assert(contest2Candidate1 && contest2Candidate2);

  const [yesNoContest1] = electionSample.contests.filter(
    (c): c is YesNoContest => c.type === 'yesno'
  )!;
  assert(yesNoContest1);

  const votes = convertMarksToVotes(
    electionSample.contests,
    { definite: 0.1, marginal: 0.08 },
    [
      {
        bounds: makeRect({ minX: 0, minY: 0, maxX: 1, maxY: 1 }),
        gridPosition: {
          type: 'option',
          side: 'front',
          row: 0,
          column: 0,
          contestId: candidateContest1.id,
          optionId: contest1Candidate1.id,
        },
        score: 0.1, // === definite
        scoredOffset: vec(0, 0),
      },
      {
        bounds: makeRect({ minX: 0, minY: 0, maxX: 1, maxY: 1 }),
        gridPosition: {
          type: 'option',
          side: 'front',
          row: 0,
          column: 0,
          contestId: candidateContest1.id,
          optionId: contest1Candidate2.id,
        },
        score: 0.09, // > marginal, < definite
        scoredOffset: vec(0, 0),
      },
      {
        bounds: makeRect({ minX: 0, minY: 0, maxX: 1, maxY: 1 }),
        gridPosition: {
          type: 'option',
          side: 'front',
          row: 0,
          column: 0,
          contestId: candidateContest2.id,
          optionId: contest2Candidate1.id,
        },
        score: 0.7, // > definite
        scoredOffset: vec(0, 0),
      },
      {
        bounds: makeRect({ minX: 0, minY: 0, maxX: 1, maxY: 1 }),
        gridPosition: {
          type: 'option',
          side: 'front',
          row: 0,
          column: 0,
          contestId: candidateContest2.id,
          optionId: contest2Candidate2.id,
        },
        score: 0.9, // > definite
        scoredOffset: vec(0, 0),
      },
      {
        bounds: makeRect({ minX: 0, minY: 0, maxX: 1, maxY: 1 }),
        gridPosition: {
          type: 'option',
          side: 'front',
          row: 0,
          column: 0,
          contestId: yesNoContest1.id,
          optionId: 'yes',
        },
        score: 0.2, // > definite
        scoredOffset: vec(0, 0),
      },
      {
        bounds: makeRect({ minX: 0, minY: 0, maxX: 1, maxY: 1 }),
        gridPosition: {
          type: 'option',
          side: 'front',
          row: 0,
          column: 0,
          contestId: yesNoContest1.id,
          optionId: 'no',
        },
        score: 0.007, // < marginal
        scoredOffset: vec(0, 0),
      },
    ]
  );

  expect(votes).toStrictEqual({
    [candidateContest1.id]: [contest1Candidate1],
    [candidateContest2.id]: [contest2Candidate1, contest2Candidate2],
    [yesNoContest1.id]: ['yes'],
  });
});
