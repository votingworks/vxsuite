import { expect, test } from 'vitest';
import { BallotSide } from './types';

test('has BallotSide enum', () => {
  expect(BallotSide).toEqual({
    Front: 'front',
    Back: 'back',
  });
});
