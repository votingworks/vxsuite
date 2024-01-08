import {
  Optional,
  assert,
  find,
  groupBy,
  iter,
  throwIllegalValue,
  unique,
} from '@votingworks/basics';
import { Client as DbClient } from '@votingworks/db';
import {
  DEFAULT_LAYOUT_OPTIONS,
  LayoutOptions,
  NhCustomContent,
  NhCustomContentByBallotStyle,
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
  CandidateContest,
  PartyId,
  LanguageCode,
} from '@votingworks/types';
import { join } from 'path';
import { v4 as uuid } from 'uuid';

export interface ElectionRecord {
  id: Id;
  election: Election;
  precincts: Precinct[];
  ballotStyles: BallotStyle[];
  systemSettings: SystemSettings;
  layoutOptions: LayoutOptions;
  createdAt: Iso8601Timestamp;
  nhCustomContent: NhCustomContentByBallotStyle;
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
  nhCustomContent: NhCustomContent;
}
export type Precinct = PrecinctWithoutSplits | PrecinctWithSplits;

export function hasSplits(precinct: Precinct): precinct is PrecinctWithSplits {
  return 'splits' in precinct && precinct.splits !== undefined;
}

interface PrecinctOrSplitId {
  precinctId: PrecinctId;
  splitId?: Id;
}

// We also create a new type for a ballot style, that can reference precincts and
// splits. We generate ballot styles on demand, so it won't be stored in the db.
export interface BallotStyle {
  id: BallotStyleId;
  precinctsOrSplits: readonly PrecinctOrSplitId[];
  districtIds: readonly DistrictId[];
  partyId?: PartyId;
}

export type TaskName = 'generate_election_package';

export interface BackgroundTask {
  id: Id;
  taskName: TaskName;
  payload: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

const getBackgroundTasksBaseQuery = `
  select
    id,
    task_name as taskName,
    payload,
    created_at as createdAt,
    started_at as startedAt,
    completed_at as completedAt,
    error
  from background_tasks
`;

interface BackgroundTaskRow {
  id: Id;
  taskName: string;
  payload: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
}

function backgroundTaskRowToBackgroundTask(
  row: BackgroundTaskRow
): BackgroundTask {
  return {
    id: row.id,
    taskName: row.taskName as TaskName,
    payload: row.payload,
    createdAt: new Date(row.createdAt),
    startedAt: row.startedAt ? new Date(row.startedAt) : undefined,
    completedAt: row.completedAt ? new Date(row.completedAt) : undefined,
    error: row.error ?? undefined,
  };
}

export interface ElectionPackage {
  task?: BackgroundTask;
  url?: string;
}

/**
 * Generates ballot styles for the election based on geography data (districts,
 * precincts, and precinct splits). For primary elections, generates distinct
 * ballot styles for each party.
 *
 * Each ballot styles should have a unique set of contests. Contests are
 * specified per district. We generate ballot styles by looking at the
 * district list for each precinct/precinct split. If the district list is
 * unique, it gets its own ballot style. Otherwise, we reuse another ballot
 * style with the same district list.
 */
export function generateBallotStyles(
  election: Election,
  precincts: Precinct[]
): BallotStyle[] {
  const allPrecinctsOrSplitsWithDistricts: Array<
    PrecinctOrSplitId & { districtIds: readonly DistrictId[] }
  > = precincts
    .flatMap((precinct) => {
      if (hasSplits(precinct)) {
        return precinct.splits.map((split) => {
          return {
            precinctId: precinct.id,
            splitId: split.id,
            districtIds: split.districtIds,
          };
        });
      }
      return { precinctId: precinct.id, districtIds: precinct.districtIds };
    })
    .filter(({ districtIds }) => districtIds.length > 0);

  const precinctsOrSplitsByDistricts: Array<
    [readonly DistrictId[], PrecinctOrSplitId[]]
  > = groupBy(
    allPrecinctsOrSplitsWithDistricts,
    ({ districtIds }) => districtIds
  ).map(([districtIds, group]) => [
    districtIds,
    // Remove districtIds after grouping, we don't need them anymore
    group.map(({ precinctId, splitId }) => ({ precinctId, splitId })),
  ]);

  switch (election.type) {
    case 'general':
      return precinctsOrSplitsByDistricts.map(
        ([districtIds, precinctsOrSplits], index) => ({
          id: `ballot-style-${index + 1}`,
          precinctsOrSplits,
          districtIds,
        })
      );

    case 'primary':
      return precinctsOrSplitsByDistricts.flatMap(
        ([districtIds, precinctsOrSplits], index) => {
          const partyIds = unique(
            election.contests
              .filter(
                (contest): contest is CandidateContest =>
                  contest.type === 'candidate' &&
                  contest.partyId !== undefined &&
                  districtIds.includes(contest.districtId)
              )
              .map((contest) => contest.partyId)
          );
          const parties = election.parties.filter((party) =>
            partyIds.includes(party.id)
          );
          return parties.map((party) => ({
            id: `ballot-style-${index + 1}-${party.abbrev}`,
            precinctsOrSplits,
            districtIds,
            partyId: party.id,
          }));
        }
      );

    default:
      return throwIllegalValue(election.type);
  }
}

export function assignCustomContentToBallotStyles(
  precincts: Precinct[],
  ballotStyles: BallotStyle[]
): NhCustomContentByBallotStyle {
  return Object.fromEntries(
    ballotStyles.map((ballotStyle) => {
      const splitsWithCustomContent = iter(ballotStyle.precinctsOrSplits)
        .filterMap((precinctOrSplit) => {
          if (precinctOrSplit.splitId) {
            const precinct = find(
              precincts,
              (p) => p.id === precinctOrSplit.precinctId
            );
            assert(hasSplits(precinct));
            const split = find(
              precinct.splits,
              (s) => s.id === precinctOrSplit.splitId
            );
            if (Object.keys(split.nhCustomContent).length > 0) {
              return split;
            }
          }
          return undefined;
        })
        .toArray();
      assert(
        splitsWithCustomContent.length <= 1,
        `Cannot apply NH custom content to multiple precinct splits that have the same ballot style. Splits with same ballot style: ${splitsWithCustomContent
          .map((s) => s.name)
          .join(', ')}`
      );
      return [ballotStyle.id, splitsWithCustomContent[0]?.nhCustomContent];
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
  const precincts: Precinct[] = JSON.parse(row.precinctData);
  const layoutOptions = JSON.parse(row.layoutOptionsData);
  const ballotStyles = generateBallotStyles(rawElection, precincts);
  const nhCustomContent = assignCustomContentToBallotStyles(
    precincts,
    ballotStyles
  );
  // Fill in our precinct/ballot style overrides in the VXF election format.
  // This is important for pieces of the code that rely on the VXF election
  // (e.g. rendering ballots)
  const election: Election = {
    ...rawElection,
    precincts: precincts.map((precinct) => ({
      id: precinct.id,
      name: precinct.name,
    })),
    ballotStyles: ballotStyles.map((ballotStyle) => ({
      id: ballotStyle.id,
      precincts: ballotStyle.precinctsOrSplits.map((p) => p.precinctId),
      districts: ballotStyle.districtIds,
      partyId: ballotStyle.partyId,
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
    nhCustomContent,
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

  /**
   * Builds and returns a new store whose data is kept in memory.
   */
  static memoryStore(): Store {
    return new Store(DbClient.memoryClient(SchemaPath));
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

  getElectionPackage(electionId: Id): ElectionPackage {
    const electionPackage = this.client.one(
      `
      select
        election_package_task_id as taskId,
        election_package_url as url
      from elections
      where id = ?
      `,
      electionId
    ) as Optional<{
      taskId: string | null;
      url: string | null;
    }>;
    return {
      task: electionPackage?.taskId
        ? this.getBackgroundTask(electionPackage.taskId)
        : undefined,
      url: electionPackage?.url ?? undefined,
    };
  }

  createElectionPackageBackgroundTask(electionId: Id): void {
    this.client.transaction(() => {
      // If a task is already in progress, don't create a new one
      const { task } = this.getElectionPackage(electionId);
      if (task && !task.completedAt) {
        return;
      }

      const taskId = this.createBackgroundTask('generate_election_package', {
        electionId,
      });
      this.client.run(
        `
        update elections
        set election_package_task_id = ?
        where id = ?
        `,
        taskId,
        electionId
      );
    });
  }

  setElectionPackageUrl({
    electionId,
    electionPackageUrl,
  }: {
    electionId: Id;
    electionPackageUrl: string;
  }): void {
    this.client.run(
      `
      update elections
      set election_package_url = ?
      where id = ?
      `,
      electionPackageUrl,
      electionId
    );
  }

  //
  // Language and audio management
  //

  getTranslatedTextFromCache(
    text: string,
    targetLanguageCode: LanguageCode
  ): Optional<string> {
    const cacheEntry = this.client.one(
      `
      select
        translated_text as translatedText
      from translation_cache
      where
        source_text = ? and
        target_language_code = ?
      `,
      text,
      targetLanguageCode
    ) as Optional<{ translatedText: string }>;
    return cacheEntry?.translatedText;
  }

  addTranslationCacheEntry(cacheEntry: {
    text: string;
    targetLanguageCode: LanguageCode;
    translatedText: string;
  }): void {
    this.client.run(
      `
      insert or replace into translation_cache (
        source_text,
        target_language_code,
        translated_text
      ) values (?, ?, ?)
      `,
      cacheEntry.text,
      cacheEntry.targetLanguageCode,
      cacheEntry.translatedText
    );
  }

  getAudioClipBase64FromCache(text: string): Optional<string> {
    const cacheEntry = this.client.one(
      `
      select
        audio_clip_base64 as audioClipBase64
      from speech_synthesis_cache
      where
        source_text = ?
      `,
      text
    ) as Optional<{ audioClipBase64: string }>;
    return cacheEntry?.audioClipBase64;
  }

  addSpeechSynthesisCacheEntry(cacheEntry: {
    text: string;
    audioClipBase64: string;
  }): void {
    this.client.run(
      `
      insert or replace into speech_synthesis_cache (
        source_text,
        audio_clip_base64
      ) values (?, ?)
      `,
      cacheEntry.text,
      cacheEntry.audioClipBase64
    );
  }

  //
  // Background task processing
  //

  getOldestQueuedBackgroundTask(): Optional<BackgroundTask> {
    const sql = `${getBackgroundTasksBaseQuery}
      where started_at is null
      order by created_at asc limit 1
    `;
    const row = this.client.one(sql) as Optional<BackgroundTaskRow>;
    return row ? backgroundTaskRowToBackgroundTask(row) : undefined;
  }

  getBackgroundTask(taskId: Id): Optional<BackgroundTask> {
    const sql = `${getBackgroundTasksBaseQuery}
      where id = ?
    `;
    const row = this.client.one(sql, taskId) as Optional<BackgroundTaskRow>;
    return row ? backgroundTaskRowToBackgroundTask(row) : undefined;
  }

  createBackgroundTask(taskName: TaskName, payload: unknown): Id {
    const taskId = uuid();
    this.client.run(
      `
      insert into background_tasks (
        id,
        task_name,
        payload
      ) values (?, ?, ?)
      `,
      taskId,
      taskName,
      JSON.stringify(payload)
    );
    return taskId;
  }

  startBackgroundTask(taskId: Id): void {
    this.client.run(
      `
      update background_tasks
      set started_at = current_timestamp
      where id = ?
      `,
      taskId
    );
  }

  completeBackgroundTask(taskId: Id, error?: string): void {
    this.client.run(
      `
      update background_tasks
      set completed_at = current_timestamp, error = ?
      where id = ?
      `,
      error ?? null,
      taskId
    );
  }
}
