import { expect, test } from 'vite-plus/test';
import { BallotSide } from './types';

test('has BallotSide enum', () => {
  expect(BallotSide).toEqual({
    Front: 'front',
    Back: 'back',
  });
});
