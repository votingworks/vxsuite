import {
  DateWithoutTime,
  type Optional,
  type Result,
  assert,
  assertDefined,
  err,
  ok,
  throwIllegalValue,
  typedAs,
  uniqueDeep,
} from '@votingworks/basics';
import {
  type Id,
  type Iso8601Timestamp,
  type Election,
  type SystemSettings,
  safeParseSystemSettings,
  type ElectionSerializationFormat,
  type BallotLanguageConfigs,
  LanguageCode,
  type ElectionId,
  type BallotLanguageConfig,
  type Precinct,
  type DistrictId,
  hasSplits,
  type District,
  type PrecinctId,
  type Party,
  type Contest,
  type HmpbBallotPaperSize,
  type NhPrecinctSplitOptions,
  type Candidate,
  type CandidateId,
  type PartyId,
  type YesNoContest,
  type CandidateContest,
  type Signature,
  type TtsEdit,
  type TtsEditKey,
  safeParse,
  PhoneticWordsSchema,
  type ContestId,
  type PrecinctSelection,
  type TtsEditEntry,
  type PollsTransitionType,
  type ElectionDefinition,
  type BallotStyle,
  unsafeParse,
  DistrictSchema,
  PartySchema,
  type YesNoOption,
  type PollingPlace,
  type PollingPlaceType,
  pollingPlaceGenerateFromPrecinct,
  type ElectionRegisteredVoterCounts,
  isPrecinctCount,
  isSplitCounts,
  type PrecinctRegisteredVoterCountEntry,
  safeParseElectionAnyVersion,
  type SoftwareVersion,
  type ElectionType,
  straightPartyNotYetImplemented,
  type StraightPartyContest,
  type Tabulation,
} from '@votingworks/types';
import {
  singlePrecinctSelectionFor,
  combineAndDecodeCompressedElectionResults,
} from '@votingworks/utils';
import { randomUUID as uuid } from 'node:crypto';
import type { BaseLogger } from '@votingworks/logging';
import { type BallotTemplateId, generateBallotStyles } from '@votingworks/hmpb';
import pg, { type DatabaseError } from 'pg';
import type {
  ExternalElectionSource,
  ElectionListing,
  ExportQaRun,
  GetExportedElectionError,
  Jurisdiction,
  Organization,
  QuickReportedPollStatus,
  StateCode,
  UpdateQaRunStatusParams,
  User,
  UserType,
  ElectionStatus,
  ElectionInfoUpdate,
} from './types.js';
import { Db } from './db/db.js';
import type { Bindable, Client } from './db/client.js';
import { generateId } from './utils.js';
import { getStateFeaturesConfig } from './features.js';
import { MAX_LIVE_REPORT_ACTIVITY_ITEMS } from './globals.js';
import { CandidateOrderingsMap } from './candidate_orderings.js';

export type TaskName = 'generate_election_package' | 'generate_test_decks';

export interface BackgroundTask {
  id: Id;
  taskName: TaskName;
  payload: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  progress?: BackgroundTaskProgress;
  error?: string;
  interruptedAt?: Date;
}

export interface BackgroundTaskProgress {
  label: string;
  progress: number;
  total: number;
}

const getBackgroundTasksColumns = `
  id,
  task_name as "taskName",
  payload,
  created_at as "createdAt",
  started_at as "startedAt",
  completed_at as "completedAt",
  progress,
  error,
  interrupted_at as "interruptedAt"
`;

interface BackgroundTaskRow {
  id: Id;
  taskName: string;
  payload: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  progress: BackgroundTaskProgress | null;
  error: string | null;
  interruptedAt: string | null;
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
    progress: row.progress ?? undefined,
    error: row.error ?? undefined,
    interruptedAt: row.interruptedAt ? new Date(row.interruptedAt) : undefined,
  };
}

export interface MainExportTaskMetadata {
  task?: BackgroundTask;
  electionPackageUrl?: string;
  officialBallotsUrl?: string;
  sampleBallotsUrl?: string;
  testBallotsUrl?: string;
}

export class BackgroundTaskStore {
  private readonly db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  async getElectionPackage(
    electionId: ElectionId
  ): Promise<MainExportTaskMetadata> {
    const electionPackage = (
      await this.db.withClient((client) =>
        client.query(
          `
            select
              election_package_task_id as "taskId",
              official_ballots_url as "officialBallotsUrl",
              sample_ballots_url as "sampleBallotsUrl",
              test_ballots_url as "testBallotsUrl",
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
      officialBallotsUrl: string | null;
      sampleBallotsUrl: string | null;
      testBallotsUrl: string | null;
    }>;
    return {
      task: electionPackage?.taskId
        ? await this.getBackgroundTask(electionPackage.taskId)
        : undefined,
      electionPackageUrl: electionPackage?.url ?? undefined,
      officialBallotsUrl: electionPackage?.officialBallotsUrl || undefined,
      sampleBallotsUrl: electionPackage?.sampleBallotsUrl || undefined,
      testBallotsUrl: electionPackage?.testBallotsUrl || undefined,
    };
  }

  async createElectionPackageBackgroundTask(p: {
    electionId: ElectionId;
    electionSerializationFormat: ElectionSerializationFormat;
    shouldExportAudio?: boolean;
    shouldExportSampleBallots?: boolean;
    shouldExportTestBallots?: boolean;
    numAuditIdBallots?: number;
  }): Promise<void> {
    await this.db.withClient(async (client) =>
      client.withTransaction(async () => {
        // If a task is already in progress, don't create a new one
        const { task } = await this.getElectionPackage(p.electionId);
        if (task && !task.completedAt) {
          return false;
        }

        const taskId = await this.createBackgroundTask(
          'generate_election_package',
          p
        );
        await client.query(
          `
            update elections
            set
              election_package_task_id = $1,
              election_package_url = $2,
              official_ballots_url = $3,
              sample_ballots_url = $4,
              test_ballots_url = $5
            where id = $6
          `,
          taskId,
          null,
          null,
          null,
          null,
          p.electionId
        );

        return true;
      })
    );
  }

  async setElectionPackageExportInformation(p: {
    electionId: ElectionId;
    electionPackageUrl: string;
    ballotHash: string;
    electionData: string;
    officialBallotsUrl: string;
    sampleBallotsUrl?: string;
    testBallotsUrl?: string;
  }): Promise<void> {
    await this.db.withClient((client) =>
      client.withTransaction(async () => {
        await client.query(
          `
            update elections
            set
              election_package_url = $1,
              last_exported_ballot_hash = $2,
              last_exported_election_data = $3,
              official_ballots_url = $4,
              sample_ballots_url = $5,
              test_ballots_url = $6
            where id = $7
          `,
          p.electionPackageUrl,
          p.ballotHash,
          p.electionData,
          p.officialBallotsUrl,
          p.sampleBallotsUrl,
          p.testBallotsUrl,
          p.electionId
        );

        return true;
      })
    );
  }

  async getOldestQueuedBackgroundTask(): Promise<Optional<BackgroundTask>> {
    const sql = `
      select ${getBackgroundTasksColumns}
      from background_tasks
      where started_at is null
      order by created_at asc limit 1
    `;
    const row = (
      await this.db.withClient(async (client) => await client.query(sql))
    ).rows[0] as Optional<BackgroundTaskRow>;
    return row ? backgroundTaskRowToBackgroundTask(row) : undefined;
  }

  async getBackgroundTask(taskId: Id): Promise<Optional<BackgroundTask>> {
    const sql = `
      select ${getBackgroundTasksColumns}
      from background_tasks
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

  async updateBackgroundTaskProgress(
    taskId: Id,
    progress: BackgroundTaskProgress
  ): Promise<void> {
    await this.db.withClient((client) =>
      client.query(
        `
          update background_tasks
          set progress = $1
          where id = $2
        `,
        JSON.stringify(progress),
        taskId
      )
    );
  }

  /**
   * Marks tasks that have crashed as failed (completed with an error).
   */
  async failCrashedBackgroundTasks(): Promise<Id[]> {
    return this.db.withClient(async (client) => {
      const { rows } = await client.query(
        `
          update background_tasks
          set completed_at = current_timestamp, error = $1
          where started_at is not null and completed_at is null and interrupted_at is null
          returning id
        `,
        'Task crashed and was marked as failed'
      );
      return rows.map(({ id }) => id);
    });
  }

  /**
   * Marks the running background task as gracefully interrupted.
   * Used by the SIGTERM handler to mark the currently running task.
   */
  async markRunningTaskAsGracefullyInterrupted(): Promise<void> {
    await this.db.withClient(async (client) => {
      const { rows } = await client.query(
        `
          update background_tasks
          set interrupted_at = current_timestamp
          where started_at is not null
            and completed_at is null
            and interrupted_at is null
          returning id
        `
      );

      const ids = rows.map(({ id }) => id);
      assert(
        ids.length <= 1,
        `Too many running background tasks! IDs=${ids.join(', ')}`
      );
    });
  }

  async requeueGracefullyInterruptedBackgroundTasks(): Promise<Id[]> {
    return this.db.withClient(async (client) => {
      const result = await client.query(
        `
          update background_tasks
          set started_at = null,
              completed_at = null,
              interrupted_at = null,
              error = null
          where started_at is not null
            and completed_at is null
            and interrupted_at is not null
          returning id
        `
      );

      return result.rows.map(({ id }) => id);
    });
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
