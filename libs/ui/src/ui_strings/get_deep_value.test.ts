import { expect, test } from 'vitest';
import { getDeepValue } from './get_deep_value';

test('returns the value at a nested key path', () => {
  const object = { contestTitle: { contest1: ['audio1', 'audio2'] } } as const;

  expect(getDeepValue(object, 'contestTitle.contest1')).toEqual([
    'audio1',
    'audio2',
  ]);
  expect(getDeepValue(object, 'contestTitle')).toEqual({
    contest1: ['audio1', 'audio2'],
  });
});

test('returns undefined for missing paths', () => {
  const object = { contestTitle: { contest1: ['audio1'] } } as const;

  expect(getDeepValue(object, 'contestTitle.contest2')).toBeUndefined();
  expect(getDeepValue(object, 'ballotStyleId.subKey')).toBeUndefined();
  expect(getDeepValue(undefined, 'contestTitle')).toBeUndefined();
  expect(getDeepValue(null, 'contestTitle')).toBeUndefined();
});
