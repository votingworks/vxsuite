import { assertDefined, throwIllegalValue } from '@votingworks/basics';
import {
  type Contest,
  type Candidate,
  type District,
  type Election,
  hasSplits,
  type Party,
  type PollingPlace,
  type PollingPlacePrecinct,
  pollingPlacesGenerateFromPrecincts,
  type Precinct,
  type PrecinctId,
  straightPartyNotYetImplemented,
} from '@votingworks/types';
import { generateId } from '@votingworks/utils';
import type { StateFeaturesConfig } from './state_features.js';

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

export function splitCandidateName(
  name: string
): Pick<Candidate, 'firstName' | 'middleName' | 'lastName'> {
  const [firstPart, ...middleParts] = name.split(' ');
  return {
    // @coverage-defer
    firstName: firstPart ?? '',
    lastName: middleParts.pop() ?? '',
    middleName: middleParts.join(' '),
  };
}

/**
 * Splits candidate names into first, middle, and last names, if they are not
 * already split.
 */
export function splitCandidateNames(contests: readonly Contest[]): Contest[] {
  return contests.map((contest) => {
    if (contest.type !== 'candidate') return contest;
    return {
      ...contest,
      candidates: contest.candidates.map((candidate) => {
        if (
          candidate.firstName !== undefined &&
          candidate.middleName !== undefined &&
          candidate.lastName !== undefined
        ) {
          return candidate;
        }
        return {
          ...candidate,
          ...splitCandidateName(candidate.name),
        };
      }),
    };
  });
}

/**
 * Prepares an existing election for editing as a new election: regenerates
 * entity IDs, splits candidate names and drops ballot styles so they are
 * generated again.
 */
export function prepareElectionForEditing({
  election,
  newId,
  stateFeatures,
}: {
  election: Election;
  newId: Election['id'];
  stateFeatures: StateFeaturesConfig;
}): Election {
  const { districts, precincts, parties, contests, pollingPlaces } =
    regenerateElectionIds(election, stateFeatures);

  const contestsWithSplitCandidateNames = splitCandidateNames(contests);

  return {
    ...election,
    id: newId,
    jurisdiction: {
      ...election.jurisdiction,
      // County ID needs to be deterministic
      id: `${newId}-county`,
    },
    districts,
    pollingPlaces,
    precincts,
    parties,
    contests: contestsWithSplitCandidateNames,
    // Remove any existing ballot styles (and their ballot
    // positions) so we can generate our own
    ballotStyles: [],
    // Fill in a blank seal if none is provided
    seal: election.seal ?? '',
    signature: election.signature,
  };
}
