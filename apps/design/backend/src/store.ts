import { Client as DbClient } from '@votingworks/db';
import {
  Id,
  Iso8601Timestamp,
  Election,
  DistrictId,
  PrecinctId,
  BallotStyleId,
  ElectionDefinition,
} from '@votingworks/types';
import deepEqual from 'deep-eql';
import { join } from 'path';
import { sha256 } from 'js-sha256';

export interface ElectionRecord {
  id: Id;
  electionDefinition: ElectionDefinition;
  precincts: Precinct[];
  ballotStyles: BallotStyle[];
  createdAt: Iso8601Timestamp;
}

// We create new types for precincts that can be split, since the existing
// election types don't support this. We will likely want to extend the existing
// types to support it in the future, but doing it separately for now allows us
// to experiment and learn more first. We'll store these separately in the
// database and ignore Election.precincts most of the app.
export interface PrecinctWithoutSplits {
  id: PrecinctId;
  name: string;
  districtIds: DistrictId[];
}
export interface PrecinctWithSplits {
  id: PrecinctId;
  name: string;
  splits: PrecinctSplit[];
}
export interface PrecinctSplit {
  id: Id;
  name: string;
  districtIds: DistrictId[];
}
export type Precinct = PrecinctWithoutSplits | PrecinctWithSplits;

export function hasSplits(precinct: Precinct): precinct is PrecinctWithSplits {
  return 'splits' in precinct && precinct.splits !== undefined;
}

// We also create a new type for a ballot style, that can reference precincts and
// splits. We generate ballot styles on demand, so it won't be stored in the db.
export interface BallotStyle {
  id: BallotStyleId;
  precinctsOrSplits: Array<{
    precinctId: PrecinctId;
    splitId?: Id;
  }>;
  districtIds: DistrictId[];
}

// If we are importing an existing VXF election, we need to convert the
// precincts to have splits based on the ballot styles.
function convertVxfPrecincts(election: Election) {
  return election.precincts.map((precinct) => {
    const ballotStyles = election.ballotStyles.filter((ballotStyle) =>
      ballotStyle.precincts.includes(precinct.id)
    );
    if (ballotStyles.length === 1) {
      return {
        ...precinct,
        districtIds: ballotStyles[0].districts,
      };
    }
    return {
      ...precinct,
      splits: ballotStyles.map((ballotStyle, index) => ({
        id: `${precinct.id}-split-${index + 1}`,
        name: `${precinct.name} - Split ${index + 1}`,
        districtIds: ballotStyle.districts,
      })),
    };
  });
}

/**
 * Groups items by a key function. Uses deepEqual to compare keys in order to support
 * complex key types. For simpler key types, a Map would suffice.
 */
function groupBy<T, K>(items: T[], keyFn: (item: T) => K): Array<[K, T[]]> {
  const groups: Array<[K, T[]]> = [];
  for (const item of items) {
    const key = keyFn(item);
    const group = groups.find(([k]) => deepEqual(k, key));
    if (group) {
      group[1].push(item);
    } else {
      groups.push([key, [item]]);
    }
  }
  return groups;
}

/**
 * Generates ballot styles for the election based on geography data (districts,
 * precincts, and precinct splits).
 *
 * Each ballot styles should have a unique set of contests. Contests are
 * specified per district. We generate ballot styles by looking at the
 * district list for each precinct/precinct split. If the district list is
 * unique, it gets its own ballot style. Otherwise, we reuse another ballot
 * style with the same district list.
 */
function generateBallotStyles(precincts: Precinct[]): BallotStyle[] {
  const allPrecinctsOrSplits = precincts.flatMap((precinct) => {
    if (hasSplits(precinct)) {
      return precinct.splits.map((split) => {
        return {
          precinctId: precinct.id,
          splitId: split.id,
          districtIds: split.districtIds,
        };
      });
    }
    return [{ precinctId: precinct.id, districtIds: precinct.districtIds }];
  });
  const precinctsOrSplitsByDistricts = groupBy(
    allPrecinctsOrSplits,
    (precinctOrSplit) => precinctOrSplit.districtIds
  );
  return precinctsOrSplitsByDistricts.map(
    ([districtIds, precinctsOrSplits], index) => ({
      id: `ballot-style-${index + 1}`,
      precinctsOrSplits,
      districtIds,
      // TODO for primary elections, ballot styles need to have a partyId association
    })
  );
}

function convertSqliteTimestampToIso8601(
  sqliteTimestamp: string
): Iso8601Timestamp {
  return new Date(sqliteTimestamp).toISOString();
}

function hydrateElection(row: {
  id: string;
  electionData: string;
  precinctData: string;
  createdAt: string;
}): ElectionRecord {
  const rawElection = JSON.parse(row.electionData);
  const precincts = JSON.parse(row.precinctData);
  const ballotStyles = generateBallotStyles(precincts);
  // Fill in our precinct/ballot style overrides in the VXF election format.
  // This is important for pieces of the code that rely on the VXF election
  // (e.g. rendering ballots)
  const election: Election = {
    ...rawElection,
    precincts,
    ballotStyles: ballotStyles.map((ballotStyle) => ({
      ...ballotStyle,
      precincts: ballotStyle.precinctsOrSplits.map((p) => p.precinctId),
      districts: ballotStyle.districtIds,
    })),
    sealUrl:
      rawElection.sealUrl ?? '/seals/state-of-hamilton-official-seal.svg',
  };

  const electionData = JSON.stringify(election);

  const electionDefinition: ElectionDefinition = {
    election,
    electionData,
    electionHash: sha256(electionData),
  };

  return {
    id: row.id,
    electionDefinition,
    precincts,
    ballotStyles,
    createdAt: convertSqliteTimestampToIso8601(row.createdAt),
  };
}

const SchemaPath = join(__dirname, '../schema.sql');

export class Store {
  private constructor(private readonly client: DbClient) {}

  getDbPath(): string {
    return this.client.getDatabasePath();
  }

  /**
   * Builds and returns a new store at `dbPath`.
   */
  static fileStore(dbPath: string): Store {
    return new Store(DbClient.fileClient(dbPath, SchemaPath));
  }

  listElections(): ElectionRecord[] {
    return (
      this.client.all(`
        select
          id,
          election_data as electionData,
          precinct_data as precinctData,
          created_at as createdAt
        from elections
      `) as Array<{
        id: string;
        electionData: string;
        precinctData: string;
        createdAt: string;
      }>
    ).map(hydrateElection);
  }

  getElection(id: Id): ElectionRecord {
    const electionRow = this.client.one(
      `
      select
        election_data as electionData,
        precinct_data as precinctData,
        created_at as createdAt
      from elections
      where id = ?
      `,
      id
    ) as { electionData: string; precinctData: string; createdAt: string };
    return hydrateElection({ id, ...electionRow });
  }

  createElection(election: Election): Id {
    const row = this.client.one(
      `
      insert into elections (election_data, precinct_data)
      values (?, ?)
      returning (id)
      `,
      JSON.stringify(election),
      JSON.stringify(convertVxfPrecincts(election))
    ) as {
      id: string;
    };
    return row.id;
  }

  updateElection(id: Id, election: Election): void {
    this.client.run(
      `
      update elections
      set election_data = ?
      where id = ?
      `,
      JSON.stringify(election),
      id
    );
  }

  updatePrecincts(id: Id, precincts: Precinct[]): void {
    this.client.run(
      `
      update elections
      set precinct_data = ?
      where id = ?
      `,
      JSON.stringify(precincts),
      id
    );
  }

  deleteElection(id: Id): void {
    this.client.run(
      `
      delete from elections
      where id = ?
      `,
      id
    );
  }
}
