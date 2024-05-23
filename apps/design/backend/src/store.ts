import { DateWithoutTime, Optional, assert } from '@votingworks/basics';
import { Client as DbClient } from '@votingworks/db';
import {
  Id,
  Iso8601Timestamp,
  Election,
  DEFAULT_SYSTEM_SETTINGS,
  SystemSettings,
  safeParseSystemSettings,
  LanguageCode,
} from '@votingworks/types';
import { join } from 'path';
import { v4 as uuid } from 'uuid';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import {
  BallotLanguageConfig,
  BallotLanguageConfigs,
  BallotStyle,
  Precinct,
  convertToVxfBallotStyle,
} from './types';
import { generateBallotStyles } from './ballot_styles';

export function getTempBallotLanguageConfigsForCert(): BallotLanguageConfigs {
  const translationsEnabled = isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.ENABLE_CLOUD_TRANSLATION_AND_SPEECH_SYNTHESIS
  );
  return translationsEnabled
    ? Object.values(LanguageCode).map(
        (l): BallotLanguageConfig => ({ languages: [l] })
      )
    : [{ languages: [LanguageCode.ENGLISH] }];
}

export interface ElectionRecord {
  id: Id;
  election: Election;
  precincts: Precinct[];
  ballotStyles: BallotStyle[];
  systemSettings: SystemSettings;
  createdAt: Iso8601Timestamp;
  ballotLanguageConfigs: BallotLanguageConfigs;
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
  createdAt: string;
  ballotLanguageConfigs: BallotLanguageConfigs;
}): ElectionRecord {
  const { ballotLanguageConfigs } = row;
  const rawElection = JSON.parse(row.electionData);
  const precincts: Precinct[] = JSON.parse(row.precinctData);
  const ballotStyles = generateBallotStyles({
    ballotLanguageConfigs,
    contests: rawElection.contests,
    electionType: rawElection.type,
    parties: rawElection.parties,
    precincts,
  });
  // Fill in our precinct/ballot style overrides in the VXF election format.
  // This is important for pieces of the code that rely on the VXF election
  // (e.g. rendering ballots)
  const election: Election = {
    ...rawElection,
    date: new DateWithoutTime(rawElection.date),
    precincts: precincts.map((precinct) => ({
      id: precinct.id,
      name: precinct.name,
    })),
    ballotStyles: ballotStyles.map(convertToVxfBallotStyle),
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
    createdAt: convertSqliteTimestampToIso8601(row.createdAt),
    ballotLanguageConfigs,
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
          created_at as createdAt
        from elections
      `) as Array<{
        id: string;
        electionData: string;
        systemSettingsData: string;
        precinctData: string;
        createdAt: string;
      }>
    ).map((row) =>
      hydrateElection({
        ...row,

        // TODO: Write/read these to/from the DB based on user selections:
        ballotLanguageConfigs: getTempBallotLanguageConfigsForCert(),
      })
    );
  }

  getElection(electionId: Id): ElectionRecord {
    const electionRow = this.client.one(
      `
      select
        election_data as electionData,
        system_settings_data as systemSettingsData,
        precinct_data as precinctData,
        created_at as createdAt
      from elections
      where id = ?
      `,
      electionId
    ) as {
      electionData: string;
      systemSettingsData: string;
      precinctData: string;
      createdAt: string;
    };
    assert(electionRow !== undefined);
    return hydrateElection({
      id: electionId,
      ...electionRow,

      // TODO: Write/read these to/from the DB based on user selections:
      ballotLanguageConfigs: getTempBallotLanguageConfigsForCert(),
    });
  }

  createElection(election: Election, precincts: Precinct[]): Id {
    const row = this.client.one(
      `
      insert into elections (
        election_data,
        system_settings_data,
        precinct_data
      )
      values (?, ?, ?)
      returning (id)
      `,
      JSON.stringify(election),
      JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
      JSON.stringify(precincts)
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

  getAudioClipBase64FromCache(key: {
    languageCode: LanguageCode;
    text: string;
  }): Optional<string> {
    const cacheEntry = this.client.one(
      `
      select
        audio_clip_base64 as audioClipBase64
      from speech_synthesis_cache
      where
        language_code = ?
        and source_text = ?
      `,
      key.languageCode,
      key.text
    ) as Optional<{ audioClipBase64: string }>;
    return cacheEntry?.audioClipBase64;
  }

  addSpeechSynthesisCacheEntry(cacheEntry: {
    languageCode: LanguageCode;
    text: string;
    audioClipBase64: string;
  }): void {
    this.client.run(
      `
      insert or replace into speech_synthesis_cache (
        language_code,
        source_text,
        audio_clip_base64
      ) values (?, ?, ?)
      `,
      cacheEntry.languageCode,
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

  requeueInterruptedBackgroundTasks(): void {
    this.client.run(
      `
      update background_tasks
      set started_at = null
      where started_at is not null and completed_at is null
      `
    );
  }
}
