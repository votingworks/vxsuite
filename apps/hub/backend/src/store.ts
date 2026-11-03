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
} from '@votingworks/design-backend';
import { Db } from '@votingworks/design-store-pg';
import type { Bindable, Client } from '@votingworks/design-store-pg';
import { generateId } from '@votingworks/design-backend';
import { MAX_LIVE_REPORT_ACTIVITY_ITEMS } from '@votingworks/design-backend';
import { CandidateOrderingsMap } from '@votingworks/design-backend';
import { getStateFeaturesConfig } from '@votingworks/design-backend';
import {
  type BackgroundTask,
  BackgroundTaskStore,
  ElectionStore,
} from '@votingworks/design-store-pg';

export interface TestDecksTaskMetadata {
  task?: BackgroundTask;
  url?: string;
}

const selectJurisdictionsBaseQuery = `
  select
    jurisdictions.id,
    jurisdictions.name,
    state_code as "stateCode",
    software_version as "softwareVersion",
    organizations.id as "organizationId",
    organizations.name as "organizationName"
  from jurisdictions
  join organizations on jurisdictions.organization_id = organizations.id
`;

interface JurisdictionRow {
  id: string;
  name: string;
  stateCode: StateCode;
  softwareVersion: SoftwareVersion;
  organizationId: string;
  organizationName: string;
}

function rowToJurisdiction(row: JurisdictionRow): Jurisdiction {
  return {
    id: row.id,
    name: row.name,
    stateCode: row.stateCode,
    softwareVersion: row.softwareVersion,
    organization: {
      id: row.organizationId,
      name: row.organizationName,
    },
  };
}

export class Store {
  private readonly db: Db;
  readonly elections: ElectionStore;
  readonly tasks: BackgroundTaskStore;

  constructor(db: Db) {
    this.db = db;
    this.elections = new ElectionStore(db, {
      getStateFeatures: async (electionId) =>
        getStateFeaturesConfig(await this.getElectionJurisdiction(electionId)),
    });
    this.tasks = new BackgroundTaskStore(db);
  }

  async listElections(input: {
    jurisdictionIds?: string[];
  }): Promise<ElectionListing[]> {
    const elections = await this.elections.listElections(input);
    const jurisdictionNames = new Map(
      (await this.listJurisdictions()).map((j) => [j.id, j.name])
    );
    return elections.map((election) => ({
      ...election,
      jurisdictionName: jurisdictionNames.get(election.jurisdictionId) ?? '',
    }));
  }

  // @coverage-exclude
  static new(logger: BaseLogger, connectionString?: string): Store {
    return new Store(new Db(logger, { connectionString }));
  }

  async listOrganizations(): Promise<Organization[]> {
    return await this.db.withClient(
      async (client) =>
        (
          await client.query(
            `
            select id, name
            from organizations
            `
          )
        ).rows
    );
  }

  async getOrganization(organizationId: string): Promise<Organization> {
    return this.db.withClient(async (client) =>
      assertDefined(
        (
          await client.query(
            `
            select id, name
            from organizations
            where id = $1
            `,
            organizationId
          )
        ).rows[0],
        'Organization not found'
      )
    );
  }

  async createOrganization(organization: Organization): Promise<void> {
    await this.db.withClient(async (client) => {
      await client.query(
        `
        insert into organizations (id, name)
        values ($1, $2)
        `,
        organization.id,
        organization.name
      );
    });
  }

  async listJurisdictions(input?: {
    organizationId: string;
  }): Promise<Jurisdiction[]> {
    return await this.db.withClient(async (client) => {
      const [whereClause, params] = input?.organizationId
        ? ['where jurisdictions.organization_id = $1', [input.organizationId]]
        : ['', []];
      const rows = (
        await client.query(
          `
          ${selectJurisdictionsBaseQuery}
          ${whereClause}
          order by jurisdictions.name
          `,
          ...params
        )
      ).rows as JurisdictionRow[];
      return rows.map(rowToJurisdiction);
    });
  }

  async createJurisdiction(jurisdiction: Jurisdiction): Promise<void> {
    await this.db.withClient(async (client) => {
      await client.query(
        `
        insert into jurisdictions (id, name, state_code, software_version, organization_id)
        values ($1, $2, $3, $4, $5)
        `,
        jurisdiction.id,
        jurisdiction.name,
        jurisdiction.stateCode,
        jurisdiction.softwareVersion,
        jurisdiction.organization.id
      );
    });
  }

  async updateJurisdictionStateCode(
    jurisdictionId: string,
    stateCode: StateCode
  ): Promise<void> {
    await this.db.withClient(async (client) => {
      await client.query(
        `
        update jurisdictions set state_code = $1 where id = $2
        `,
        stateCode,
        jurisdictionId
      );
    });
  }

  async getJurisdiction(jurisdictionId: string): Promise<Jurisdiction> {
    return this.db.withClient(async (client) => {
      const row = (
        await client.query(
          `
          ${selectJurisdictionsBaseQuery}
          where jurisdictions.id = $1
          `,
          jurisdictionId
        )
      ).rows[0] as JurisdictionRow;
      assert(row, 'Jurisdiction not found');
      return rowToJurisdiction(row);
    });
  }

  async createUser(user: Omit<User, 'jurisdictions'>): Promise<void> {
    if (user.type === 'support_user') {
      assert(
        user.name.endsWith('@voting.works') ||
          user.name.endsWith('@vx.support'),
        'Support users must have a @voting.works or @vx.support email'
      );
    }
    await this.db.withClient((client) =>
      client.query(
        `
        insert into users (id, type, name, organization_id)
        values ($1, $2, $3, $4)
        `,
        user.id,
        user.type,
        user.name,
        user.organization.id
      )
    );
  }

  async addUserToJurisdiction(
    userId: string,
    jurisdictionId: string
  ): Promise<void> {
    await this.db.withClient((client) =>
      client.withTransaction(async () => {
        // Ensure jurisdiction belongs to user's organization
        const result = await client.query(
          `
          select type
          from users
          join jurisdictions on jurisdictions.organization_id = users.organization_id
          where users.id = $1 and jurisdictions.id = $2
          `,
          userId,
          jurisdictionId
        );
        assert(
          result.rowCount === 1,
          `Jurisdiction does not belong to user's organization`
        );
        assert(
          result.rows[0].type === 'jurisdiction_user',
          `User is not a jurisdiction user`
        );
        await client.query(
          `
          insert into users_jurisdictions (user_id, jurisdiction_id)
          values ($1, $2)
          `,
          userId,
          jurisdictionId
        );
        return true;
      })
    );
  }

  async getUser(userId: string): Promise<Optional<User>> {
    return this.db.withClient(async (client) => {
      const userRow = (
        await client.query(
          `
          select
            users.id,
            users.type,
            users.name,
            users.organization_id as "organizationId",
            organizations.name as "organizationName"
          from users
          join organizations on users.organization_id = organizations.id
          where users.id = $1
          `,
          userId
        )
      ).rows[0] as
        | {
            id: string;
            type: UserType;
            name: string;
            organizationId: string;
            organizationName: string;
          }
        | undefined;
      if (!userRow) return undefined;

      const userBase = {
        id: userRow.id,
        name: userRow.name,
        organization: {
          id: userRow.organizationId,
          name: userRow.organizationName,
        },
      } as const;

      switch (userRow.type) {
        case 'jurisdiction_user': {
          const jurisdictionRows = (
            await client.query(
              `
              ${selectJurisdictionsBaseQuery}
              join users_jurisdictions on users_jurisdictions.jurisdiction_id = jurisdictions.id
              where users_jurisdictions.user_id = $1
              order by jurisdictions.name
              `,
              userId
            )
          ).rows as JurisdictionRow[];
          return {
            ...userBase,
            type: userRow.type,
            jurisdictions: jurisdictionRows.map(rowToJurisdiction),
          };
        }

        case 'organization_user':
        case 'support_user':
          return { ...userBase, type: userRow.type };

        default: {
          throwIllegalValue(userRow.type);
        }
      }
    });
  }

  async getUserIdByEmail(email: string): Promise<Optional<string>> {
    return this.db.withClient(async (client) => {
      const userRow = (
        await client.query(
          `
          select id
          from users
          where name = $1
          `,
          email
        )
      ).rows[0] as { id: string } | undefined;
      if (!userRow) {
        return undefined;
      }
      return userRow.id;
    });
  }

  async getElectionIdFromBallotHash(
    ballotHash: string
  ): Promise<ElectionId | undefined> {
    const row = (
      await this.db.withClient((client) =>
        client.query(
          `
          select id
          from elections
          where last_exported_ballot_hash = $1
        `,
          ballotHash
        )
      )
    ).rows[0];
    if (!row) {
      return undefined;
    }
    const electionId = row.id as ElectionId;

    return electionId;
  }

  async getExportedElectionDefinition(
    electionId: ElectionId
  ): Promise<Result<ElectionDefinition, GetExportedElectionError>> {
    const row = (
      await this.db.withClient((client) =>
        client.query(
          `
          select
            last_exported_election_data as "electionData",
            last_exported_ballot_hash as "ballotHash"
          from elections
          where id = $1
        `,
          electionId
        )
      )
    ).rows[0] as { electionData: string; ballotHash: string } | undefined;

    if (!row || !row.ballotHash) {
      return err('no-election-export-found');
    }

    // Parse the election data
    const parseResult = safeParseElectionAnyVersion(row.electionData);
    if (parseResult.isErr()) {
      return err('election-out-of-date');
    }

    return ok({
      ballotHash: row.ballotHash,
      election: parseResult.ok(),
      electionData: row.electionData,
    });
  }

  async getElectionJurisdiction(electionId: ElectionId): Promise<Jurisdiction> {
    const row = (
      await this.db.withClient((client) =>
        client.query(
          `
          ${selectJurisdictionsBaseQuery}
          join elections on elections.jurisdiction_id = jurisdictions.id
          where elections.id = $1
        `,
          electionId
        )
      )
    ).rows[0] as JurisdictionRow;
    assert(row, 'Election not found');
    return rowToJurisdiction(row);
  }

  /**
   * Create a new export QA run.
   */
  async createExportQaRun(p: {
    id: Id;
    electionId: ElectionId;
    exportPackageUrl: string;
    circleCiPipelineId?: string;
  }): Promise<void> {
    await this.db.withClient((client) =>
      client.query(
        `
          insert into export_qa_runs (
            id,
            election_id,
            export_package_url,
            circleci_pipeline_id,
            status
          ) values ($1, $2, $3, $4, $5)
        `,
        p.id,
        p.electionId,
        p.exportPackageUrl,
        p.circleCiPipelineId,
        'pending'
      )
    );
  }

  /**
   * Get an export QA run by ID.
   */
  async getExportQaRun(id: Id): Promise<Optional<ExportQaRun>> {
    const result = await this.db.withClient((client) =>
      client.query(
        `
          select
            id,
            election_id as "electionId",
            export_package_url as "exportPackageUrl",
            circleci_pipeline_id as "circleCiPipelineId",
            circleci_workflow_id as "circleCiWorkflowId",
            status,
            status_message as "statusMessage",
            results_url as "resultsUrl",
            job_url as "jobUrl",
            created_at as "createdAt",
            updated_at as "updatedAt"
          from export_qa_runs
          where id = $1
        `,
        id
      )
    );

    return result.rows[0] as Optional<ExportQaRun>;
  }

  /**
   * Get all export QA runs for an election.
   */
  async getLatestExportQaRunForElection(
    electionId: ElectionId
  ): Promise<Optional<ExportQaRun>> {
    const result = await this.db.withClient((client) =>
      client.query(
        `
          select
            id,
            election_id as "electionId",
            export_package_url as "exportPackageUrl",
            circleci_pipeline_id as "circleCiPipelineId",
            circleci_workflow_id as "circleCiWorkflowId",
            status,
            status_message as "statusMessage",
            results_url as "resultsUrl",
            job_url as "jobUrl",
            created_at as "createdAt",
            updated_at as "updatedAt"
          from export_qa_runs
          where election_id = $1
          order by created_at desc
          limit 1
        `,
        electionId
      )
    );

    return result.rows[0] as Optional<ExportQaRun>;
  }

  /**
   * Update the status of an export QA run.
   */
  async updateExportQaRunStatus(
    id: Id,
    params: UpdateQaRunStatusParams
  ): Promise<void> {
    await this.db.withClient((client) =>
      client.query(
        `
          update export_qa_runs
          set
            status = $1,
            status_message = $2,
            results_url = $3,
            circleci_workflow_id = $4,
            job_url = $5,
            updated_at = current_timestamp
          where id = $6
        `,
        params.status,
        params.statusMessage,
        params.resultsUrl,
        params.circleCiWorkflowId,
        params.jobUrl,
        id
      )
    );
  }

  async getTestDecks(electionId: ElectionId): Promise<TestDecksTaskMetadata> {
    const testDecks = (
      await this.db.withClient((client) =>
        client.query(
          `
            select
              test_decks_task_id as "taskId",
              test_decks_url as "url"
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
      task: testDecks?.taskId
        ? await this.tasks.getBackgroundTask(testDecks.taskId)
        : undefined,
      url: testDecks?.url ?? undefined,
    };
  }

  async createTestDecksBackgroundTask(
    electionId: ElectionId,
    electionSerializationFormat: ElectionSerializationFormat
  ): Promise<void> {
    await this.db.withClient(async (client) =>
      client.withTransaction(async () => {
        // If a task is already in progress, don't create a new one
        const { task } = await this.getTestDecks(electionId);
        if (task && !task.completedAt) {
          return false;
        }

        const taskId = await this.tasks.createBackgroundTask(
          'generate_test_decks',
          {
            electionId,
            electionSerializationFormat,
          }
        );
        await client.query(
          `
            update elections
            set
              test_decks_task_id = $1,
              test_decks_url = $2
            where id = $3
          `,
          taskId,
          null,
          electionId
        );

        return true;
      })
    );
  }

  async setTestDecksUrl({
    electionId,
    testDecksUrl,
  }: {
    electionId: ElectionId;
    testDecksUrl: string;
  }): Promise<void> {
    await this.db.withClient((client) =>
      client.query(
        `
          update elections
          set test_decks_url = $1
          where id = $2
        `,
        testDecksUrl,
        electionId
      )
    );
  }

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

  async ttsEditsAll(params: {
    jurisdictionId: string;
  }): Promise<TtsEditEntry[]> {
    return this.db.withClient(async (client) => {
      const res = await client.query(
        `
          select
            original,
            language_code as "languageCode",
            export_source as "exportSource",
            phonetic,
            text
          from tts_edits
          where jurisdiction_id = $1
        `,
        params.jurisdictionId
      );

      return res.rows.map<TtsEditEntry>((row) => ({
        exportSource: row.exportSource,
        original: row.original,
        languageCode: row.languageCode,
        phonetic: safeParse(PhoneticWordsSchema, row.phonetic).unsafeUnwrap(),
        text: row.text as string,
      }));
    });
  }

  async ttsEditsGet(key: TtsEditKey): Promise<TtsEdit | null> {
    return this.db.withClient(async (client) => {
      const res = await client.query(
        `
          select
            export_source as "exportSource",
            phonetic,
            text
          from tts_edits
          where
            jurisdiction_id = $1 and
            language_code = $2 and
            original = $3
        `,
        key.jurisdictionId,
        key.languageCode,
        key.original
      );

      if (res.rows.length === 0) return null;

      return {
        exportSource: res.rows[0].exportSource,

        phonetic: safeParse(
          PhoneticWordsSchema,
          res.rows[0]['phonetic']
        ).unsafeUnwrap(),

        text: res.rows[0].text as string,
      };
    });
  }

  async ttsEditsSet(key: TtsEditKey, data: TtsEdit): Promise<void> {
    return this.db.withClient(async (client) => {
      await client.query(
        `
            insert into tts_edits (
              jurisdiction_id,
              language_code,
              original,
              export_source,
              phonetic,
              text
            )
            values ($1, $2, $3, $4, $5, $6)
            on conflict (jurisdiction_id, language_code, original) do update set
              export_source = EXCLUDED.export_source,
              phonetic = EXCLUDED.phonetic,
              text = EXCLUDED.text
          `,
        key.jurisdictionId,
        key.languageCode,
        key.original,
        data.exportSource,
        JSON.stringify(data.phonetic),
        data.text
      );
    });
  }

  async electionHasLiveReportData(
    electionId: string,
    ballotHash: string
  ): Promise<boolean> {
    const rows = await this.db.withClient((client) =>
      client.query(
        `
            select 1
            from results_reports
            where
              ballot_hash = $1 and
              election_id = $2 and
              is_live_mode = true
            limit 1
          `,
        ballotHash,
        electionId
      )
    );
    return !!rows.rowCount;
  }

  /**
   * Returns all polls transition reports for the election, ordered by
   * timestamp descending. Used for the activity log. Optionally filtered
   * to a specific polling place voting group.
   */
  async getAllReportsForElection(
    ballotHash: string,
    isLive: boolean,
    votingGroup?: PollingPlaceType
  ): Promise<QuickReportedPollStatus[]> {
    const queryParams: Array<string | boolean | number> = [
      ballotHash,
      isLive,
      MAX_LIVE_REPORT_ACTIVITY_ITEMS,
    ];
    let pollingPlaceJoin = '';
    let pollingPlaceWhereClause = '';
    if (votingGroup) {
      queryParams.push(votingGroup);
      pollingPlaceJoin =
        'inner join polling_places on polling_places.id = results_reports.polling_place_id';
      pollingPlaceWhereClause = 'and polling_places.type = $4';
    }

    const rows = (
      await this.db.withClient((client) =>
        client.query(
          `
            select
              results_reports.polls_transition as "pollsTransitionType",
              results_reports.machine_id as "machineId",
              results_reports.signed_at as "signedAt",
              results_reports.polling_place_id as "pollingPlaceId"
            from results_reports
            ${pollingPlaceJoin}
            where
              results_reports.ballot_hash = $1 and
              results_reports.is_live_mode = $2
              ${pollingPlaceWhereClause}
            order by results_reports.signed_at desc
            limit $3
          `,
          ...queryParams
        )
      )
    ).rows as Array<{
      pollsTransitionType: string;
      machineId: string;
      pollingPlaceId: string;
      signedAt: Date;
    }>;

    return rows.map((row) => ({
      machineId: row.machineId,
      pollingPlaceId: row.pollingPlaceId,
      signedTimestamp: row.signedAt,
      pollsTransitionType: row.pollsTransitionType as PollsTransitionType,
    }));
  }

  /**
   * Returns the most recent polls transition status for each machine,
   * grouped by polling place.
   */
  async getPollsStatusForElection(
    ballotHash: string,
    isLive: boolean
  ): Promise<Record<string, QuickReportedPollStatus[]>> {
    const rows = (
      await this.db.withClient((client) =>
        client.query(
          `
            select
              polls_transition as "pollsTransitionType",
              machine_id as "machineId",
              signed_at as "signedAt",
              polling_place_id as "pollingPlaceId"
            from (
              select
                polls_transition,
                machine_id,
                signed_at,
                polling_place_id,
                row_number() over (partition by machine_id, ballot_hash order by signed_at desc) as rn
              from results_reports
              where
                ballot_hash = $1 and
                is_live_mode = $2
            ) ranked_results
            where rn = 1
            order by signed_at desc
          `,
          ballotHash,
          isLive
        )
      )
    ).rows as Array<{
      pollsTransitionType: string;
      machineId: string;
      pollingPlaceId: string;
      signedAt: Date;
    }>;

    const reportsByPollingPlace: Record<string, QuickReportedPollStatus[]> = {};
    for (const status of rows) {
      const key = status.pollingPlaceId;
      // @coverage-defer
      if (!reportsByPollingPlace[key]) {
        reportsByPollingPlace[key] = [];
      }
      reportsByPollingPlace[key].push({
        machineId: status.machineId,
        pollingPlaceId: status.pollingPlaceId,
        signedTimestamp: status.signedAt,
        pollsTransitionType: status.pollsTransitionType as PollsTransitionType,
      });
    }
    return reportsByPollingPlace;
  }

  /**
   * Returns aggregated tally results from the per-precinct tallies table,
   * optionally filtered by precinct selection.
   */
  async getLiveReportTalliesForElection(
    election: Election,
    electionBallotHash: string,
    precinctSelection: PrecinctSelection,
    isLive: boolean
  ): Promise<{
    contestResults: Record<ContestId, Tabulation.ContestResults>;
    machinesReporting: string[];
  }> {
    let precinctWhereClause = '';
    const queryParams: Array<string | boolean> = [electionBallotHash, isLive];
    if (precinctSelection.kind === 'SinglePrecinct') {
      precinctWhereClause = 'and precinct_id = $3';
      queryParams.push(precinctSelection.precinctId);
    }
    const rows = (
      await this.db.withClient((client) =>
        client.query(
          `
            select
              encoded_compressed_tally as "encodedCompressedTally",
              machine_id as "machineId",
              precinct_id as "precinctId"
            from results_report_tallies
            where
              ballot_hash = $1 and
              is_live_mode = $2
              ${precinctWhereClause}
            order by signed_at desc
          `,
          ...queryParams
        )
      )
    ).rows as Array<{
      encodedCompressedTally: string;
      machineId: string;
      precinctId: string;
    }>;

    // Each row is a V0 single-precinct tally. Decode and combine.
    const contestResults = combineAndDecodeCompressedElectionResults({
      election,
      encodedCompressedTallies: rows.map((r) => ({
        encodedTally: r.encodedCompressedTally,
        precinctSelection: singlePrecinctSelectionFor(r.precinctId),
      })),
    });

    // Deduplicate machine IDs
    const machinesReporting = [...new Set(rows.map((r) => r.machineId))];

    return {
      contestResults,
      machinesReporting,
    };
  }

  /**
   * Saves a machine status report (open/pause/resume/close_polls) and,
   * for close_polls, per-precinct V0 tally rows in the separate tallies
   * table.
   */
  async saveQuickResultsReportingTally({
    electionId,
    ballotHash,
    machineId,
    isLive,
    signedTimestamp,
    pollingPlaceId,
    pollsTransitionType,
    perPrecinctTallies,
  }: {
    electionId: string;
    ballotHash: string;
    machineId: string;
    isLive: boolean;
    signedTimestamp: Date;
    pollingPlaceId: string;
    pollsTransitionType: PollsTransitionType;
    perPrecinctTallies: Array<{
      precinctId: string;
      encodedTally: string;
    }>;
  }): Promise<void> {
    await this.db.withClient((client) =>
      client.withTransaction(async () => {
        // Upsert the machine status row
        await client.query(
          `
            insert into results_reports (
              ballot_hash,
              election_id,
              machine_id,
              is_live_mode,
              signed_at,
              polls_transition,
              polling_place_id
            ) values ($1, $2, $3, $4, $5, $6, $7)
            on conflict (ballot_hash, machine_id, is_live_mode, polls_transition)
            do update set
              signed_at = excluded.signed_at,
              polling_place_id = excluded.polling_place_id
          `,
          ballotHash,
          electionId,
          machineId,
          isLive,
          signedTimestamp.toISOString(),
          pollsTransitionType,
          pollingPlaceId
        );

        // For close_polls, upsert per-precinct tally rows
        for (const { precinctId, encodedTally } of perPrecinctTallies) {
          await client.query(
            `
              insert into results_report_tallies (
                ballot_hash,
                election_id,
                machine_id,
                is_live_mode,
                polling_place_id,
                precinct_id,
                encoded_compressed_tally,
                signed_at
              ) values ($1, $2, $3, $4, $5, $6, $7, $8)
              on conflict (ballot_hash, machine_id, is_live_mode, precinct_id)
              do update set
                encoded_compressed_tally = excluded.encoded_compressed_tally,
                polling_place_id = excluded.polling_place_id,
                signed_at = excluded.signed_at
            `,
            ballotHash,
            electionId,
            machineId,
            isLive,
            pollingPlaceId,
            precinctId,
            encodedTally,
            signedTimestamp.toISOString()
          );
        }

        // Delete tally rows for precincts no longer in the report
        if (perPrecinctTallies.length > 0) {
          const precinctIds = perPrecinctTallies.map((t) => t.precinctId);
          const placeholders = precinctIds.map((_id, i) => `$${i + 4}`);
          await client.query(
            `
            delete from results_report_tallies
            where
              ballot_hash = $1 and
              machine_id = $2 and
              is_live_mode = $3 and
              precinct_id not in (${placeholders.join(', ')})
          `,
            ballotHash,
            machineId,
            isLive,
            ...precinctIds
          );
        }

        // Clean up partial reports for this machine.
        await client.query(
          `
          delete from results_reports_partial
          where
            ballot_hash = $1 and
            machine_id = $2 and
            is_live_mode = $3 and
            polls_transition = $4
        `,
          ballotHash,
          machineId,
          isLive,
          pollsTransitionType
        );
        return true;
      })
    );
  }

  /**
   * Save a single partial page of a multi-page QR results report. Each page
   * is stored separately in `results_reports_partial` and identified by its
   * page_index and num_pages. This allows assembling the final report when
   * the last page is received.
   */
  async savePartialQuickResultsReportingPage({
    electionId,
    ballotHash,
    encodedCompressedTally,
    machineId,
    isLive,
    signedTimestamp,
    pollingPlaceId,
    pollsTransitionType,
    pageIndex,
    numPages,
  }: {
    electionId: string;
    ballotHash: string;
    encodedCompressedTally: string;
    machineId: string;
    isLive: boolean;
    signedTimestamp: Date;
    pollingPlaceId: string;
    pollsTransitionType: PollsTransitionType;
    pageIndex: number;
    numPages: number;
  }): Promise<void> {
    await this.db.withClient((client) =>
      client.withTransaction(async () => {
        // If any existing partial row has a different num_pages or
        // polling_place_id, delete it so the new report will override.
        await client.query(
          `
          delete from results_reports_partial
          where
          ballot_hash = $1 and
          machine_id = $2 and
          is_live_mode = $3 and
          polls_transition = $4 and
          (num_pages != $5 OR polling_place_id IS DISTINCT FROM $6)
            `,
          ballotHash,
          machineId,
          isLive,
          pollsTransitionType,
          numPages,
          pollingPlaceId
        );
        const { rowCount } = await client.query(
          `
            insert into results_reports_partial (
              ballot_hash,
              election_id,
              machine_id,
              is_live_mode,
              signed_at,
              encoded_compressed_tally,
              polling_place_id,
              polls_transition,
              page_index,
              num_pages
            ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            on conflict (ballot_hash, machine_id, is_live_mode, polls_transition, page_index)
            do update set
              signed_at = excluded.signed_at,
              encoded_compressed_tally = excluded.encoded_compressed_tally,
              polling_place_id = excluded.polling_place_id,
              polls_transition = excluded.polls_transition,
              num_pages = excluded.num_pages
          `,
          ballotHash,
          electionId,
          machineId,
          isLive,
          signedTimestamp.toISOString(),
          encodedCompressedTally,
          pollingPlaceId,
          pollsTransitionType,
          pageIndex,
          numPages
        );
        assert(rowCount === 1, 'Failed to insert partial results report');
        return true;
      })
    );
  }

  /**
   * Fetch all partial pages for the given ballot_hash/machine/is_live/
   * polls_transition combination ordered by page_index.
   */
  async fetchPartialPages({
    ballotHash,
    machineId,
    isLive,
    pollsTransitionType,
  }: {
    ballotHash: string;
    machineId: string;
    isLive: boolean;
    pollsTransitionType: PollsTransitionType;
  }): Promise<
    Array<{
      encodedCompressedTally: string;
      pollingPlaceId: string;
      numPages: number;
      pageIndex: number;
    }>
  > {
    return await this.db.withClient(async (client) => {
      const res = await client.query(
        `
          select
            encoded_compressed_tally as "encodedCompressedTally",
            polling_place_id as "pollingPlaceId",
            page_index as "pageIndex",
            num_pages as "numPages"
          from results_reports_partial
          where
            ballot_hash = $1 and
            machine_id = $2 and
            is_live_mode = $3 and
            polls_transition = $4
          order by page_index asc
        `,
        ballotHash,
        machineId,
        isLive,
        pollsTransitionType
      );
      return res.rows as Array<{
        encodedCompressedTally: string;
        pollingPlaceId: string;
        numPages: number;
        pageIndex: number;
      }>;
    });
  }

  async deleteQuickReportingResultsForElection(
    electionId: ElectionId
  ): Promise<void> {
    await this.db.withClient((client) =>
      client.withTransaction(async () => {
        await client.query(
          `delete from results_reports where election_id = $1`,
          electionId
        );
        await client.query(
          `delete from results_report_tallies where election_id = $1`,
          electionId
        );
        await client.query(
          `delete from results_reports_partial where election_id = $1`,
          electionId
        );
        return true;
      })
    );
  }
}
