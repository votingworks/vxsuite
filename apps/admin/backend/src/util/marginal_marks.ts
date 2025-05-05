import { ContestOptionId } from '@votingworks/types';
// import { Store } from '../store';

/**
 * Retrieves image data necessary to adjudicate write-ins for a given cvr contest
 */
export function getMarginalMarks(): ContestOptionId[] {
  // input: {
  //   cvrId: Id;
  //   contestId: Id;
  // },
  // store: Store
  // const { contestId, cvrId } = input;

  // get cvr mark thresholds
  // calculate marginal marks
  const marginalMarks: ContestOptionId[] = ['write-in-1'];
  return marginalMarks;
}
