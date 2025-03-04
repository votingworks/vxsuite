import { assertDefined } from '@votingworks/basics';
import { Election, SplittablePrecinct } from './election';

// istanbul ignore next - @preserve
export function generateSplittablePrecinctsForTest(
  sourceElection: Election
): SplittablePrecinct[] {
  return sourceElection.precincts.map(
    (p): SplittablePrecinct => ({
      ...p,
      districtIds: [assertDefined(sourceElection.districts[0]).id],
    })
  );
}
