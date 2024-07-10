import { DateWithoutTime } from '@votingworks/basics';
import { electionAuthKey } from './auth';
import { election } from '../../test/election';

test('electionAuthKey', () => {
  expect(electionAuthKey(election)).toEqual({
    id: 'election-1',
    date: new DateWithoutTime('2020-11-03'),
  });
});
