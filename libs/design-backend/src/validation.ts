import { err, ok, type Result } from '@votingworks/basics';
import {
  type Contest,
  type District,
  hasSplits,
  type Party,
  type PollingPlace,
  type Precinct,
} from '@votingworks/types';
import {
  type DuplicateContestError,
  type DuplicateDistrictError,
  type DuplicatePartyError,
  type DuplicatePrecinctError,
  hasDuplicateOptionLabels,
  hasDuplicateSplitDistricts,
  type SetPollingPlaceError,
} from './election_record.js';

interface EntityChanges<T extends { id: string }> {
  deletedIds?: readonly string[];
  updated?: readonly T[];
  added?: readonly T[];
}

function applyChanges<T extends { id: string }>(
  existing: readonly T[],
  { deletedIds = [], updated = [], added = [] }: EntityChanges<T>
): { final: T[]; written: T[] } {
  const updatedById = new Map(updated.map((item) => [item.id, item]));
  const existingIds = new Set(existing.map((item) => item.id));
  const final = existing
    .filter((item) => !deletedIds.includes(item.id))
    .map((item) => updatedById.get(item.id) ?? item)
    .concat(added);
  return {
    final,
    written: [...updated.filter((item) => existingIds.has(item.id)), ...added],
  };
}

function hasDuplicate<T extends { id: string }>(
  items: readonly T[],
  item: T,
  key: (value: T) => unknown
): boolean {
  return items.some(
    (other) => other.id !== item.id && key(other) === key(item)
  );
}

function findFirstConflict<T extends { id: string }>(
  final: readonly T[],
  written: readonly T[],
  keys: ReadonlyArray<(value: T) => unknown>
): { item: T; keyIndex: number } | undefined {
  for (const [index, item] of written.entries()) {
    const laterIds = new Set(written.slice(index + 1).map((w) => w.id));
    const settled = final.filter((other) => !laterIds.has(other.id));
    const keyIndex = keys.findIndex((key) => hasDuplicate(settled, item, key));
    if (keyIndex !== -1) return { item, keyIndex };
  }
  return undefined;
}

export function validateDistrictChanges(
  existing: readonly District[],
  changes: EntityChanges<District>
): Result<void, DuplicateDistrictError> {
  const { final, written } = applyChanges(existing, changes);
  const conflict = findFirstConflict(final, written, [(d) => d.name]);
  return conflict
    ? err({ code: 'duplicate-name', districtId: conflict.item.id })
    : ok();
}

export function validatePartyChanges(
  existing: readonly Party[],
  changes: EntityChanges<Party>
): Result<void, DuplicatePartyError> {
  const { final, written } = applyChanges(existing, changes);
  const conflict = findFirstConflict(final, written, [
    (p) => p.name,
    (p) => p.fullName,
    (p) => p.abbrev,
  ]);
  if (!conflict) return ok();
  const codes = [
    'duplicate-name',
    'duplicate-full-name',
    'duplicate-abbrev',
  ] as const;
  return err({ code: codes[conflict.keyIndex]!, partyId: conflict.item.id });
}

export function validatePrecinct(
  existing: readonly Precinct[],
  precinct: Precinct
): Result<void, DuplicatePrecinctError> {
  if (hasDuplicate(existing, precinct, (p) => p.name)) {
    return err('duplicate-precinct-name');
  }
  if (hasDuplicateSplitDistricts(precinct)) {
    return err('duplicate-split-districts');
  }
  if (hasSplits(precinct)) {
    const splitNames = precinct.splits.map((split) => split.name);
    if (new Set(splitNames).size !== splitNames.length) {
      return err('duplicate-split-name');
    }
  }
  return ok();
}

function contestKey(contest: Contest): string {
  return JSON.stringify([
    contest.districtId,
    contest.title,
    contest.type === 'candidate' ? contest.seats : null,
    contest.type === 'candidate' ? (contest.termDescription ?? null) : null,
    contest.type === 'candidate' ? (contest.partyId ?? null) : null,
  ]);
}

export function validateContest(
  existing: readonly Contest[],
  contest: Contest
): Result<void, DuplicateContestError> {
  if (contest.type === 'yesno' && hasDuplicateOptionLabels(contest)) {
    return err('duplicate-option');
  }
  const storedContests = existing.filter((c) => c.type !== 'straight-party');
  if (hasDuplicate(storedContests, contest, contestKey)) {
    return err('duplicate-contest');
  }
  if (contest.type === 'candidate') {
    const candidateNames = contest.candidates.map((candidate) =>
      JSON.stringify([
        candidate.firstName ?? null,
        candidate.middleName ?? null,
        candidate.lastName ?? null,
      ])
    );
    if (new Set(candidateNames).size !== candidateNames.length) {
      return err('duplicate-candidate');
    }
  }
  return ok();
}

export function validatePollingPlace(
  existing: readonly PollingPlace[],
  precincts: readonly Precinct[],
  place: PollingPlace
): Result<void, SetPollingPlaceError> {
  if (hasDuplicate(existing, place, (p) => JSON.stringify([p.type, p.name]))) {
    return err('duplicate-name');
  }
  const precinctIds = new Set(precincts.map((precinct) => precinct.id));
  if (Object.keys(place.precincts).some((id) => !precinctIds.has(id))) {
    return err('invalid-precinct');
  }
  return ok();
}
