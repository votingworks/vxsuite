import { VotingMethod } from '.';
import { getLabelForVotingMethod } from './voting_method';

test('getLabelForVotingMethod', () => {
  expect(getLabelForVotingMethod(VotingMethod.Absentee)).toEqual('Absentee');
  expect(getLabelForVotingMethod(VotingMethod.Precinct)).toEqual('Precinct');
  expect(getLabelForVotingMethod(VotingMethod.Unknown)).toEqual('Other');

  // @ts-expect-error - testing invalid value
  expect(() => getLabelForVotingMethod(-1)).toThrow();
});
