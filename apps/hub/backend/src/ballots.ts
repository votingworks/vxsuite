import type { BallotTemplateId } from '@votingworks/hmpb';
import { throwIllegalValue } from '@votingworks/basics';
import type { Jurisdiction } from './types.js';

export function defaultBallotTemplate(
  jurisdiction: Jurisdiction
): BallotTemplateId {
  switch (jurisdiction.stateCode) {
    case 'DEMO':
      return 'VxDefaultBallot';
    case 'MI':
      return 'MiBallot';
    case 'MS':
      return 'MsBallot';
    case 'NH':
      return 'NhBallot';
    default: {
      throwIllegalValue(jurisdiction.stateCode);
    }
  }
}
