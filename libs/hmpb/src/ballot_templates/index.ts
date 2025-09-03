import { nhBallotTemplate } from './nh_ballot_template';
import { nhPrimaryBallotTemplate } from './nh_primary_ballot_template';
import { nhStateBallotTemplate } from './nh_state_ballot_template';
import { vxDefaultBallotTemplate } from './vx_default_ballot_template';

export type { NhBallotProps } from './nh_ballot_template';
export type { NhPrimaryBallotProps } from './nh_primary_ballot_template';

/**
 * All ballot templates, indexed by ID.
 */
export const ballotTemplates = {
  VxDefaultBallot: vxDefaultBallotTemplate,
  NhBallot: nhBallotTemplate,
  NhPrimaryBallot: nhPrimaryBallotTemplate,
  NhStateBallot: nhStateBallotTemplate,
} as const;

/**
 * The ID of a ballot template.
 */
export type BallotTemplateId = keyof typeof ballotTemplates;
