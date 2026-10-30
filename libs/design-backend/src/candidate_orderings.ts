import { assertDefined } from '@votingworks/basics';
import type {
  BallotStyleGroupId,
  CandidateOrderings,
} from '@votingworks/types';

/**
 * Type-safe wrapper over a {@link CandidateOrderings} lookup for an election,
 * keyed by ballot style group ID.
 */
export class CandidateOrderingsMap {
  private readonly map: Map<BallotStyleGroupId, CandidateOrderings>;

  constructor(map: Map<BallotStyleGroupId, CandidateOrderings>) {
    this.map = map;
  }

  /**
   * Candidate orderings for the given ballot style's group.
   *
   * @throws iff no matching orderings are found. VxHub is expected to generate
   * orderings for every valid ballot style/group in an election.
   */
  get(bs: { groupId: BallotStyleGroupId }): CandidateOrderings {
    return assertDefined(
      this.map.get(bs.groupId),
      `no candidate orderings found for ballot style group ID ${bs.groupId}`
    );
  }
}
