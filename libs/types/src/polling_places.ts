import { assertDefined, throwIllegalValue } from '@votingworks/basics';
import {
  BallotStyle,
  Contests,
  Election,
  hasSplits,
  PollingPlace,
  PollingPlaceType,
  Precinct,
  PrecinctOrSplit,
} from './election';

export function anyPollingPlace(election: Election): PollingPlace {
  const err = 'no polling places in election';
  const places = assertDefined(election.pollingPlaces, err);

  return assertDefined(places[0], err);
}

export function pollingPlaceBallotStyles(
  election: Election,
  place: PollingPlace
): readonly BallotStyle[] {
  const precinctIds = pollingPlacePrecinctIds(place);

  return election.ballotStyles.filter((bs) =>
    bs.precincts.some((id) => precinctIds.has(id))
  );
}

export function pollingPlaceContests(
  election: Election,
  place: PollingPlace
): Contests {
  const districts = pollingPlaceDistrictIds(election, place);
  return election.contests.filter((c) => districts.has(c.districtId));
}

function pollingPlaceDistrictIds(
  election: Election,
  place: PollingPlace
): Set<string> {
  const ids = new Set<string>();

  for (const member of pollingPlaceMembers(election, place)) {
    const districts = (member.split ?? member.precinct).districtIds;
    for (const id of districts) ids.add(id);
  }

  return ids;
}

export function pollingPlaceFromElection(
  election: Election,
  id: string
): PollingPlace {
  const places = election.pollingPlaces || [];
  for (const p of places) if (p.id === id) return p;

  throw new Error(`polling place with id ${id} not found`);
}

export function pollingPlaceGenerateFromPrecinct(p: {
  precinct: Precinct;
  type: PollingPlaceType;
  id: string;
}): PollingPlace {
  return {
    id: p.id,
    name: p.precinct.name,
    precincts: { [p.precinct.id]: { type: 'whole' } },
    type: p.type,
  };
}

export function pollingPlacesGenerateFromPrecincts(
  precincts: readonly Precinct[],
  type: PollingPlaceType,
  newId: (precinct: Precinct) => string
): PollingPlace[] {
  return precincts.map((precinct) =>
    pollingPlaceGenerateFromPrecinct({ precinct, type, id: newId(precinct) })
  );
}

export type PollingPlaceGroups = Record<PollingPlaceType, PollingPlace[]>;

export function pollingPlaceGroups(
  places: readonly PollingPlace[]
): PollingPlaceGroups {
  const groups: PollingPlaceGroups = {
    absentee: [],
    early_voting: [],
    election_day: [],
  };

  for (const place of places) {
    switch (place.type) {
      case 'absentee':
        groups.absentee.push(place);
        break;

      case 'early_voting':
        groups.early_voting.push(place);
        break;

      case 'election_day':
        groups.election_day.push(place);
        break;

      default:
        /* istanbul ignore next */
        throwIllegalValue(place.type);
    }
  }

  return groups;
}

/**
 * All precincts and/or splits in the given election covered by the given
 * polling place.
 */
export function pollingPlaceMembers(
  election: Election,
  place: PollingPlace
): PrecinctOrSplit[] {
  const list: PrecinctOrSplit[] = [];

  for (const precinct of election.precincts) {
    const member = place.precincts[precinct.id];
    if (!member) continue;

    if (!hasSplits(precinct)) {
      list.push({ precinct });
      continue;
    }

    /* istanbul ignore next - coverage not getting detected here */
    switch (member.type) {
      case 'partial': {
        for (const split of precinct.splits) {
          if (member.splitIds.includes(split.id)) {
            list.push({ precinct, split });
          }
        }

        break;
      }

      case 'whole': {
        for (const split of precinct.splits) list.push({ precinct, split });
        break;
      }

      default: {
        /* istanbul ignore next */
        throwIllegalValue(member, 'type');
      }
    }
  }

  return list;
}

/**
 * The set of IDs for all precincts fully or partially covered by the given
 * polling place.
 */
export function pollingPlacePrecinctIds(place: PollingPlace): Set<string> {
  return new Set(Object.keys(place.precincts));
}

/**
 * The id and name of the default "Central Scanning" absentee polling place.
 * The id is derived deterministically from the election id (so the ballot hash
 * stays stable across exports) while remaining globally unique across
 * elections, matching the convention used for other election entity ids.
 */
export function centralScanningPollingPlaceId(electionId: string): string {
  return `${electionId}-central-scanning`;
}
export const CENTRAL_SCANNING_POLLING_PLACE_NAME = 'Central Scanning';

/**
 * Returns the precincts not covered by any absentee polling place, i.e.
 * precincts whose centrally-scanned ballots would have no location to be
 * tabulated under.
 */
export function getPrecinctsWithoutAbsenteePollingPlace(
  precincts: readonly Precinct[],
  pollingPlaces: readonly PollingPlace[] = []
): Precinct[] {
  const coveredPrecinctIds = new Set(
    pollingPlaces
      .filter((place) => place.type === 'absentee')
      .flatMap((place) => [...pollingPlacePrecinctIds(place)])
  );
  return precincts.filter((precinct) => !coveredPrecinctIds.has(precinct.id));
}

export function pollingPlaceTypeName(type: PollingPlaceType): string {
  switch (type) {
    case 'absentee':
      return 'Absentee Voting';

    case 'early_voting':
      return 'Early Voting';

    case 'election_day':
      return 'Election Day';

    default:
      /* istanbul ignore next */
      throwIllegalValue(type);
  }
}
