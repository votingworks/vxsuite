import { nhBallotTemplate } from './nh_ballot_template';
import { vxDefaultBallotTemplate } from './vx_default_ballot_template';

export type { NhBallotProps } from './nh_ballot_template';

export { getAllOrderedContestSetsForNhBallot } from './nh_ballot_template';

/**
 * All ballot templates, indexed by ID.
 */
export const ballotTemplates = {
  VxDefaultBallot: vxDefaultBallotTemplate,
  NhBallot: nhBallotTemplate,
} as const;

/**
 * The ID of a ballot template.
 */
export type BallotTemplateId = keyof typeof ballotTemplates;
