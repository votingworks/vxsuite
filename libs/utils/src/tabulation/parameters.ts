import {
  assert,
  assertDefined,
  throwIllegalValue,
  unique,
} from '@votingworks/basics';
import {
  Id,
  Tabulation,
  ElectionDefinition,
  BallotStyleId,
  PartyId,
  Election,
} from '@votingworks/types';
import { intersectArraysIfDefined } from './list_utils';

export function getTrivialFundamentalFilter(): Tabulation.FundamentalFilter {
  return {
    isFundamental: true,
  };
}

export function getTrivialFundamentalGroupBy(): Tabulation.FundamentalGroupBy {
  return {
    isFundamental: true,
  };
}

export function getTrivialFundamentalGroupSpecifier(): Tabulation.FundamentalGroupSpecifier {
  return {
    isFundamental: true,
  };
}

export function resolveFilterToFundamentalFilter(
  filter: Tabulation.Filter,
  electionDefinition: ElectionDefinition,
  scannerBatches: Tabulation.ScannerBatch[]
): Tabulation.FundamentalFilter {
  const fundamentalFilter: Tabulation.FundamentalFilter = {
    isFundamental: true,
  };
  fundamentalFilter.precinctIds = filter.precinctIds;
  fundamentalFilter.votingMethods = filter.votingMethods;

  let resolvedBatchIds = filter.batchIds;
  if (filter.scannerIds) {
    const scannerIdSet = new Set(filter.scannerIds);
    const scannerRestrictedBatchIds = unique(
      scannerBatches
        .filter((sb) => scannerIdSet.has(sb.scannerId))
        .map((sb) => sb.batchId)
    );
    resolvedBatchIds = intersectArraysIfDefined(
      resolvedBatchIds,
      scannerRestrictedBatchIds
    );
  }
  fundamentalFilter.batchIds = resolvedBatchIds;

  const { election } = electionDefinition;
  let resolvedBallotStyleIds = filter.ballotStyleIds;
  if (filter.partyIds) {
    const { partyIds } = filter;
    const partyRestrictedBallotStyleIds = unique(
      election.ballotStyles
        .filter((bs) => bs.partyId && partyIds.includes(bs.partyId))
        .map((bs) => bs.id)
    );
    resolvedBallotStyleIds = intersectArraysIfDefined(
      resolvedBallotStyleIds,
      partyRestrictedBallotStyleIds
    );
  }
  if (filter.districtIds) {
    const { districtIds } = filter;
    const districtIdSet = new Set(districtIds);
    const districtRestrictedBallotStyleIds = unique(
      election.ballotStyles
        .filter((bs) => bs.districts.some((d) => districtIdSet.has(d)))
        .map((bs) => bs.id)
    );
    resolvedBallotStyleIds = intersectArraysIfDefined(
      resolvedBallotStyleIds,
      districtRestrictedBallotStyleIds
    );
  }
  fundamentalFilter.ballotStyleIds = resolvedBallotStyleIds;

  return fundamentalFilter;
}

export function resolveGroupByToFundamentalGroupBy(
  groupBy: Tabulation.GroupBy
): Tabulation.FundamentalGroupBy {
  return {
    isFundamental: true,
    groupByBallotStyle: groupBy.groupByBallotStyle || groupBy.groupByParty,
    groupByBatch: groupBy.groupByBatch || groupBy.groupByScanner,
    groupByPrecinct: groupBy.groupByPrecinct,
    groupByVotingMethod: groupBy.groupByVotingMethod,
  };
}

export type BallotStyleIdPartyIdLookup = Record<BallotStyleId, PartyId>;

/**
 * Creates a dictionary with keys of ballot style ids and values of their
 * corresponding party ids, if they exist.
 */
export function getBallotStyleIdPartyIdLookup(
  election: Election
): BallotStyleIdPartyIdLookup {
  const lookup: BallotStyleIdPartyIdLookup = {};
  for (const ballotStyle of election.ballotStyles) {
    if (ballotStyle.partyId) {
      lookup[ballotStyle.id] = ballotStyle.partyId;
    }
  }
  return lookup;
}

export function expandFundamentalGroupSpecifierToGroupSpecifier({
  fundamentalGroupSpecifier,
  groupBy,
  ballotStylePartyIdLookup,
  batchScannerIdLookup,
}: {
  fundamentalGroupSpecifier: Tabulation.FundamentalGroupSpecifier;
  groupBy: Tabulation.GroupBy;
  ballotStylePartyIdLookup: BallotStyleIdPartyIdLookup;
  batchScannerIdLookup: Record<Id, Id>;
}): Tabulation.GroupSpecifier {
  const groupSpecifier: Tabulation.GroupSpecifier = {};
  if (groupBy.groupByPrecinct) {
    groupSpecifier.precinctId = fundamentalGroupSpecifier.precinctId;
  }

  if (groupBy.groupByVotingMethod) {
    groupSpecifier.votingMethod = fundamentalGroupSpecifier.votingMethod;
  }

  if (groupBy.groupByBallotStyle) {
    groupSpecifier.ballotStyleId = fundamentalGroupSpecifier.ballotStyleId;
  }

  if (groupBy.groupByParty) {
    groupSpecifier.partyId =
      ballotStylePartyIdLookup[
        assertDefined(fundamentalGroupSpecifier.ballotStyleId)
      ];
  }

  if (groupBy.groupByBatch) {
    groupSpecifier.batchId = fundamentalGroupSpecifier.batchId;
  }

  if (groupBy.groupByScanner) {
    groupSpecifier.scannerId =
      batchScannerIdLookup[assertDefined(fundamentalGroupSpecifier.batchId)];
  }

  return groupSpecifier;
}

export const GROUP_KEY_ROOT = 'root' as Tabulation.FundamentalGroupKey;
const FUNDAMENTAL_GROUP_KEY_PART_TYPES = [
  'ballotStyleId',
  'batchId',
  'precinctId',
  'votingMethod',
] as const;
type FundamentalGroupKeyPartType =
  typeof FUNDAMENTAL_GROUP_KEY_PART_TYPES[number];

function escapeGroupKeyValue(groupKeyValue: string): string {
  return groupKeyValue
    .replaceAll('\\', '\\\\')
    .replaceAll('&', '\\&')
    .replaceAll('=', '\\=');
}

function unescapeGroupKeyValue(groupKeyValue: string): string {
  return groupKeyValue
    .replaceAll('\\=', '=')
    .replaceAll('\\&', '&')
    .replaceAll('\\\\', '\\');
}

function getGroupKeyPart(
  key: FundamentalGroupKeyPartType,
  value?: string
): string {
  assert(value !== undefined);
  return `${key}=${escapeGroupKeyValue(value)}`;
}

/**
 * Based on a group's attributes, defines a key which is used to
 * look up and uniquely identify tabulation objects within a grouping.
 *
 * Adds key parts in alphabetical order for consistency.
 */
export function getGroupKey(
  groupSpecifier: Tabulation.FundamentalGroupSpecifier,
  groupBy: Tabulation.FundamentalGroupBy
): Tabulation.FundamentalGroupKey {
  const keyParts: string[] = [GROUP_KEY_ROOT];
  if (groupBy.groupByBallotStyle) {
    keyParts.push(
      getGroupKeyPart('ballotStyleId', groupSpecifier.ballotStyleId)
    );
  }

  if (groupBy.groupByBatch) {
    keyParts.push(getGroupKeyPart('batchId', groupSpecifier.batchId));
  }

  if (groupBy.groupByPrecinct) {
    keyParts.push(getGroupKeyPart('precinctId', groupSpecifier.precinctId));
  }

  if (groupBy.groupByVotingMethod) {
    keyParts.push(getGroupKeyPart('votingMethod', groupSpecifier.votingMethod));
  }

  return keyParts.join('&') as Tabulation.FundamentalGroupKey;
}

export function getGroupSpecifierFromGroupKey(
  groupKey: Tabulation.FundamentalGroupKey
): Tabulation.FundamentalGroupSpecifier {
  const parts = groupKey.split(/(?<!\\)&/);
  const groupSpecifier: Tabulation.FundamentalGroupSpecifier = {
    isFundamental: true,
  };
  for (const part of parts) {
    if (part === GROUP_KEY_ROOT) {
      continue;
    }

    const [key, escapedValue] = part.split(/(?<!\\)=/) as [
      FundamentalGroupKeyPartType,
      string
    ];
    const value = unescapeGroupKeyValue(escapedValue);
    switch (key) {
      case 'ballotStyleId':
        groupSpecifier.ballotStyleId = unescapeGroupKeyValue(value);
        break;
      case 'batchId':
        groupSpecifier.batchId = unescapeGroupKeyValue(value);
        break;
      case 'precinctId':
        groupSpecifier.precinctId = unescapeGroupKeyValue(value);
        break;
      case 'votingMethod':
        groupSpecifier.votingMethod = unescapeGroupKeyValue(
          value
        ) as Tabulation.VotingMethod;
        break;
      /* c8 ignore next 2 */
      default:
        throwIllegalValue(key);
    }
  }
  return groupSpecifier;
}

export function isGroupByEmpty(
  groupBy: Tabulation.FundamentalGroupBy | Tabulation.GroupBy
): boolean {
  const isFundamentalGroupByEmpty =
    !groupBy.groupByBallotStyle &&
    !groupBy.groupByBatch &&
    !groupBy.groupByPrecinct &&
    !groupBy.groupByVotingMethod;

  if ('isFundamental' in groupBy) {
    return isFundamentalGroupByEmpty;
  }
  return (
    isFundamentalGroupByEmpty &&
    !groupBy.groupByParty &&
    !groupBy.groupByScanner
  );
}

export function mergeTabulationGroupMaps<T, U, V>(
  groupedT: Tabulation.FundamentalGroupMap<T>,
  groupedU: Tabulation.FundamentalGroupMap<U>,
  merge: (t?: T, u?: U) => V
): Tabulation.FundamentalGroupMap<V> {
  const merged: Tabulation.FundamentalGroupMap<V> = {};
  const allGroupKeys = [
    ...new Set([...Object.keys(groupedT), ...Object.keys(groupedU)]),
  ] as Tabulation.FundamentalGroupKey[];
  for (const groupKey of allGroupKeys) {
    merged[groupKey] = merge(groupedT[groupKey], groupedU[groupKey]);
  }
  return merged;
}

export function isSameGroup(
  groupSpecifier1: Tabulation.GroupSpecifier,
  groupSpecifier2: Tabulation.GroupSpecifier
): boolean {
  return (
    groupSpecifier1.ballotStyleId === groupSpecifier2.ballotStyleId &&
    groupSpecifier1.batchId === groupSpecifier2.batchId &&
    groupSpecifier1.precinctId === groupSpecifier2.precinctId &&
    groupSpecifier1.votingMethod === groupSpecifier2.votingMethod &&
    groupSpecifier1.scannerId === groupSpecifier2.scannerId &&
    groupSpecifier1.partyId === groupSpecifier2.partyId
  );
}

export function compareGroupSpecifier(
  a: Tabulation.GroupSpecifier,
  b: Tabulation.GroupSpecifier
): number {
  if (a.precinctId) {
    assert(b.precinctId !== undefined);
    const compareValue = a.precinctId.localeCompare(b.precinctId);
    if (compareValue !== 0) return compareValue;
  }

  if (a.partyId) {
    assert(b.partyId !== undefined);
    const compareValue = a.partyId.localeCompare(b.partyId);
    if (compareValue !== 0) return compareValue;
  }

  if (a.ballotStyleId) {
    assert(b.ballotStyleId !== undefined);
    const compareValue = a.ballotStyleId.localeCompare(b.ballotStyleId);
    if (compareValue !== 0) return compareValue;
  }

  if (a.votingMethod) {
    assert(b.votingMethod !== undefined);
    const compareValue = -a.votingMethod.localeCompare(b.votingMethod);
    if (compareValue !== 0) return compareValue;
  }

  if (a.scannerId) {
    assert(b.scannerId !== undefined);
    const compareValue = a.scannerId.localeCompare(b.scannerId);
    if (compareValue !== 0) return compareValue;
  }

  if (a.batchId) {
    assert(b.batchId !== undefined);
    const compareValue = a.batchId.localeCompare(b.batchId);
    if (compareValue !== 0) return compareValue;
  }

  return 0;
}

export function resolveFundamentalGroupMap<T>({
  groupBy = {},
  groupMap,
  electionDefinition,
  scannerBatches,
  combineFn,
}: {
  groupBy?: Tabulation.GroupBy;
  groupMap: Tabulation.FundamentalGroupMap<T>;
  electionDefinition: ElectionDefinition;
  scannerBatches: Tabulation.ScannerBatch[];
  combineFn: (ts: T[]) => T;
}): Tabulation.GroupList<T> {
  if (Object.keys(groupMap).length === 0) return [];

  const list: Tabulation.GroupList<T> = [];

  const ballotStylePartyIdLookup = getBallotStyleIdPartyIdLookup(
    electionDefinition.election
  );

  const batchScannerIdLookup: Record<Id, Id> = {};
  for (const batch of scannerBatches) {
    batchScannerIdLookup[batch.batchId] = batch.scannerId;
  }

  const valuesByGroupSpecifier: Array<{
    groupSpecifier: Tabulation.GroupSpecifier;
    value: T;
  }> = [];
  for (const [groupKey, value] of Object.entries(groupMap)) {
    const fundamentalGroupSpecifier = getGroupSpecifierFromGroupKey(
      groupKey as Tabulation.FundamentalGroupKey
    );
    const groupSpecifier = expandFundamentalGroupSpecifierToGroupSpecifier({
      fundamentalGroupSpecifier,
      groupBy,
      ballotStylePartyIdLookup,
      batchScannerIdLookup,
    });
    valuesByGroupSpecifier.push({ groupSpecifier, value });
  }

  const valuesSortedByGroupSpecifier = [...valuesByGroupSpecifier].sort(
    (
      { groupSpecifier: groupSpecifier1 },
      { groupSpecifier: groupSpecifier2 }
    ) => compareGroupSpecifier(groupSpecifier1, groupSpecifier2)
  );

  let { groupSpecifier: currentGroupSpecifier } = assertDefined(
    valuesSortedByGroupSpecifier[0]
  );
  let currentValues: T[] = [];
  for (const { groupSpecifier, value } of valuesSortedByGroupSpecifier) {
    if (isSameGroup(groupSpecifier, currentGroupSpecifier)) {
      currentValues.push(value);
    } else {
      // eslint-disable-next-line vx/gts-spread-like-types
      list.push({ ...currentGroupSpecifier, ...combineFn(currentValues) });

      currentGroupSpecifier = groupSpecifier;
      currentValues = [value];
    }
  }
  // eslint-disable-next-line vx/gts-spread-like-types
  list.push({ ...currentGroupSpecifier, ...combineFn(currentValues) });

  return list;
}

export function createFilterFromGroupSpecifier(
  groupSpecifier: Tabulation.GroupSpecifier
): Tabulation.Filter {
  const filter: Tabulation.Filter = {
    precinctIds: groupSpecifier.precinctId
      ? [groupSpecifier.precinctId]
      : undefined,
    votingMethods: groupSpecifier.votingMethod
      ? [groupSpecifier.votingMethod]
      : undefined,
    ballotStyleIds: groupSpecifier.ballotStyleId
      ? [groupSpecifier.ballotStyleId]
      : undefined,
    batchIds: groupSpecifier.batchId ? [groupSpecifier.batchId] : undefined,
    scannerIds: groupSpecifier.scannerId
      ? [groupSpecifier.scannerId]
      : undefined,
    partyIds: groupSpecifier.partyId ? [groupSpecifier.partyId] : undefined,
  };

  return filter;
}
