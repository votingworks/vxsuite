import { expect, test } from 'vitest';
import { DateWithoutTime } from '@votingworks/basics';
import { constructElectionKey } from './auth.js';
import { election } from '../../test/election.js';

test('constructElectionKey', () => {
  expect(constructElectionKey(election)).toEqual({
    id: 'election-1',
    date: new DateWithoutTime('2020-11-03'),
  });
});
