import { throwIllegalValue } from '@votingworks/basics';
import type { BallotTemplateId } from '@votingworks/hmpb';
import type { StateCode } from './state_features.js';

/** The ballot template that ballots for the given state are rendered with. */
export function defaultBallotTemplate(stateCode: StateCode): BallotTemplateId {
  switch (stateCode) {
    case 'DEMO':
      return 'VxDefaultBallot';
    case 'MI':
      return 'MiBallot';
    case 'MS':
      return 'MsBallot';
    case 'NH':
      return 'NhBallot';
    default: {
      throwIllegalValue(stateCode);
    }
  }
}
