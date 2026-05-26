import { expect, test } from 'vite-plus/test';
import { isOpenPrimary } from '@votingworks/types';
import { readElection } from './election_open_primary';

test('is recognized as an open primary', () => {
  expect(isOpenPrimary(readElection())).toEqual(true);
});
