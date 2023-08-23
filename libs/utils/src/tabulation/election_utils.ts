import { AnyContest, Tabulation } from '@votingworks/types';
import { mapObject } from '@votingworks/basics';
import { getGroupKey, groupMapToGroupList } from './tabulation';

/**
 * Contests appear on ballots or not based on the district the contest is
 * associated with and the party. This function just covers the party part. Rules:
 *   - ballot measures can appear on ballots of any party
 *   - candidates contests with an associated party can only appear on ballots of the same party
 */
export function doesContestAppearOnPartyBallot(
  contest: AnyContest,
  ballotPartyId?: string
): boolean {
  return (
    contest.type === 'yesno' ||
    !contest.partyId ||
    contest.partyId === ballotPartyId
  );
}

/**
 * When processing primary reports, we may need to calculate results by party
 * but then display the data together. This utility helps merge groups *across*
 * party rather than *within* party. For example, with the following input:
 *
 * Group 1: { precinctId: 'A', partyId: '0' }
 *
 * Group 2: { precinctId: 'A', partyId: '1' }
 *
 * Group 3: { precinctId: 'B', partyId: '0' }
 *
 * Group 4: { precinctId: 'B', partyId: '1' }
 *
 * We would merge groups 1 and 2 together and groups 3 and 4 together. Yielding:
 *
 * Merged Group 1: { precinctId: 'A' }
 *
 * Merged Group 2: { precinctId: 'B' }
 */
export function coalesceGroupsAcrossParty<U, V>(
  partySeparatedGroups: Tabulation.GroupList<U>,
  groupBy: Tabulation.GroupBy,
  mergeGroups: (partyGroups: Tabulation.GroupList<U>) => V
): Tabulation.GroupList<V> {
  const groupsAcrossParty: Tabulation.GroupMap<Tabulation.GroupList<U>> = {};
  for (const group of partySeparatedGroups) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { partyId, ...rest } = group;
    const groupKey = getGroupKey(rest, { ...groupBy, groupByParty: false });

    groupsAcrossParty[groupKey] = [
      ...(groupsAcrossParty[groupKey] ?? []),
      group,
    ];
  }

  return groupMapToGroupList(mapObject(groupsAcrossParty, mergeGroups));
}
