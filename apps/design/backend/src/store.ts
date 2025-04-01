import { DateWithoutTime, Optional, assert, find } from '@votingworks/basics';
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
  DistrictId,
  hasSplits,
  District,
  PrecinctId,
  Party,
  AnyContest,
  HmpbBallotPaperSize,
} from '@votingworks/types';
import { v4 as uuid } from 'uuid';
import { BaseLogger } from '@votingworks/logging';
import { BallotTemplateId } from '@votingworks/hmpb';
import {
  BallotOrderInfo,
  BallotOrderInfoSchema,
  BallotStyle,
  convertToVxfBallotStyle,
  ElectionListing,
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

export type TaskName = 'generate_election_package' | 'generate_test_decks';

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

export interface BackgroundTaskMetadata {
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

function validatePrecinctDistrictIds(
  precinct: SplittablePrecinct,
  districts: readonly District[]
) {
  const districtIds = new Set(districts.map((d) => d.id));
  const precinctDistrictIds = hasSplits(precinct)
    ? precinct.splits.flatMap((split) => split.districtIds)
    : precinct.districtIds;
  assert(
    precinctDistrictIds.every((id) => districtIds.has(id)),
    'Precinct contains invalid district IDs'
  );
}

export class Store {
  constructor(private readonly db: Db) {}

  static new(logger: BaseLogger): Store {
    return new Store(new Db(logger));
  }

  async listElections(input: {
    orgId?: string;
  }): Promise<Array<Omit<ElectionListing, 'orgName'>>> {
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
                elections.id as "electionId",
                elections.org_id as "orgId",
                elections.type,
                elections.title,
                elections.date,
                elections.jurisdiction,
                elections.state,
                elections.ballots_finalized_at as "ballotsFinalizedAt",
                elections.ballot_order_info_data as "ballotOrderInfoData",
                count(contests.id)::int as "contestCount"
              from elections
              left join contests on elections.id = contests.election_id
              ${whereClause}
              group by elections.id
              order by elections.created_at desc
              `,
              ...params
            )
          ).rows as Array<
            Omit<ElectionListing, 'orgName' | 'status'> & {
              date: Date;
              ballotsFinalizedAt: Date | null;
              ballotOrderInfoData: string;
              contestCount: number;
            }
          >
      )
    ).map((row) => ({
      electionId: row.electionId,
      orgId: row.orgId,
      type: row.type,
      title: row.title,
      date: new DateWithoutTime(row.date.toISOString().split('T')[0]),
      jurisdiction: row.jurisdiction,
      state: row.state,
      status: (() => {
        if (row.contestCount === 0) {
          return 'notStarted';
        }
        if (!row.ballotsFinalizedAt) {
          return 'inProgress';
        }
        if (row.ballotOrderInfoData === '{}') {
          return 'ballotsFinalized';
        }
        return 'orderSubmitted';
      })(),
    }));
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

  async getSystemSettings(electionId: ElectionId): Promise<SystemSettings> {
    const { systemSettingsData } = (
      await this.db.withClient((client) =>
        client.query(
          `
          select system_settings_data as "systemSettingsData"
          from elections
          where id = $1
        `,
          electionId
        )
      )
    ).rows[0];
    return safeParseSystemSettings(systemSettingsData).unsafeUnwrap();
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

  async getBallotOrderInfo(electionId: ElectionId): Promise<BallotOrderInfo> {
    const { ballotOrderInfoData } = (
      await this.db.withClient((client) =>
        client.query(
          `
          select ballot_order_info_data as "ballotOrderInfoData"
          from elections
          where id = $1
        `,
          electionId
        )
      )
    ).rows[0];
    return safeParseJson(
      ballotOrderInfoData,
      BallotOrderInfoSchema
    ).unsafeUnwrap();
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

  async listDistricts(electionId: ElectionId): Promise<readonly District[]> {
    const { election } = await this.getElection(electionId);
    return election.districts;
  }

  async createDistrict(
    electionId: ElectionId,
    district: District
  ): Promise<void> {
    const { election } = await this.getElection(electionId);
    await this.updateElection(electionId, {
      ...election,
      districts: [...election.districts, district],
    });
  }

  async updateDistrict(
    electionId: ElectionId,
    district: District
  ): Promise<void> {
    const { election } = await this.getElection(electionId);
    assert(
      election.districts.some((d) => d.id === district.id),
      'District not found'
    );
    const updatedDistricts = election.districts.map((d) =>
      d.id === district.id ? district : d
    );
    await this.updateElection(electionId, {
      ...election,
      districts: updatedDistricts,
    });
  }

  async deleteDistrict(
    electionId: ElectionId,
    districtId: DistrictId
  ): Promise<void> {
    const { election, precincts } = await this.getElection(electionId);
    assert(
      election.districts.some((d) => d.id === districtId),
      'District not found'
    );
    const updatedDistricts = election.districts.filter(
      (d) => d.id !== districtId
    );
    // When deleting a district, we need to remove it from any precincts that
    // reference it
    const updatedPrecincts = precincts.map((precinct) => {
      if (hasSplits(precinct)) {
        return {
          ...precinct,
          splits: precinct.splits.map((split) => ({
            ...split,
            districtIds: split.districtIds.filter((id) => id !== districtId),
          })),
        };
      }
      return {
        ...precinct,
        districtIds: precinct.districtIds.filter((id) => id !== districtId),
      };
    });
    await this.db.withClient((client) =>
      client.withTransaction(async () => {
        await client.query(
          `
            update elections
            set election_data = $1
            where id = $2
          `,
          JSON.stringify({
            ...election,
            districts: updatedDistricts,
          }),
          electionId
        );
        await client.query(
          `
            update elections
            set precinct_data = $1
            where id = $2
          `,
          JSON.stringify(updatedPrecincts),
          electionId
        );
        return true;
      })
    );
  }

  async listPrecincts(electionId: ElectionId): Promise<SplittablePrecinct[]> {
    const { precincts } = await this.getElection(electionId);
    return precincts;
  }

  async createPrecinct(
    electionId: ElectionId,
    precinct: SplittablePrecinct
  ): Promise<void> {
    const { election, precincts } = await this.getElection(electionId);
    validatePrecinctDistrictIds(precinct, election.districts);
    await this.updatePrecincts(electionId, [...precincts, precinct]);
  }

  async updatePrecinct(
    electionId: ElectionId,
    precinct: SplittablePrecinct
  ): Promise<void> {
    const { election, precincts } = await this.getElection(electionId);
    assert(
      precincts.some((p) => p.id === precinct.id),
      'Precinct not found'
    );
    validatePrecinctDistrictIds(precinct, election.districts);
    const updatedPrecincts = precincts.map((p) =>
      p.id === precinct.id ? precinct : p
    );
    await this.updatePrecincts(electionId, updatedPrecincts);
  }

  async deletePrecinct(
    electionId: ElectionId,
    precinctId: PrecinctId
  ): Promise<void> {
    const { precincts } = await this.getElection(electionId);
    assert(
      precincts.some((p) => p.id === precinctId),
      'Precinct not found'
    );
    const updatedPrecincts = precincts.filter((p) => p.id !== precinctId);
    await this.updatePrecincts(electionId, updatedPrecincts);
  }

  private async updatePrecincts(
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

  async listBallotStyles(electionId: ElectionId): Promise<BallotStyle[]> {
    const { ballotStyles } = await this.getElection(electionId);
    return ballotStyles;
  }

  async listParties(electionId: ElectionId): Promise<readonly Party[]> {
    const { election } = await this.getElection(electionId);
    return election.parties;
  }

  async createParty(electionId: ElectionId, party: Party): Promise<void> {
    const { election } = await this.getElection(electionId);
    await this.updateElection(electionId, {
      ...election,
      parties: [...election.parties, party],
    });
  }

  async updateParty(electionId: ElectionId, party: Party): Promise<void> {
    const { election } = await this.getElection(electionId);
    assert(
      election.parties.some((p) => p.id === party.id),
      'Party not found'
    );
    const updatedParties = election.parties.map((p) =>
      p.id === party.id ? party : p
    );
    await this.updateElection(electionId, {
      ...election,
      parties: updatedParties,
    });
  }

  async deleteParty(electionId: ElectionId, partyId: string): Promise<void> {
    const { election } = await this.getElection(electionId);
    assert(
      election.parties.some((p) => p.id === partyId),
      'Party not found'
    );
    const updatedParties = election.parties.filter((p) => p.id !== partyId);
    // When deleting a party, we need to remove it from any
    // contests/candidates that reference it
    const updatedContests = election.contests.map((contest) => {
      if (contest.type === 'candidate') {
        return {
          ...contest,
          partyId: contest.partyId === partyId ? undefined : contest.partyId,
          candidates: contest.candidates.map((candidate) => {
            const partyIds = candidate.partyIds?.filter((id) => id !== partyId);
            return {
              ...candidate,
              partyIds: partyIds && partyIds.length > 0 ? partyIds : undefined,
            };
          }),
        };
      }
      return contest;
    });
    await this.updateElection(electionId, {
      ...election,
      parties: updatedParties,
      contests: updatedContests,
    });
  }

  async listContests(electionId: ElectionId): Promise<readonly AnyContest[]> {
    const { election } = await this.getElection(electionId);
    return election.contests;
  }

  async createContest(
    electionId: ElectionId,
    contest: AnyContest
  ): Promise<void> {
    const { election } = await this.getElection(electionId);
    await this.updateElection(electionId, {
      ...election,
      contests: [...election.contests, contest],
    });
  }

  async updateContest(
    electionId: ElectionId,
    contest: AnyContest
  ): Promise<void> {
    const { election } = await this.getElection(electionId);
    assert(
      election.contests.some((c) => c.id === contest.id),
      'Contest not found'
    );
    const updatedContests = election.contests.map((c) =>
      c.id === contest.id ? contest : c
    );
    await this.updateElection(electionId, {
      ...election,
      contests: updatedContests,
    });
  }

  async reorderContests(
    electionId: ElectionId,
    contestIds: string[]
  ): Promise<void> {
    const { election } = await this.getElection(electionId);
    assert(
      contestIds.length === election.contests.length &&
        election.contests.every((c) => contestIds.includes(c.id)),
      'Invalid contest IDs'
    );
    const updatedContests = contestIds.map((id) =>
      find(election.contests, (c) => c.id === id)
    );
    await this.updateElection(electionId, {
      ...election,
      contests: updatedContests,
    });
  }

  async deleteContest(
    electionId: ElectionId,
    contestId: string
  ): Promise<void> {
    const { election } = await this.getElection(electionId);
    assert(
      election.contests.some((c) => c.id === contestId),
      'Contest not found'
    );
    const updatedContests = election.contests.filter((c) => c.id !== contestId);
    await this.updateElection(electionId, {
      ...election,
      contests: updatedContests,
    });
  }

  async getBallotPaperSize(
    electionId: ElectionId
  ): Promise<HmpbBallotPaperSize> {
    const { election } = await this.getElection(electionId);
    return election.ballotLayout.paperSize;
  }

  async updateBallotPaperSize(
    electionId: ElectionId,
    paperSize: HmpbBallotPaperSize
  ): Promise<void> {
    const { election } = await this.getElection(electionId);
    await this.updateElection(electionId, {
      ...election,
      ballotLayout: {
        ...election.ballotLayout,
        paperSize,
      },
    });
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

  async getElectionPackage(
    electionId: ElectionId
  ): Promise<BackgroundTaskMetadata> {
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
    electionSerializationFormat: ElectionSerializationFormat,
    shouldExportAudio: boolean
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
            shouldExportAudio,
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

  async getTestDecks(electionId: ElectionId): Promise<BackgroundTaskMetadata> {
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
        ? await this.getBackgroundTask(testDecks.taskId)
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

        const taskId = await this.createBackgroundTask('generate_test_decks', {
          electionId,
          electionSerializationFormat,
        });
        await client.query(
          `
            update elections
            set test_decks_task_id = $1
            where id = $2
          `,
          taskId,
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

  async getBallotTemplate(electionId: ElectionId): Promise<BallotTemplateId> {
    const { ballotTemplateId } = (
      await this.db.withClient((client) =>
        client.query(
          `
          select ballot_template_id as "ballotTemplateId"
          from elections
          where id = $1
        `,
          electionId
        )
      )
    ).rows[0];
    return ballotTemplateId;
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
