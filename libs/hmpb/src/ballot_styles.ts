import {
  type BallotLanguageConfigs,
  type Contest,
  type DistrictId,
  type Parties,
  type PrecinctOrSplitId,
  type Precinct,
  hasSplits,
  type BallotStyle,
  type ElectionId,
  type ElectionType,
  type CandidateOrderings,
  type Party,
  type PartyId,
  type BallotStyleGroupId,
  type PrimaryElectionType,
} from '@votingworks/types';
import {
  generateBallotStyleGroupId,
  generateBallotStyleId,
} from '@votingworks/utils';
import type { BallotTemplateId } from './ballot_templates/index.js';
import { getAllPossibleCandidateOrderings } from './ballot_rotation.js';

export type PrimaryBallotConfig =
  | ClosedPrimaryBallotConfig
  | CombinedPrimaryBallotConfig;

export interface ClosedPrimaryBallotConfig {
  type: Extract<PrimaryElectionType, 'closed'>;
  withNonPartisanBallots: boolean;
}

export interface CombinedPrimaryBallotConfig {
  type: Extract<PrimaryElectionType, 'combined'>;
}

export type BallotParty = Pick<Party, 'abbrev'> & {
  id?: PartyId;
};

export const NON_PARTISAN_BALLOT_PARTY: BallotParty = {
  abbrev: 'NP',
};

const NO_PARTY = undefined;

/**
 * - For general elections, generates ballot styles based on geography data
 *   (districts, precincts, and precinct splits), ballot languages, and the
 *   ballot template.
 *
 * - For closed primary elections, uses the same factors but also generates
 *   distinct ballot styles for each party. If nonpartisan ballots are enabled,
 *   an additional, corresponding, nonpartisan style is created for each group
 *   of partisan styles, if there are any nonpartisan contests in that group.
 *
 * - For combined ballot primaries (where voters see contests from all parties
 *   on one ballot), does the same as general elections.
 *
 * The ballot template defines what rotation rules are applied. Rotation by
 * precinct may cause more ballot styles to need to be created.
 *
 * Each ballot style should have a unique set of contests or uniquely rotated
 * version of contests. Contests are specified per district. We generate ballot
 * styles by looking at the district list for each precinct/precinct split. If
 * the district list is unique, it gets its own ballot style. Otherwise, we
 * reuse another ballot style with the same district list. Then we apply
 * rotation rules, if they will result in a unique rotation for a given
 * precinct/split and set of contests it will get its own ballot style.
 */
export function generateBallotStyles(params: {
  contests: readonly Contest[];
  ballotLanguageConfigs: BallotLanguageConfigs;
  electionType: ElectionType;
  primaryConfig: PrimaryBallotConfig;
  parties: Parties;
  precincts: Precinct[];
  ballotTemplateId: BallotTemplateId;
  electionId: ElectionId;
}): {
  ballotStyles: BallotStyle[];
  candidateOrderings: Map<BallotStyleGroupId, CandidateOrderings>;
} {
  const {
    ballotLanguageConfigs,
    contests,
    electionType,
    primaryConfig,
    parties,
    precincts,
    ballotTemplateId,
    electionId,
  } = params;

  interface DistrictGroup {
    readonly districtIds: readonly DistrictId[];
    readonly precinctsOrSplitIds: PrecinctOrSplitId[];
  }

  const districtGroups = new Map<string, DistrictGroup>();
  const districtsWithContests = new Set(contests.map((c) => c.districtId));

  function addToDistrictGroup(
    precinctOrSplit: PrecinctOrSplitId,
    unsortedDistrictIds: readonly DistrictId[]
  ) {
    const districtIds = unsortedDistrictIds.toSorted();
    const key = districtIds.join(',');

    let group = districtGroups.get(key);
    if (!group) {
      group = { districtIds, precinctsOrSplitIds: [] };
      districtGroups.set(key, group);
    }

    group.precinctsOrSplitIds.push(precinctOrSplit);
  }

  for (const precinct of precincts) {
    if (!hasSplits(precinct)) {
      addToDistrictGroup({ precinctId: precinct.id }, precinct.districtIds);
      continue;
    }

    for (const { id: splitId, districtIds } of precinct.splits) {
      addToDistrictGroup({ precinctId: precinct.id, splitId }, districtIds);
    }
  }

  const ballotStyles: BallotStyle[] = [];
  const ballotCandidateOrderings = new Map<
    BallotStyleGroupId,
    CandidateOrderings
  >();

  const withParties =
    electionType !== 'general' && primaryConfig.type !== 'combined';

  let i = 1; // Ballot styles are 1-indexed.
  for (const { districtIds, precinctsOrSplitIds } of districtGroups.values()) {
    if (!districtIds.some((d) => districtsWithContests.has(d))) continue;

    const ballotStyleIndex = i;
    i += 1;

    const ballotStyleContests = contests.filter((contest) =>
      districtIds.includes(contest.districtId)
    );

    const orderingSets = getAllPossibleCandidateOrderings(ballotTemplateId, {
      contests: ballotStyleContests,
      precincts,
      precinctsOrSplitIds,
      electionId,
    });

    const contestParties = new Set<PartyId>();
    if (withParties) {
      for (const c of ballotStyleContests) {
        if (c.type === 'candidate' && c.partyId) contestParties.add(c.partyId);
      }
    }

    const ballotParties: BallotParty[] | [typeof NO_PARTY] = withParties
      ? getClosedPrimaryParties({
          ballotStyleContests,
          config: primaryConfig,
          contestParties,
          parties,
        })
      : [NO_PARTY];

    const hasRotations = orderingSets.length > 1;
    for (const [orderingIndex, orderings] of orderingSets.entries()) {
      const rotationIndex = hasRotations ? orderingIndex + 1 : undefined;

      const candidateOrderings = orderings.orderedCandidatesByContest;
      const precinctIds = orderings.precinctsOrSplits.map((p) => p.precinctId);

      for (const party of ballotParties) {
        const groupId = generateBallotStyleGroupId({
          ballotStyleIndex,
          rotationIndex,
          party,
        });

        ballotCandidateOrderings.set(groupId, candidateOrderings);

        for (const { languages } of ballotLanguageConfigs) {
          const id = generateBallotStyleId({
            ballotStyleIndex,
            rotationIndex,
            languages,
            party,
          });

          ballotStyles.push({
            id,
            groupId,
            precincts: precinctIds,
            districts: districtIds,
            partyId: party?.id,
            languages,
          });
        }
      }
    }
  }

  return { ballotStyles, candidateOrderings: ballotCandidateOrderings };
}

function getClosedPrimaryParties(params: {
  ballotStyleContests: Contest[];
  config: ClosedPrimaryBallotConfig;
  contestParties: Set<PartyId>;
  parties: Parties;
}): BallotParty[] {
  const parties: BallotParty[] = params.parties.filter((p) =>
    params.contestParties.has(p.id)
  );

  if (params.config.withNonPartisanBallots) {
    const hasNonPartisanContests = params.ballotStyleContests.some(
      (c) => c.type !== 'candidate' || !c.partyId
    );
    if (hasNonPartisanContests) parties.push(NON_PARTISAN_BALLOT_PARTY);
  }

  return parties;
}
