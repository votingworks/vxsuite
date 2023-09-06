import { assert, groupBy } from '@votingworks/basics';
import { Client as DbClient } from '@votingworks/db';
import {
  DEFAULT_LAYOUT_OPTIONS,
  LayoutOptions,
} from '@votingworks/hmpb-layout';
import {
  Id,
  Iso8601Timestamp,
  Election,
  DistrictId,
  PrecinctId,
  BallotStyleId,
  DEFAULT_SYSTEM_SETTINGS,
  SystemSettings,
  safeParseSystemSettings,
} from '@votingworks/types';
import { join } from 'path';

export interface ElectionRecord {
  id: Id;
  election: Election;
  precincts: Precinct[];
  ballotStyles: BallotStyle[];
  systemSettings: SystemSettings;
  layoutOptions: LayoutOptions;
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
  districtIds: readonly DistrictId[];
}
export interface PrecinctWithSplits {
  id: PrecinctId;
  name: string;
  splits: readonly PrecinctSplit[];
}
export interface PrecinctSplit {
  id: Id;
  name: string;
  districtIds: readonly DistrictId[];
}
export type Precinct = PrecinctWithoutSplits | PrecinctWithSplits;

export function hasSplits(precinct: Precinct): precinct is PrecinctWithSplits {
  return 'splits' in precinct && precinct.splits !== undefined;
}

// We also create a new type for a ballot style, that can reference precincts and
// splits. We generate ballot styles on demand, so it won't be stored in the db.
export interface BallotStyle {
  id: BallotStyleId;
  precinctsOrSplits: ReadonlyArray<{
    precinctId: PrecinctId;
    splitId?: Id;
  }>;
  districtIds: readonly DistrictId[];
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
export function generateBallotStyles(precincts: Precinct[]): BallotStyle[] {
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
  systemSettingsData: string;
  layoutOptionsData: string;
  createdAt: string;
}): ElectionRecord {
  const rawElection = JSON.parse(row.electionData);
  const precincts = JSON.parse(row.precinctData);
  const layoutOptions = JSON.parse(row.layoutOptionsData);
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
  };

  const systemSettings = safeParseSystemSettings(
    row.systemSettingsData
  ).unsafeUnwrap();

  return {
    id: String(row.id),
    election,
    precincts,
    ballotStyles,
    systemSettings,
    layoutOptions,
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
          system_settings_data as systemSettingsData,
          precinct_data as precinctData,
          layout_options_data as layoutOptionsData,
          created_at as createdAt
        from elections
      `) as Array<{
        id: string;
        electionData: string;
        systemSettingsData: string;
        precinctData: string;
        layoutOptionsData: string;
        createdAt: string;
      }>
    ).map(hydrateElection);
  }

  getElection(electionId: Id): ElectionRecord {
    const electionRow = this.client.one(
      `
      select
        election_data as electionData,
        system_settings_data as systemSettingsData,
        precinct_data as precinctData,
        layout_options_data as layoutOptionsData,
        created_at as createdAt
      from elections
      where id = ?
      `,
      electionId
    ) as {
      electionData: string;
      systemSettingsData: string;
      precinctData: string;
      layoutOptionsData: string;
      createdAt: string;
    };
    assert(electionRow !== undefined);
    return hydrateElection({ id: electionId, ...electionRow });
  }

  createElection(election: Election, precincts: Precinct[]): Id {
    const row = this.client.one(
      `
      insert into elections (
        election_data,
        system_settings_data,
        precinct_data,
        layout_options_data
      )
      values (?, ?, ?, ?)
      returning (id)
      `,
      JSON.stringify(election),
      JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
      JSON.stringify(precincts),
      JSON.stringify(DEFAULT_LAYOUT_OPTIONS)
    ) as {
      id: string;
    };
    return String(row.id);
  }

  updateElection(electionId: Id, election: Election): void {
    this.client.run(
      `
      update elections
      set election_data = ?
      where id = ?
      `,
      JSON.stringify(election),
      electionId
    );
  }

  updateSystemSettings(electionId: Id, systemSettings: SystemSettings): void {
    this.client.run(
      `
      update elections
      set system_settings_data = ?
      where id = ?
      `,
      JSON.stringify(systemSettings),
      electionId
    );
  }

  updatePrecincts(electionId: Id, precincts: Precinct[]): void {
    this.client.run(
      `
      update elections
      set precinct_data = ?
      where id = ?
      `,
      JSON.stringify(precincts),
      electionId
    );
  }

  updateLayoutOptions(electionId: Id, layoutOptions: LayoutOptions): void {
    this.client.run(
      `
      update elections
      set layout_options_data = ?
      where id = ?
      `,
      JSON.stringify(layoutOptions),
      electionId
    );
  }

  deleteElection(electionId: Id): void {
    this.client.run(
      `
      delete from elections
      where id = ?
      `,
      electionId
    );
  }
}
