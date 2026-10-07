/* eslint-disable vx/gts-object-literal-types */
import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';
import {
  type Election,
  type Precinct,
  hasSplits,
  straightPartyNotYetImplemented,
} from '@votingworks/types';

interface LegacyYesNoContest {
  yesOption: { id: string };
  noOption: { id: string };
}

// node-pg-migrate loads migrations with require(), which forbids top-level
// await, so up() imports the built helper before regenerateElectionIds (a
// module-scope helper) calls it.
let generateId: () => string;

/**
 * Regenerate the IDs of all entities in an election, ensuring that all
 * references are updated.
 */
function regenerateElectionIds(election: Election, precincts: Precinct[]) {
  const idMap = new Map<string, string>();
  function replaceId(id: string): string {
    const existing = idMap.get(id);
    if (existing) {
      return existing;
    }
    const newId = generateId();
    idMap.set(id, newId);
    return newId;
  }

  const districts = election.districts.map((district) => ({
    ...district,
    id: replaceId(district.id),
  }));
  const updatedPrecincts = precincts.map((precinct) => {
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
        case 'yesno': {
          // Historical backfill: this migration ran when yesno contests used
          // `yesOption`/`noOption` rather than the current `options` array.
          const yesNoContest = contest as unknown as LegacyYesNoContest;
          return {
            yesOption: {
              ...yesNoContest.yesOption,
              id: replaceId(yesNoContest.yesOption.id),
            },
            noOption: {
              ...yesNoContest.noOption,
              id: replaceId(yesNoContest.noOption.id),
            },
          };
        }
        default: {
          throw new Error(`Unknown contest type: ${contest}`);
        }
      }
    })(),
  }));
  return {
    districts,
    precincts: updatedPrecincts,
    parties,
    contests,
  };
}

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  ({ generateId } = await import('../build/utils.js'));
  const allElections = await pgm.db.select({
    text: 'SELECT id, election_data, precinct_data FROM elections',
  });
  const seenIds = new Set<string>();

  function allIds(electionRecord: {
    id: string;
    election: Election;
    precincts: Precinct[];
  }): string[] {
    const { election, precincts } = electionRecord;
    return [
      ...election.districts.map((d) => d.id),
      ...precincts.flatMap((p) => [
        p.id,
        ...(hasSplits(p)
          ? p.splits.flatMap((s) => [s.id, ...s.districtIds])
          : p.districtIds),
      ]),
      ...election.parties.map((p) => p.id),
      ...election.contests.flatMap((c) => {
        if (c.type === 'straight-party') {
          return straightPartyNotYetImplemented();
        }
        return [
          c.id,
          ...(c.type === 'candidate' && c.partyId ? [c.partyId] : []),
          ...(c.type === 'candidate'
            ? c.candidates.flatMap((cand) => [
                cand.id,
                ...(cand.partyIds ?? []),
              ])
            : // Historical backfill: this migration ran when yesno contests
              // used `yesOption`/`noOption` rather than the current `options`
              // array.
              [
                (c as unknown as LegacyYesNoContest).yesOption.id,
                (c as unknown as LegacyYesNoContest).noOption.id,
              ]),
        ];
      }),
    ];
  }

  for (const electionRow of allElections) {
    // eslint-disable-next-line camelcase
    const { id: electionId, election_data, precinct_data } = electionRow;
    const election: Election = JSON.parse(election_data);
    const precincts: Precinct[] = JSON.parse(precinct_data);
    const electionRecord = { id: electionId, election, precincts };

    const electionIds = allIds(electionRecord);
    const shouldRegenerateIds = electionIds.some((id) => seenIds.has(id));
    for (const id of electionIds) {
      seenIds.add(id);
    }
    if (!shouldRegenerateIds) {
      continue;
    }

    const {
      districts,
      precincts: updatedPrecincts,
      parties,
      contests,
    } = regenerateElectionIds(election, precincts);
    const updatedElection = {
      ...election,
      districts,
      parties,
      precincts: updatedPrecincts.map((p) => ({
        id: p.id,
        name: p.name,
      })),
      contests,
    };
    pgm.sql(
      `
      UPDATE elections
      SET election_data = '${JSON.stringify(updatedElection).replaceAll(
        "'",
        "''"
      )}',
          precinct_data = '${JSON.stringify(updatedPrecincts).replaceAll(
            "'",
            "''"
          )}'
      WHERE id = '${electionId}'
      `
    );
  }
}
