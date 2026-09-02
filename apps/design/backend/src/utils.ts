import { assertDefined, throwIllegalValue } from '@votingworks/basics';
import {
  Contest,
  Candidate,
  District,
  Election,
  getPrecinctById,
  hasSplits,
  Party,
  PollingPlace,
  PollingPlacePrecinct,
  pollingPlacesGenerateFromPrecincts,
  Precinct,
  PrecinctId,
  straightPartyNotYetImplemented,
} from '@votingworks/types';
import { customAlphabet } from 'nanoid';
import { Buffer } from 'node:buffer';
import { AnyBallotProps, NhStateBallotVariant } from '@votingworks/hmpb';
import { MAX_POSTGRES_INDEX_KEY_BYTES } from './globals.js';
import { Jurisdiction, User } from './types.js';
import { type StateFeaturesConfig } from './features.js';

export function getBallotPdfFileName(props: AnyBallotProps): string {
  const precinct = assertDefined(getPrecinctById(props));
  const variantSuffixes: Record<NhStateBallotVariant, string> = {
    federalOfficeOnly: 'foo',
    uocava: 'uocava',
  };
  const variantSuffix =
    'variant' in props && props.variant
      ? variantSuffixes[props.variant]
      : undefined;
  const baseName = [
    props.ballotMode,
    props.ballotType,
    'ballot',
    precinct.name.replaceAll(' ', '_'),
    props.ballotStyleId,
    props.ballotAuditId,
    variantSuffix,
  ]
    .filter(Boolean)
    .join('-');
  return `${baseName}.pdf`;
}

const idGenerator = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12);

/**
 * Generates a URL-friendly and double-click-copy-friendly unique ID using a
 * cryptographically secure RNG.
 */
export function generateId(): string {
  return idGenerator();
}

/**
 * Regenerate the IDs of all entities in an election, ensuring that all
 * references are updated.
 */
export function regenerateElectionIds(
  election: Election,
  stateFeatures: StateFeaturesConfig
): {
  districts: District[];
  precincts: Precinct[];
  parties: Party[];
  contests: Contest[];
  pollingPlaces: PollingPlace[];
} {
  const idMap = new Map<string, string>();
  function replaceId<T extends string>(id: T): T {
    if (!idMap.has(id)) {
      idMap.set(id, generateId());
    }
    return assertDefined(idMap.get(id)) as T;
  }

  const districts = election.districts.map((district) => ({
    ...district,
    id: replaceId(district.id),
  }));

  const precincts = election.precincts.map((precinct) => {
    if (hasSplits(precinct)) {
      return {
        ...precinct,
        id: replaceId(precinct.id),
        splits: precinct.splits.map((split) => ({
          ...split,
          id: replaceId(split.id),
          districtIds: split.districtIds.map(replaceId),
        })),
      };
    }
    return {
      ...precinct,
      id: replaceId(precinct.id),
      districtIds: precinct.districtIds.map(replaceId),
    };
  });

  const parties = election.parties.map((party) => ({
    ...party,
    id: replaceId(party.id),
  }));

  const contests = election.contests.map((contest) => ({
    ...contest,
    id: replaceId(contest.id),
    districtId: replaceId(contest.districtId),
    ...(() => {
      // @coverage-exclude
      if (contest.type === 'straight-party') {
        return straightPartyNotYetImplemented();
      }
      switch (contest.type) {
        case 'candidate':
          return {
            partyId: contest.partyId ? replaceId(contest.partyId) : undefined,
            candidates: contest.candidates.map((candidate) => ({
              ...candidate,
              id: replaceId(candidate.id),
              partyIds: candidate.partyIds?.map(replaceId),
            })),
          };
        case 'yesno':
          return {
            options: contest.options.map((option) => ({
              ...option,
              id: replaceId(option.id),
            })) as unknown as typeof contest.options,
          };
        default: {
          throwIllegalValue(contest);
        }
      }
    })(),
  }));

  const pollingPlaces: PollingPlace[] = (() => {
    // Note: For states where editing is not enabled, polling places are
    // generated at export-time (see addPollingPlacesForExport), so leave them
    // empty here.
    if (!stateFeatures.EDIT_POLLING_PLACES) return [];

    if (!election.pollingPlaces?.length) {
      return pollingPlacesGenerateFromPrecincts(
        precincts,
        'election_day',
        generateId
      );
    }

    return election.pollingPlaces.map<PollingPlace>((place) => {
      const oldPrecincts = place.precincts;
      const newPrecincts: Record<PrecinctId, PollingPlacePrecinct> = {};

      for (const [oldPrecinctId, oldPrecinct] of Object.entries(oldPrecincts)) {
        const newPrecinctId = replaceId(oldPrecinctId);
        newPrecincts[newPrecinctId] =
          oldPrecinct.type === 'whole'
            ? { ...oldPrecinct }
            : /* @coverage-defer: not yet supported (asserted at the store level) */ {
                ...oldPrecinct,
                splitIds: oldPrecinct.splitIds.map(replaceId),
              };
      }

      return {
        ...place,
        id: replaceId(place.id),
        precincts: newPrecincts,
      };
    });
  })();

  return {
    districts,
    precincts,
    parties,
    contests,
    pollingPlaces,
  };
}

/**
 * Our translation caches use the text as part of the primary key.
 * Ensure that the text fits within the byte limit for a Postgres primary key.
 */
export function isValidPrimaryKey(text: string): boolean {
  const textSizeInBytes = Buffer.byteLength(text, 'utf8');
  return textSizeInBytes < MAX_POSTGRES_INDEX_KEY_BYTES;
}

export function splitCandidateName(
  name: string
): Pick<Candidate, 'firstName' | 'middleName' | 'lastName'> {
  const [firstPart, ...middleParts] = name.split(' ');
  return {
    firstName: firstPart ?? '',
    lastName: middleParts.pop() ?? '',
    middleName: middleParts.join(' '),
  };
}

export function userBelongsToOrganization(
  user: User,
  organizationId: string
): boolean {
  return user.organization.id === organizationId;
}

export function userCanAccessJurisdiction(
  user: User,
  jurisdiction: Jurisdiction
): boolean {
  switch (user.type) {
    case 'jurisdiction_user':
      return user.jurisdictions.some((j) => j.id === jurisdiction.id);
    case 'organization_user': {
      return user.organization.id === jurisdiction.organization.id;
    }
    case 'support_user':
      return true;
    default: {
      throwIllegalValue(user);
    }
  }
}
