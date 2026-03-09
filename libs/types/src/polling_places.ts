import { throwIllegalValue } from '@votingworks/basics';
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

export function pollingPlaceBallotStyles(
  election: Election,
  place: PollingPlace
): readonly BallotStyle[] {
  const precinctIds = pollingPlacePrecinctIds(election, place);

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

    /* istanbul ignore next - coverage not getting detected here - @preserve */
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
        /* istanbul ignore next - @preserve */
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
export function pollingPlacePrecinctIds(
  election: Election,
  place: PollingPlace
): Set<string> {
  const ids = new Set<string>();
  for (const member of pollingPlaceMembers(election, place)) {
    ids.add(member.precinct.id);
  }

  return ids;
}
