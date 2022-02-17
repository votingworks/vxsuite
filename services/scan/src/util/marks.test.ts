import { BallotMark, MarkStatus } from '@votingworks/types';
import { changesFromMarks, mergeChanges } from './marks';

test('returns an empty object when no changes are given', () => {
  expect(mergeChanges({ contest: { option: MarkStatus.Marked } })).toEqual({});
});

test('returns an empty object when a change without values is given', () => {
  expect(mergeChanges({ contest: { option: MarkStatus.Marked } }, {})).toEqual(
    {}
  );
});

test('returns the subset of the changes that differ from the original marks', () => {
  expect(
    mergeChanges(
      {
        contest: {
          option1: MarkStatus.Marginal,
          option2: MarkStatus.Marked,
        },
      },
      {
        contest: {
          option1: MarkStatus.Unmarked,
          option2: MarkStatus.Marked,
        },
      }
    )
  ).toEqual({
    contest: { option1: MarkStatus.Unmarked },
  });
});

test('takes the last value for a given option', () => {
  expect(
    mergeChanges(
      {},
      { contest: { option: MarkStatus.Unmarked } },
      { contest: { option: MarkStatus.Marked } }
    )
  ).toEqual({ contest: { option: MarkStatus.Marked } });
});

test('merges options from the same contest', () => {
  expect(
    mergeChanges(
      {},
      { contest: { option1: MarkStatus.Unmarked } },
      { contest: { option2: MarkStatus.Marked } }
    )
  ).toEqual({
    contest: { option1: MarkStatus.Unmarked, option2: MarkStatus.Marked },
  });
});

test('merges multiple contests', () => {
  expect(
    mergeChanges(
      {},
      { contest1: { option: MarkStatus.Unmarked } },
      { contest2: { option: MarkStatus.Marked } }
    )
  ).toEqual({
    contest1: { option: MarkStatus.Unmarked },
    contest2: { option: MarkStatus.Marked },
  });
});

test('removes contests that revert back to the original', () => {
  expect(
    mergeChanges(
      { contest: { option: MarkStatus.Unmarked } },
      { contest: { option: MarkStatus.Marked } },
      { contest: { option: MarkStatus.Unmarked } }
    )
  ).toEqual({});
});

test('changesFromMarks works with ms-either-neither', () => {
  const marks: BallotMark[] = [
    {
      type: 'ms-either-neither',
      bounds: { x: 50, y: 50, width: 50, height: 50 },
      contestId: 'either-neither-1',
      target: {
        bounds: { x: 50, y: 50, width: 50, height: 50 },
        inner: { x: 50, y: 50, width: 50, height: 50 },
      },
      optionId: 'either-id',
      score: 0.9,
      scoredOffset: { x: 0, y: 0 },
    },
  ];

  expect(changesFromMarks(marks, { marginal: 0.12, definite: 0.2 })).toEqual({
    'either-neither-1': {
      'either-id': 'marked',
    },
  });
});
