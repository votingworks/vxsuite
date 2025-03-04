import { DateWithoutTime, Optional, assert } from '@votingworks/basics';
import {
  Id,
  Iso8601Timestamp,
  Election,
  DEFAULT_SYSTEM_SETTINGS,
  SystemSettings,
  safeParseSystemSettings,
  ElectionSerializationFormat,
  BallotLanguageConfigs,
  LanguageCode,
  safeParseJson,
  ElectionId,
  BallotLanguageConfig,
  SplittablePrecinct,
} from '@votingworks/types';
import { v4 as uuid } from 'uuid';
import { BaseLogger } from '@votingworks/logging';
import { BallotTemplateId } from '@votingworks/hmpb';
import {
  BallotOrderInfo,
  BallotOrderInfoSchema,
  BallotStyle,
  convertToVxfBallotStyle,
} from './types';
import { generateBallotStyles } from './ballot_styles';
import { Db } from './db/db';
import { Bindable } from './db/client';

export interface ElectionRecord {
  orgId: string;
  election: Election;
  precincts: SplittablePrecinct[];
  ballotStyles: BallotStyle[];
  systemSettings: SystemSettings;
  ballotOrderInfo: BallotOrderInfo;
  createdAt: Iso8601Timestamp;
  ballotLanguageConfigs: BallotLanguageConfigs;
  ballotTemplateId: BallotTemplateId;
  ballotsFinalizedAt: Date | null;
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
    task_name as "taskName",
    payload,
    created_at as "createdAt",
    started_at as "startedAt",
    completed_at as "completedAt",
    error
  from background_tasks
`;

const DEFAULT_LANGUAGE_CODES = [LanguageCode.ENGLISH];

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

function hydrateElection(row: {
  id: string;
  electionData: string;
  precinctData: string;
  systemSettingsData: string;
  ballotOrderInfoData: string;
  createdAt: Date;
  ballotTemplateId: BallotTemplateId;
  ballotsFinalizedAt: Date | null;
  orgId: string;
  ballotLanguageCodes: LanguageCode[];
}): ElectionRecord {
  const ballotLanguageConfigs = row.ballotLanguageCodes.map(
    (l): BallotLanguageConfig => ({ languages: [l] })
  );
  const rawElection = JSON.parse(row.electionData);
  const precincts: SplittablePrecinct[] = JSON.parse(row.precinctData);
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

  const ballotOrderInfo = safeParseJson(
    row.ballotOrderInfoData,
    BallotOrderInfoSchema
  ).unsafeUnwrap();

  return {
    election,
    precincts,
    ballotStyles,
    systemSettings,
    ballotOrderInfo,
    ballotTemplateId: row.ballotTemplateId,
    createdAt: row.createdAt.toISOString(),
    ballotLanguageConfigs,
    ballotsFinalizedAt: row.ballotsFinalizedAt,
    orgId: row.orgId,
  };
}

export class Store {
  constructor(private readonly db: Db) {}

  static new(logger: BaseLogger): Store {
    return new Store(new Db(logger));
  }

  async listElections(input: { orgId?: string }): Promise<ElectionRecord[]> {
    let whereClause = '';
    const params: Bindable[] = [];

    if (input.orgId) {
      whereClause = 'where org_id = $1';
      params.push(input.orgId);
    }

    return (
      await this.db.withClient(
        async (client) =>
          (
            await client.query(
              `
              select
                id,
                org_id as "orgId",
                election_data as "electionData",
                system_settings_data as "systemSettingsData",
                ballot_order_info_data as "ballotOrderInfoData",
                precinct_data as "precinctData",
                ballot_template_id as "ballotTemplateId",
                ballots_finalized_at as "ballotsFinalizedAt",
                created_at as "createdAt",
                ballot_language_codes as "ballotLanguageCodes"
              from elections
              ${whereClause}
              order by created_at desc
            `,
              ...params
            )
          ).rows as Array<{
            id: string;
            orgId: string;
            electionData: string;
            systemSettingsData: string;
            ballotOrderInfoData: string;
            precinctData: string;
            ballotTemplateId: BallotTemplateId;
            ballotsFinalizedAt: Date | null;
            createdAt: Date;
            ballotLanguageCodes: LanguageCode[];
          }>
      )
    ).map((row) =>
      hydrateElection({
        ...row,
      })
    );
  }

  async getElection(electionId: ElectionId): Promise<ElectionRecord> {
    const electionRow = (
      await this.db.withClient((client) =>
        client.query(
          `
            select
              org_id as "orgId",
              election_data as "electionData",
              system_settings_data as "systemSettingsData",
              ballot_order_info_data as "ballotOrderInfoData",
              precinct_data as "precinctData",
              ballot_template_id as "ballotTemplateId",
              ballots_finalized_at as "ballotsFinalizedAt",
              created_at as "createdAt",
              ballot_language_codes as "ballotLanguageCodes"
            from elections
            where id = $1
          `,
          electionId
        )
      )
    ).rows[0] as {
      orgId: string;
      electionData: string;
      systemSettingsData: string;
      ballotOrderInfoData: string;
      precinctData: string;
      ballotTemplateId: BallotTemplateId;
      ballotsFinalizedAt: Date | null;
      createdAt: Date;
      ballotLanguageCodes: LanguageCode[];
    };
    assert(electionRow !== undefined);
    return hydrateElection({
      id: electionId,
      ...electionRow,
    });
  }

  async createElection(
    orgId: string,
    election: Election,
    precincts: SplittablePrecinct[],
    ballotTemplateId: BallotTemplateId,
    systemSettings = DEFAULT_SYSTEM_SETTINGS
  ): Promise<void> {
    await this.db.withClient((client) =>
      client.query(
        `
          insert into elections (
            id,
            org_id,
            election_data,
            system_settings_data,
            ballot_order_info_data,
            precinct_data,
            ballot_template_id,
            ballot_language_codes
          )
          values ($1, $2, $3, $4, $5, $6, $7, string_to_array($8, ','))
        `,
        election.id,
        orgId,
        JSON.stringify(election),
        JSON.stringify(systemSettings),
        JSON.stringify({}),
        JSON.stringify(precincts),
        ballotTemplateId,
        DEFAULT_LANGUAGE_CODES.join(',')
      )
    );
  }

  async updateElection(
    electionId: ElectionId,
    election: Election
  ): Promise<void> {
    await this.db.withClient((client) =>
      client.query(
        `
          update elections
          set election_data = $1
          where id = $2
        `,
        JSON.stringify(election),
        electionId
      )
    );
  }

  async updateSystemSettings(
    electionId: ElectionId,
    systemSettings: SystemSettings
  ): Promise<void> {
    await this.db.withClient((client) =>
      client.query(
        `
          update elections
          set system_settings_data = $1
          where id = $2
        `,
        JSON.stringify(systemSettings),
        electionId
      )
    );
  }

  async updateBallotOrderInfo(
    electionId: ElectionId,
    ballotOrderInfo: BallotOrderInfo
  ): Promise<void> {
    await this.db.withClient((client) =>
      client.query(
        `
          update elections
          set ballot_order_info_data = $1
          where id = $2
        `,
        JSON.stringify(ballotOrderInfo),
        electionId
      )
    );
  }

  async updatePrecincts(
    electionId: ElectionId,
    precincts: SplittablePrecinct[]
  ): Promise<void> {
    await this.db.withClient((client) =>
      client.query(
        `
          update elections
          set precinct_data = $1
          where id = $2
        `,
        JSON.stringify(precincts),
        electionId
      )
    );
  }

  async updateBallotLanguageCodes(
    electionId: ElectionId,
    ballotLanguageCodes: LanguageCode[]
  ): Promise<void> {
    await this.db.withClient((client) =>
      client.query(
        `
          update elections
          set ballot_language_codes = string_to_array($1, ',')
          where id = $2
        `,
        ballotLanguageCodes.join(','),
        electionId
      )
    );
  }

  async deleteElection(electionId: ElectionId): Promise<void> {
    await this.db.withClient((client) =>
      client.query(`delete from elections where id = $1`, electionId)
    );
  }

  async getElectionPackage(electionId: ElectionId): Promise<ElectionPackage> {
    const electionPackage = (
      await this.db.withClient((client) =>
        client.query(
          `
            select
              election_package_task_id as "taskId",
              election_package_url as "url"
            from elections
            where id = $1
          `,
          electionId
        )
      )
    ).rows[0] as Optional<{
      taskId: string | null;
      url: string | null;
    }>;
    return {
      task: electionPackage?.taskId
        ? await this.getBackgroundTask(electionPackage.taskId)
        : undefined,
      url: electionPackage?.url ?? undefined,
    };
  }

  async createElectionPackageBackgroundTask(
    electionId: ElectionId,
    electionSerializationFormat: ElectionSerializationFormat
  ): Promise<void> {
    await this.db.withClient(async (client) =>
      client.withTransaction(async () => {
        // If a task is already in progress, don't create a new one
        const { task } = await this.getElectionPackage(electionId);
        if (task && !task.completedAt) {
          return false;
        }

        const taskId = await this.createBackgroundTask(
          'generate_election_package',
          {
            electionId,
            electionSerializationFormat,
          }
        );
        await client.query(
          `
            update elections
            set election_package_task_id = $1
            where id = $2
          `,
          taskId,
          electionId
        );

        return true;
      })
    );
  }

  async setElectionPackageUrl({
    electionId,
    electionPackageUrl,
  }: {
    electionId: ElectionId;
    electionPackageUrl: string;
  }): Promise<void> {
    await this.db.withClient((client) =>
      client.query(
        `
          update elections
          set election_package_url = $1
          where id = $2
        `,
        electionPackageUrl,
        electionId
      )
    );
  }

  async getBallotsFinalizedAt(electionId: ElectionId): Promise<Date | null> {
    const { ballots_finalized_at: ballotsFinalizedAt } = (
      await this.db.withClient((client) =>
        client.query(
          `
          select ballots_finalized_at
          from elections
          where id = $1
        `,
          electionId
        )
      )
    ).rows[0];
    return ballotsFinalizedAt;
  }

  async setBallotsFinalizedAt({
    electionId,
    finalizedAt,
  }: {
    electionId: ElectionId;
    finalizedAt: Date | null;
  }): Promise<void> {
    await this.db.withClient((client) =>
      client.query(
        `
          update elections
          set ballots_finalized_at = $1
          where id = $2
        `,
        finalizedAt ? finalizedAt.toISOString() : null,
        electionId
      )
    );
  }

  async setBallotTemplate(
    electionId: ElectionId,
    ballotTemplateId: BallotTemplateId
  ): Promise<void> {
    await this.db.withClient((client) =>
      client.query(
        `
          update elections
          set ballot_template_id = $1
          where id = $2
        `,
        ballotTemplateId,
        electionId
      )
    );
  }

  //
  // Language and audio management
  //

  async getTranslatedTextFromCache(
    text: string,
    targetLanguageCode: LanguageCode
  ): Promise<Optional<string>> {
    const cacheEntry = (
      await this.db.withClient((client) =>
        client.query(
          `
            select
              translated_text as "translatedText"
            from translation_cache
            where
              source_text = $1 and
              target_language_code = $2
          `,
          text,
          targetLanguageCode
        )
      )
    ).rows[0] as Optional<{ translatedText: string }>;
    return cacheEntry?.translatedText;
  }

  async addTranslationCacheEntry(cacheEntry: {
    text: string;
    targetLanguageCode: LanguageCode;
    translatedText: string;
  }): Promise<void> {
    await this.db.withClient((client) =>
      client.query(
        `
          insert into translation_cache (
            source_text,
            target_language_code,
            translated_text
          ) values ($1, $2, $3)
          on conflict
            (target_language_code, source_text)
          do update set
            translated_text = excluded.translated_text
        `,
        cacheEntry.text,
        cacheEntry.targetLanguageCode,
        cacheEntry.translatedText
      )
    );
  }

  async getAudioClipBase64FromCache(key: {
    languageCode: LanguageCode;
    text: string;
  }): Promise<Optional<string>> {
    const cacheEntry = (
      await this.db.withClient((client) =>
        client.query(
          `
            select
              audio_clip_base64 as "audioClipBase64"
            from speech_synthesis_cache
            where
              language_code = $1
              and source_text = $2
          `,
          key.languageCode,
          key.text
        )
      )
    ).rows[0] as Optional<{ audioClipBase64: string }>;
    return cacheEntry?.audioClipBase64;
  }

  async addSpeechSynthesisCacheEntry(cacheEntry: {
    languageCode: LanguageCode;
    text: string;
    audioClipBase64: string;
  }): Promise<void> {
    await this.db.withClient((client) =>
      client.query(
        `
          insert into speech_synthesis_cache (
            language_code,
            source_text,
            audio_clip_base64
          ) values ($1, $2, $3)
          on conflict
            (language_code, source_text)
          do update set
            audio_clip_base64 = excluded.audio_clip_base64
        `,
        cacheEntry.languageCode,
        cacheEntry.text,
        cacheEntry.audioClipBase64
      )
    );
  }

  //
  // Background task processing
  //

  async getOldestQueuedBackgroundTask(): Promise<Optional<BackgroundTask>> {
    const sql = `${getBackgroundTasksBaseQuery}
      where started_at is null
      order by created_at asc limit 1
    `;
    const row = (
      await this.db.withClient(async (client) => await client.query(sql))
    ).rows[0] as Optional<BackgroundTaskRow>;
    return row ? backgroundTaskRowToBackgroundTask(row) : undefined;
  }

  async getBackgroundTask(taskId: Id): Promise<Optional<BackgroundTask>> {
    const sql = `${getBackgroundTasksBaseQuery}
      where id = $1
    `;
    const row = (
      await this.db.withClient(
        async (client) => await client.query(sql, taskId)
      )
    ).rows[0] as Optional<BackgroundTaskRow>;
    return row ? backgroundTaskRowToBackgroundTask(row) : undefined;
  }

  async createBackgroundTask(
    taskName: TaskName,
    payload: unknown
  ): Promise<Id> {
    const taskId = uuid();
    await this.db.withClient((client) =>
      client.query(
        `
          insert into background_tasks (
            id,
            task_name,
            payload
          ) values ($1, $2, $3)
        `,
        taskId,
        taskName,
        JSON.stringify(payload)
      )
    );
    return taskId;
  }

  async startBackgroundTask(taskId: Id): Promise<void> {
    await this.db.withClient((client) =>
      client.query(
        `
          update background_tasks
          set started_at = current_timestamp
          where id = $1
        `,
        taskId
      )
    );
  }

  async completeBackgroundTask(taskId: Id, error?: string): Promise<void> {
    await this.db.withClient((client) =>
      client.query(
        `
          update background_tasks
          set completed_at = current_timestamp, error = $1
          where id = $2
        `,
        error ?? null,
        taskId
      )
    );
  }

  async requeueInterruptedBackgroundTasks(): Promise<void> {
    await this.db.withClient(async (client) =>
      client.query(`
        update background_tasks
        set started_at = null
        where started_at is not null and completed_at is null
      `)
    );
  }
}
