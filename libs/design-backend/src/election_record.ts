import {
  type DateWithoutTime,
  assert,
  assertDefined,
  throwIllegalValue,
  typedAs,
  uniqueDeep,
} from '@votingworks/basics';
import {
  type BallotLanguageConfig,
  type BallotLanguageConfigs,
  type Candidate,
  type CandidateContest,
  type CandidateId,
  type Contest,
  type ContestId,
  type District,
  type DistrictId,
  type Election,
  type ElectionId,
  type ElectionRegisteredVoterCounts,
  type ElectionType,
  type HmpbBallotPaperSize,
  type Iso8601Timestamp,
  type LanguageCode,
  type NhPrecinctSplitOptions,
  type Party,
  type PartyId,
  type PollingPlace,
  type PollingPlaceType,
  type Precinct,
  type PrecinctId,
  type Signature,
  type StraightPartyContest,
  type SystemSettings,
  type YesNoContest,
  type YesNoOption,
  hasSplits,
  safeParseSystemSettings,
} from '@votingworks/types';
import { type BallotTemplateId, generateBallotStyles } from '@votingworks/hmpb';
import { CandidateOrderingsMap } from './candidate_orderings.js';
import type { StateFeaturesConfig } from './features.js';
import type { ExternalElectionSource } from './types.js';

export interface ElectionRecord {
  jurisdictionId: string;
  election: Election;
  candidateOrderings: CandidateOrderingsMap;
  isMiCombinedBallotPrimary: boolean;
  systemSettings: SystemSettings;
  createdAt: Iso8601Timestamp;
  ballotLanguageConfigs: BallotLanguageConfigs;
  ballotTemplateId: BallotTemplateId;
  ballotsFinalizedAt: Date | null;
  lastExportedBallotHash?: string;
  externalSource?: ExternalElectionSource;
}

export type DuplicateElectionError = 'duplicate-title-and-date';

export type DuplicateDistrictErrorCode = 'duplicate-name';

export interface DuplicateDistrictError {
  code: DuplicateDistrictErrorCode;
  districtId: string;
}

export type DuplicatePrecinctError =
  | 'duplicate-precinct-name'
  | 'duplicate-split-name'
  | 'duplicate-split-districts';

export type DuplicatePartyErrorCode =
  | 'duplicate-name'
  | 'duplicate-full-name'
  | 'duplicate-abbrev';

export interface DuplicatePartyError {
  code: DuplicatePartyErrorCode;
  partyId: string;
}

export type DuplicateContestError =
  | 'duplicate-contest'
  | 'duplicate-candidate'
  | 'duplicate-option';

export type SetPollingPlaceError = 'duplicate-name' | 'invalid-precinct';

export interface ElectionRow {
  jurisdictionId: string;
  type: ElectionType;
  isMiCombinedBallotPrimary: boolean;
  title: string;
  date: DateWithoutTime;
  jurisdictionName: string;
  jurisdictionExternalId: string;
  state: string;
  seal: string;
  signature?: Signature;
  systemSettingsData: string;
  ballotPaperSize: HmpbBallotPaperSize;
  ballotTemplateId: BallotTemplateId;
  ballotsFinalizedAt: Date | null;
  createdAt: Iso8601Timestamp;
  ballotLanguageCodes: LanguageCode[];
  lastExportedBallotHash?: string;
  externalSource?: ExternalElectionSource;
}

export interface PrecinctRow {
  id: PrecinctId;
  name: string;
  districtIds: DistrictId[];
}

export interface PrecinctSplitRow {
  id: string;
  precinctId: PrecinctId;
  name: string;
  nhOptions: NhPrecinctSplitOptions;
  districtIds: DistrictId[];
}

export interface ContestRow {
  id: string;
  title: string;
  type: Contest['type'];
  districtId: DistrictId;
  seats: number | null;
  allowWriteIns: boolean | null;
  partyId: PartyId | null;
  termDescription: string | null;
  description: string | null;
  yesOptionId: string | null;
  yesOptionLabel: string | null;
  noOptionId: string | null;
  noOptionLabel: string | null;
  additionalOptions: YesNoOption[] | null;
}

export interface CandidateRow {
  id: CandidateId;
  contestId: string;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  designation: string | null;
  partyIds: PartyId[];
}

export interface PollingPlaceRow {
  id: string;
  name: string;
  precinctIds: string[];
  type: PollingPlaceType;
}

export interface RegisteredVoterCountRow {
  id: PrecinctId;
  count: number | null;
}

export interface SplitRegisteredVoterCountRow {
  id: string;
  precinctId: PrecinctId;
  count: number | null;
}

export function straightPartyContestId(electionId: ElectionId): ContestId {
  return `${electionId}-straight-party-contest`;
}

export function hasDuplicateOptionLabels(contest: YesNoContest): boolean {
  const labels = contest.options.map((option) => option.label);
  return new Set(labels).size !== labels.length;
}

export function hasDuplicateSplitDistricts(precinct: Precinct): boolean {
  return (
    hasSplits(precinct) &&
    uniqueDeep(precinct.splits, (split) => split.districtIds.toSorted())
      .length !== precinct.splits.length
  );
}

export function contestOrderPlacingNewCandidateContest(
  orderedContests: ReadonlyArray<{ id: string; type: string }>,
  newContestId: string
): string[] | undefined {
  const contestIds = orderedContests.map((row) => row.id);
  const firstBallotMeasureIndex = orderedContests.findIndex(
    (row) => row.type === 'yesno'
  );
  if (firstBallotMeasureIndex === -1) return undefined;
  const newContestIndex = contestIds.indexOf(newContestId);
  assert(newContestIndex === contestIds.length - 1);
  contestIds.splice(newContestIndex, 1);
  contestIds.splice(firstBallotMeasureIndex, 0, newContestId);
  return contestIds;
}

const NH_OPTION_KEYS = [
  'electionTitleOverride',
  'electionSealOverride',
  'clerkSignatureImage',
  'clerkSignatureCaption',
] as const satisfies ReadonlyArray<keyof NhPrecinctSplitOptions>;

function canonicalNhOptions(
  nhOptions: NhPrecinctSplitOptions
): NhPrecinctSplitOptions {
  const canonical: NhPrecinctSplitOptions = {};
  for (const key of NH_OPTION_KEYS) {
    if (nhOptions[key] !== undefined) canonical[key] = nhOptions[key];
  }
  return canonical;
}

export function precinctsFromRows(
  precinctRows: readonly PrecinctRow[],
  precinctSplitRows: readonly PrecinctSplitRow[]
): Precinct[] {
  return precinctRows.map((row) => {
    const splits = precinctSplitRows
      .filter((split) => split.precinctId === row.id)
      .map((split) => ({
        id: split.id,
        name: split.name,
        districtIds: split.districtIds,
        ...canonicalNhOptions(split.nhOptions),
      }));
    return splits.length > 0
      ? { id: row.id, name: row.name, splits }
      : { id: row.id, name: row.name, districtIds: row.districtIds };
  });
}

export function contestsFromRows(
  contestRows: readonly ContestRow[],
  candidateRows: readonly CandidateRow[]
): Contest[] {
  return contestRows.map((row) => {
    assert(
      row.type !== 'straight-party',
      'Straight party contests are generated on read'
    );
    switch (row.type) {
      case 'candidate': {
        const candidates: Candidate[] = candidateRows
          .filter((candidate) => candidate.contestId === row.id)
          .map((candidate) => ({
            id: candidate.id,
            // @coverage-defer
            firstName: candidate.firstName || undefined,
            middleName: candidate.middleName || undefined,
            lastName: candidate.lastName || undefined,
            designation: candidate.designation || undefined,
            name: [
              candidate.firstName,
              candidate.middleName,
              candidate.lastName,
            ]
              .filter(Boolean)
              .join(' '),
            partyIds:
              candidate.partyIds.length > 0 ? candidate.partyIds : undefined,
          }));
        return typedAs<CandidateContest>({
          id: row.id,
          title: row.title,
          type: row.type,
          districtId: row.districtId,
          seats: assertDefined(row.seats),
          allowWriteIns: assertDefined(row.allowWriteIns),
          partyId: row.partyId ?? undefined,
          termDescription: row.termDescription ?? undefined,
          candidates,
        });
      }
      case 'yesno': {
        return typedAs<YesNoContest>({
          id: row.id,
          title: row.title,
          type: row.type,
          districtId: row.districtId,
          description: assertDefined(row.description),
          options: [
            {
              id: assertDefined(row.yesOptionId),
              label: assertDefined(row.yesOptionLabel),
            },
            {
              id: assertDefined(row.noOptionId),
              label: assertDefined(row.noOptionLabel),
            },
            // @coverage-defer
            ...(row.additionalOptions ?? []),
          ],
        });
      }
      default: {
        return throwIllegalValue(row.type);
      }
    }
  });
}

export function pollingPlacesFromRows(
  rows: readonly PollingPlaceRow[]
): PollingPlace[] {
  return rows.map((row) => {
    const place: PollingPlace = {
      id: row.id,
      name: row.name,
      precincts: {},
      type: row.type,
    };
    for (const precinctId of row.precinctIds) {
      place.precincts[precinctId] = { type: 'whole' };
    }
    return place;
  });
}

export function registeredVoterCountsFromRows(
  precinctRows: readonly RegisteredVoterCountRow[],
  splitRows: readonly SplitRegisteredVoterCountRow[]
): ElectionRegisteredVoterCounts {
  const splitsByPrecinctId = new Map<
    PrecinctId,
    Array<{ id: string; count: number | null }>
  >();
  for (const split of splitRows) {
    const group = splitsByPrecinctId.get(split.precinctId);
    if (group) {
      group.push(split);
    } else {
      splitsByPrecinctId.set(split.precinctId, [split]);
    }
  }

  const counts: ElectionRegisteredVoterCounts = {};
  for (const row of precinctRows) {
    const splits = splitsByPrecinctId.get(row.id) ?? [];
    if (splits.length > 0) {
      const splitCounts: Record<string, number> = {};
      for (const split of splits) {
        if (split.count !== null) {
          splitCounts[split.id] = split.count;
        }
      }
      if (Object.keys(splitCounts).length > 0) {
        counts[row.id] = { splits: splitCounts };
      }
    } else if (row.count !== null) {
      counts[row.id] = row.count;
    }
  }
  return counts;
}

export function buildElectionRecord({
  electionId,
  row,
  districts,
  precincts,
  parties,
  contests: storedContests,
  pollingPlaces,
  stateFeatures,
}: {
  electionId: ElectionId;
  row: ElectionRow;
  districts: District[];
  precincts: Precinct[];
  parties: Party[];
  contests: Contest[];
  pollingPlaces: PollingPlace[];
  stateFeatures: StateFeaturesConfig;
}): ElectionRecord {
  const contests = [...storedContests];
  const ballotLanguageConfigs = row.ballotLanguageCodes.map(
    (l): BallotLanguageConfig => ({ languages: [l] })
  );

  const { ballotStyles, candidateOrderings } = generateBallotStyles({
    ballotLanguageConfigs,
    contests,
    electionType: row.type,
    isMiCombinedBallotPrimary: row.isMiCombinedBallotPrimary,
    parties,
    precincts,
    ballotTemplateId: row.ballotTemplateId,
    electionId,
  });

  if (stateFeatures.STRAIGHT_PARTY_VOTING && row.type === 'general') {
    const district = districts.find((d) =>
      ballotStyles.every((ballotStyle) => ballotStyle.districts.includes(d.id))
    );
    if (district) {
      const straightPartyContest: StraightPartyContest = {
        id: straightPartyContestId(electionId),
        type: 'straight-party',
        title: 'Straight Party Ticket',
        districtId: district.id,
        optionIds: parties.map((party) => party.id),
      };
      contests.unshift(straightPartyContest);
    }
  }

  const election: Election = {
    id: electionId,
    type: row.type,
    title: row.title,
    date: row.date,
    jurisdiction: {
      id: row.jurisdictionExternalId,
      name: row.jurisdictionName,
    },
    state: row.state,
    seal: row.seal,
    signature:
      row.ballotTemplateId === 'NhBallot' ||
      row.ballotTemplateId === 'NhStateBallot'
        ? row.signature
        : undefined,
    districts,
    precincts,
    pollingPlaces,
    ballotStyles,
    parties,
    contests,
    ballotLayout: {
      paperSize: row.ballotPaperSize,
      metadataEncoding: 'qr-code',
    },
    ballotStrings: {},
  };

  return {
    election,
    candidateOrderings: new CandidateOrderingsMap(candidateOrderings),
    isMiCombinedBallotPrimary: row.isMiCombinedBallotPrimary,
    systemSettings: safeParseSystemSettings(
      row.systemSettingsData
    ).unsafeUnwrap(),
    ballotTemplateId: row.ballotTemplateId,
    createdAt: row.createdAt,
    ballotLanguageConfigs,
    ballotsFinalizedAt: row.ballotsFinalizedAt,
    jurisdictionId: row.jurisdictionId,
    lastExportedBallotHash: row.lastExportedBallotHash,
    externalSource: row.externalSource,
  };
}

export const NATURAL_SORT_COLLATOR = new Intl.Collator('en-u-kn-true');

export function naturalSortBy<T>(
  items: readonly T[],
  key: (item: T) => string
): T[] {
  return items.toSorted((a, b) =>
    NATURAL_SORT_COLLATOR.compare(key(a), key(b))
  );
}
