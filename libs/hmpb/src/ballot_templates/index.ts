import { nhBallotTemplate } from './nh_ballot_template';
import { nhBallotTemplateV3 } from './v3_nh_ballot_template';
import { vxDefaultBallotTemplate } from './vx_default_ballot_template';

export type {
  NhBallotProps,
  NhPrecinctSplitOptions,
} from './nh_ballot_template';

/**
 * All ballot templates, indexed by ID.
 */
export const ballotTemplates = {
  VxDefaultBallot: vxDefaultBallotTemplate,
  NhBallot: nhBallotTemplate,
  NhBallotV3: nhBallotTemplateV3,
} as const;

/**
 * The ID of a ballot template.
 */
export type BallotTemplateId = keyof typeof ballotTemplates;
