import { msBallotTemplate } from './ms_ballot_template';
import { nhBallotTemplate } from './nh_ballot_template';
import { nhGeneralBallotTemplate } from './nh_general_ballot_template';
import { vxDefaultBallotTemplate } from './vx_default_ballot_template';

export type { NhBallotProps } from './nh_ballot_template';
export type { NhGeneralBallotProps } from './nh_general_ballot_template';

/**
 * All ballot templates, indexed by ID.
 */
export const ballotTemplates = {
  VxDefaultBallot: vxDefaultBallotTemplate,
  NhBallot: nhBallotTemplate,
  MsBallot: msBallotTemplate,
  NhGeneralBallot: nhGeneralBallotTemplate,
} as const;

/**
 * Rotation functions associated with ballot templates.
 */
export { getCandidateOrderingSetsForNhBallot as getAllOrderedContestSetsForNhBallot } from './nh_ballot_template';

/**
 * The ID of a ballot template.
 */
export type BallotTemplateId = keyof typeof ballotTemplates;
