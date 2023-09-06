import { Tabulation } from '@votingworks/types';
import { mapObject } from '@votingworks/basics';
import { getGroupKey, getGroupSpecifierFromGroupKey } from './tabulation';

export function mergeTabulationGroupMaps<T, U, V>(
  groupedT: Tabulation.GroupMap<T>,
  groupedU: Tabulation.GroupMap<U>,
  merge: (t?: T, u?: U) => V
): Tabulation.GroupMap<V> {
  const merged: Tabulation.GroupMap<V> = {};
  const allGroupKeys = [
    ...new Set([...Object.keys(groupedT), ...Object.keys(groupedU)]),
  ];
  for (const groupKey of allGroupKeys) {
    merged[groupKey] = merge(groupedT[groupKey], groupedU[groupKey]);
  }
  return merged;
}

/**
 * Convert a {@link Tabulation.GroupMap} to its corresponding {@link Tabulation.GroupList}.
 * The map format is better for tabulation operations while the list format is easier
 * preferable for most consumers.
 */
export function groupMapToGroupList<T>(
  groupMap: Tabulation.GroupMap<T>
): Tabulation.GroupList<T> {
  const list: Tabulation.GroupList<T> = [];
  for (const [groupKey, group] of Object.entries(groupMap)) {
    list.push({
      ...getGroupSpecifierFromGroupKey(groupKey),
      // eslint-disable-next-line vx/gts-spread-like-types
      ...group,
    });
  }
  return list;
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
