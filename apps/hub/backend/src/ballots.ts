import {
  centralScanningPollingPlaceId,
  CENTRAL_SCANNING_POLLING_PLACE_NAME,
  earlyVotingPollingPlaceId,
  EARLY_VOTING_POLLING_PLACE_NAME,
  type Election,
  hasSplits,
  type PollingPlace,
  pollingPlacesGenerateFromPrecincts,
  type SystemSettings,
  type UiStringsPackage,
} from '@votingworks/types';
import type { BallotTemplateId } from '@votingworks/hmpb';
import { throwIllegalValue } from '@votingworks/basics';
import { createHash } from 'node:crypto';
import { getStateFeaturesConfig } from '@votingworks/election-definition-backend';
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
