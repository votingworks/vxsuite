import { BallotPageTemplate } from '../render_ballot.js';
import { miBallotTemplate } from './mi_ballot_template.js';
import { msBallotTemplate } from './ms_ballot_template.js';
import { nhBallotTemplate } from './nh_ballot_template.js';
import { nhStateBallotTemplate } from './nh_state_ballot_template.js';
import { vxDefaultBallotTemplate } from './vx_default_ballot_template.js';

export type { NhBallotProps } from './nh_ballot_template.js';
export type {
  NhStateBallotProps,
  NhStateBallotVariant,
} from './nh_state_ballot_template.js';
export { NhStateSpotColors } from './nh_state_primary_ballot_template.js';

/**
 * All ballot templates, indexed by ID.
 */
export const ballotTemplates = {
  VxDefaultBallot: vxDefaultBallotTemplate,
  NhBallot: nhBallotTemplate,
  NhStateBallot: nhStateBallotTemplate,
  MsBallot: msBallotTemplate,
  MiBallot: miBallotTemplate,
} as const;

/**
 * Rotation functions associated with ballot templates.
 */
export { getCandidateOrderingSetsForNhBallot as getAllOrderedContestSetsForNhBallot } from './nh_ballot_template.js';

/**
 * Renders the NH state Return of Votes (ROV) form for an election.
 */
export { renderNhStateRovForm } from './nh_state_rov_form.js';

/**
 * The ID of a ballot template.
 */
export type BallotTemplateId = keyof typeof ballotTemplates;

type BallotTemplateProps<Template> = Template extends BallotPageTemplate<
  infer Props
>
  ? Props
  : never;

/**
 * The union of possible props types across all ballot templates.
 */
export type AnyBallotProps = BallotTemplateProps<
  (typeof ballotTemplates)[BallotTemplateId]
>;
