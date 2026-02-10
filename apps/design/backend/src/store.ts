import {
  DateWithoutTime,
  Optional,
  Result,
  assert,
  assertDefined,
  err,
  ok,
  throwIllegalValue,
  typedAs,
  uniqueDeep,
} from '@votingworks/basics';
import {
  Id,
  Iso8601Timestamp,
  Election,
  SystemSettings,
  safeParseSystemSettings,
  ElectionSerializationFormat,
  BallotLanguageConfigs,
  LanguageCode,
  ElectionId,
  BallotLanguageConfig,
  Precinct,
  DistrictId,
  hasSplits,
  District,
  PrecinctId,
  Party,
  AnyContest,
  HmpbBallotPaperSize,
  NhPrecinctSplitOptions,
  Candidate,
  CandidateId,
  PartyId,
  YesNoContest,
  CandidateContest,
  ElectionType,
  Signature,
  TtsEdit,
  TtsEditKey,
  safeParse,
  PhoneticWordsSchema,
  ContestId,
  PrecinctSelection,
  TtsEditEntry,
  PollsState,
  PollsStateSupportsLiveReporting,
  safeParseElectionDefinition,
  ElectionDefinition,
  BallotStyle,
  unsafeParse,
  DistrictSchema,
  PartySchema,
  YesNoOption,
} from '@votingworks/types';
import {
  singlePrecinctSelectionFor,
  ALL_PRECINCTS_SELECTION,
  combineAndDecodeCompressedElectionResults,
  getContestsForPrecinctAndElection,
} from '@votingworks/utils';
import { v4 as uuid } from 'uuid';
import { BaseLogger } from '@votingworks/logging';
import { BallotTemplateId, generateBallotStyles } from '@votingworks/hmpb';
import { DatabaseError } from 'pg';
import { ContestResults } from '@votingworks/types/src/tabulation';
import {
  ALL_PRECINCTS_REPORT_KEY,
  ExternalElectionSource,
  ElectionInfo,
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
} from './types';
import { Db } from './db/db';
import { Bindable, Client } from './db/client';

export interface ElectionRecord {
  jurisdictionId: string;
  election: Election;
  systemSettings: SystemSettings;
  createdAt: Iso8601Timestamp;
  ballotLanguageConfigs: BallotLanguageConfigs;
  ballotTemplateId: BallotTemplateId;
  ballotsFinalizedAt: Date | null;
  lastExportedBallotHash?: string;
  externalSource?: ExternalElectionSource;
}

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

const DEFAULT_LANGUAGE_CODES = [LanguageCode.ENGLISH];

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

export interface TestDecksTaskMetadata {
  task?: BackgroundTask;
  url?: string;
}

/**
 * Ensures that the given function is called within a transaction by querying
 * the database (only in non-production environments). Useful for any helper
 * function that groups multiple database operations together.
 */
async function assertWithinTransaction(client: Client): Promise<void> {
  if (process.env.NODE_ENV !== 'production') {
    const { isInTransaction } = (
      await client.query(
        'select now() != statement_timestamp() as "isInTransaction"'
      )
    ).rows[0];
    assert(isInTransaction, 'Expected to be within a transaction');
  }
}

function isDuplicateKeyError(
  error: unknown,
  constraint: string
): error is DatabaseError {
  return (
    error instanceof DatabaseError &&
    error.code === '23505' &&
    error.constraint === constraint
  );
}

export type DuplicateElectionError = 'duplicate-title-and-date';

export type DuplicateDistrictErrorCode = 'duplicate-name';

export interface DuplicateDistrictError {
  code: DuplicateDistrictErrorCode;
  districtId: string;
}

export type DuplicatePrecinctError =
  | 'duplicate-precinct-name'
  | 'duplicate-split-name'
  | 'duplicate-split-districts';

export type DuplicatePartyErrorCode =
  | 'duplicate-name'
  | 'duplicate-full-name'
  | 'duplicate-abbrev';

export interface DuplicatePartyError {
  code: DuplicatePartyErrorCode;
  partyId: string;
}

export type DuplicateContestError =
  | 'duplicate-contest'
  | 'duplicate-candidate'
  | 'duplicate-option';

async function insertDistrict(
  client: Client,
  electionId: ElectionId,
  district: District
) {
  await client.query(
    `
      insert into districts (
        id,
        election_id,
        name
      )
      values ($1, $2, $3)
    `,
    district.id,
    electionId,
    district.name
  );
}

async function insertPrecinct(
  client: Client,
  electionId: ElectionId,
  precinct: Precinct
) {
  await assertWithinTransaction(client);
  await client.query(
    `
      insert into precincts (
        id,
        election_id,
        name
      )
      values ($1, $2, $3)
    `,
    precinct.id,
    electionId,
    precinct.name
  );
  if (hasSplits(precinct)) {
    if (
      uniqueDeep(precinct.splits, (split) => split.districtIds.toSorted())
        .length !== precinct.splits.length
    ) {
      throw new Error('duplicate-split-districts');
    }

    for (const split of precinct.splits) {
      const { id: splitId, name, districtIds, ...nhOptions } = split;
      await client.query(
        `
          insert into precinct_splits (
            id,
            precinct_id,
            name,
            nh_options
          )
          values ($1, $2, $3, $4)
        `,
        splitId,
        precinct.id,
        name,
        JSON.stringify(nhOptions)
      );
      for (const districtId of districtIds) {
        await client.query(
          `
          insert into districts_precinct_splits (
            district_id,
            precinct_split_id
          )
          values ($1, $2)
        `,
          districtId,
          splitId
        );
      }
    }
  } else {
    for (const districtId of precinct.districtIds) {
      await client.query(
        `
          insert into districts_precincts (
            district_id,
            precinct_id
          )
          values ($1, $2)
        `,
        districtId,
        precinct.id
      );
    }
  }
}

async function insertParty(
  client: Client,
  electionId: ElectionId,
  party: Party
) {
  await client.query(
    `
      insert into parties (
        id,
        election_id,
        name,
        full_name,
        abbrev
      )
      values ($1, $2, $3, $4, $5)
    `,
    party.id,
    electionId,
    party.name,
    party.fullName,
    party.abbrev
  );
}

async function insertContest(
  client: Client,
  electionId: ElectionId,
  contest: AnyContest,
  ballotOrder?: number
) {
  await assertWithinTransaction(client);
  switch (contest.type) {
    case 'candidate': {
      await client.query(
        `
          insert into contests (
            id,
            election_id,
            title,
            type,
            district_id,
            seats,
            allow_write_ins,
            party_id,
            term_description,
            ballot_order
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, ${
            ballotOrder ? '$10' : 'DEFAULT'
          })
        `,
        contest.id,
        electionId,
        contest.title,
        contest.type,
        contest.districtId,
        contest.seats,
        contest.allowWriteIns,
        contest.partyId,
        contest.termDescription,
        ...(ballotOrder ? [ballotOrder] : [])
      );
      for (const candidate of contest.candidates) {
        await client.query(
          `
            insert into candidates (
              id,
              contest_id,
              first_name,
              middle_name,
              last_name
            )
            values ($1, $2, $3, $4, $5)
          `,
          candidate.id,
          contest.id,
          candidate.firstName,
          candidate.middleName,
          candidate.lastName
        );
        for (const partyId of candidate.partyIds ?? []) {
          await client.query(
            `
              insert into candidates_parties (
                candidate_id,
                party_id
              )
              values ($1, $2)
            `,
            candidate.id,
            partyId
          );
        }
      }

      // If ballotOrder is undefined, reorder this candidate contest before the first ballot measure
      if (ballotOrder === undefined) {
        // Get all current contests in order
        const { rows: allContests } = await client.query(
          `select id, type from contests
           where election_id = $1
           order by ballot_order`,
          electionId
        );
        const contestIds = allContests.map((row) => row.id);
        const firstBallotMeasureIndex = allContests.findIndex(
          (row) => row.type === 'yesno'
        );
        if (firstBallotMeasureIndex !== -1) {
          // Remove the newly inserted contest from its current position (should be last)
          const newContestIndex = contestIds.indexOf(contest.id);
          assert(newContestIndex === contestIds.length - 1);
          contestIds.splice(newContestIndex, 1);
          contestIds.splice(firstBallotMeasureIndex, 0, contest.id);

          // Apply the new order using reorderContests logic
          for (const contestId of contestIds) {
            await client.query(
              `update contests set ballot_order = DEFAULT where id = $1 and election_id = $2`,
              contestId,
              electionId
            );
          }
        }
      }
      break;
    }

    case 'yesno': {
      await client.query(
        `
          insert into contests (
            id,
            election_id,
            title,
            type,
            district_id,
            description,
            yes_option_id,
            yes_option_label,
            no_option_id,
            no_option_label,
            additional_options,
            ballot_order
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, ${
            ballotOrder ? '$12' : 'DEFAULT'
          })
        `,
        contest.id,
        electionId,
        contest.title,
        contest.type,
        contest.districtId,
        contest.description,
        contest.yesOption.id,
        contest.yesOption.label,
        contest.noOption.id,
        contest.noOption.label,
        JSON.stringify(contest.additionalOptions),
        ...(ballotOrder ? [ballotOrder] : [])
      );
      break;
    }

    default: {
      /* istanbul ignore next - @preserve */
      throwIllegalValue(contest);
    }
  }
}

const selectJurisdictionsBaseQuery = `
  select
    jurisdictions.id,
    jurisdictions.name,
    state_code as "stateCode",
    organizations.id as "organizationId",
    organizations.name as "organizationName"
  from jurisdictions
  join organizations on jurisdictions.organization_id = organizations.id
`;

interface JurisdictionRow {
  id: string;
  name: string;
  stateCode: StateCode;
  organizationId: string;
  organizationName: string;
}

function rowToJurisdiction(row: JurisdictionRow): Jurisdiction {
  return {
    id: row.id,
    name: row.name,
    stateCode: row.stateCode,
    organization: {
      id: row.organizationId,
      name: row.organizationName,
    },
  };
}

export class Store {
  constructor(
    private readonly db: Db,
    private readonly logger: BaseLogger
  ) {}

  /* istanbul ignore next - @preserve */
  static new(logger: BaseLogger): Store {
    return new Store(new Db(logger), logger);
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
        insert into jurisdictions (id, name, state_code, organization_id)
        values ($1, $2, $3, $4)
        `,
        jurisdiction.id,
        jurisdiction.name,
        jurisdiction.stateCode,
        jurisdiction.organization.id
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
          /* istanbul ignore next - @preserve */
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

  async listElections(input: {
    jurisdictionIds?: string[];
  }): Promise<ElectionListing[]> {
    let whereClause = '';
    const params: Bindable[] = [];

    if (input.jurisdictionIds) {
      whereClause = `where jurisdiction_id in (${input.jurisdictionIds
        .map((_, i) => `$${i + 1}`)
        .join(', ')})`;
      params.push(...input.jurisdictionIds);
    }

    return (
      await this.db.withClient(
        async (client) =>
          (
            await client.query(
              `
              select
                elections.id as "electionId",
                elections.jurisdiction_id as "jurisdictionId",
                jurisdictions.name as "jurisdictionName",
                elections.type,
                elections.title,
                elections.date,
                elections.county_name as "countyName",
                elections.state,
                elections.ballots_finalized_at as "ballotsFinalizedAt",
                elections.ballots_approved_at as "ballotsApprovedAt",
                elections.external_source as "externalSource",
                count(contests.id)::int as "contestCount"
              from elections
              join jurisdictions on elections.jurisdiction_id = jurisdictions.id
              left join contests on elections.id = contests.election_id
              ${whereClause}
              group by elections.id, jurisdictions.name
              order by elections.created_at desc
              `,
              ...params
            )
          ).rows as Array<
            Omit<ElectionListing, 'status'> & {
              date: Date;
              ballotsFinalizedAt: Date | null;
              ballotsApprovedAt: Date | null;
              contestCount: number;
            }
          >
      )
    ).map((row) => ({
      electionId: row.electionId,
      jurisdictionId: row.jurisdictionId,
      jurisdictionName: row.jurisdictionName,
      type: row.type,
      title: row.title,
      date: new DateWithoutTime(row.date.toISOString().split('T')[0]),
      countyName: row.countyName,
      state: row.state,
      externalSource: row.externalSource || undefined,
      status: ((): ElectionStatus => {
        if (row.contestCount === 0) return 'notStarted';
        if (row.ballotsApprovedAt) return 'ballotsApproved';
        if (row.ballotsFinalizedAt) return 'ballotsFinalized';
        return 'inProgress';
      })(),
    }));
  }

  async getElection(electionId: ElectionId): Promise<ElectionRecord> {
    return await this.db.withClient(async (client) => {
      const electionRow = (
        await client.query(
          `
            select
              jurisdiction_id as "jurisdictionId",
              type,
              title,
              date,
              county_name as "countyName",
              county_id as "countyId",
              state,
              seal,
              signature,
              system_settings_data as "systemSettingsData",
              ballot_paper_size as "ballotPaperSize",
              ballot_template_id as "ballotTemplateId",
              ballots_finalized_at as "ballotsFinalizedAt",
              created_at as "createdAt",
              ballot_language_codes as "ballotLanguageCodes",
              last_exported_ballot_hash as "lastExportedBallotHash",
              external_source as "externalSource"
            from elections
            where id = $1
          `,
          electionId
        )
      ).rows[0] as {
        jurisdictionId: string;
        type: ElectionType;
        title: string;
        date: Date;
        countyName: string;
        countyId: string;
        state: string;
        seal: string;
        signature: Signature | null;
        systemSettingsData: string;
        ballotPaperSize: HmpbBallotPaperSize;
        ballotTemplateId: BallotTemplateId;
        ballotsFinalizedAt: Date | null;
        createdAt: Date;
        ballotLanguageCodes: LanguageCode[];
        lastExportedBallotHash: string | null;
        externalSource: ExternalElectionSource | null;
      };
      assert(electionRow, 'Election not found');

      const districts = (
        await client.query(
          `
            select
              id,
              name
            from districts
            where election_id = $1
            order by name collate natural_sort
          `,
          electionId
        )
      ).rows as District[];

      const precinctRows = (
        await client.query(
          `
            select
              id,
              name,
              array_remove(array_agg(district_id ORDER BY district_id), NULL) as "districtIds"
            from precincts
            left join districts_precincts on districts_precincts.precinct_id = precincts.id
            where election_id = $1
            group by precincts.id
            order by precincts.name collate natural_sort
          `,
          electionId
        )
      ).rows as Array<{
        id: PrecinctId;
        name: string;
        districtIds: DistrictId[];
      }>;
      const precinctSplitRows = (
        await client.query(
          `
            select
              precinct_splits.id,
              precinct_id as "precinctId",
              precinct_splits.name,
              nh_options as "nhOptions",
              array_remove(array_agg(district_id ORDER BY district_id), NULL) as "districtIds"
            from precinct_splits
            join precincts on precinct_splits.precinct_id = precincts.id
            left join districts_precinct_splits on districts_precinct_splits.precinct_split_id = precinct_splits.id
            where precincts.election_id = $1
            group by precinct_splits.id
            order by precinct_splits.name collate natural_sort
          `,
          electionId
        )
      ).rows as Array<{
        id: string;
        precinctId: PrecinctId;
        name: string;
        nhOptions: NhPrecinctSplitOptions;
        districtIds: DistrictId[];
      }>;
      const precincts: Precinct[] = precinctRows.map((row) => {
        const splits = precinctSplitRows
          .filter((split) => split.precinctId === row.id)
          .map((split) => ({
            id: split.id,
            name: split.name,
            districtIds: split.districtIds,
            ...split.nhOptions,
          }));
        return splits.length > 0
          ? { id: row.id, name: row.name, splits }
          : { id: row.id, name: row.name, districtIds: row.districtIds };
      });

      const parties = (
        await client.query(
          `
            select
              id,
              name,
              full_name as "fullName",
              abbrev
            from parties
            where election_id = $1
            order by name
          `,
          electionId
        )
      ).rows as Party[];

      const contestRows = (
        await client.query(
          `
            select
              id,
              title,
              type,
              district_id as "districtId",
              seats,
              allow_write_ins as "allowWriteIns",
              party_id as "partyId",
              term_description as "termDescription",
              description,
              yes_option_id as "yesOptionId",
              yes_option_label as "yesOptionLabel",
              no_option_id as "noOptionId",
              no_option_label as "noOptionLabel",
              additional_options as "additionalOptions"
            from contests
            where election_id = $1
            order by ballot_order
          `,
          electionId
        )
      ).rows as Array<{
        id: string;
        title: string;
        type: AnyContest['type'];
        districtId: DistrictId;
        seats: number | null;
        allowWriteIns: boolean | null;
        partyId: PartyId | null;
        termDescription: string | null;
        description: string | null;
        yesOptionId: string | null;
        yesOptionLabel: string | null;
        noOptionId: string | null;
        noOptionLabel: string | null;
        additionalOptions: YesNoOption[] | null;
      }>;
      const candidateRows = (
        await client.query(
          `
            select
              candidates.id,
              contest_id as "contestId",
              first_name as "firstName",
              middle_name as "middleName",
              last_name as "lastName",
              array_remove(array_agg(candidates_parties.party_id ORDER BY candidates_parties.party_id), NULL) as "partyIds"
            from candidates
            join contests on candidates.contest_id = contests.id
            left join candidates_parties on candidates_parties.candidate_id = candidates.id
            where contests.election_id = $1
            group by candidates.id
            order by candidates.ballot_order
          `,
          electionId
        )
      ).rows as Array<{
        id: CandidateId;
        contestId: string;
        firstName: string | null;
        middleName: string | null;
        lastName: string | null;
        partyIds: PartyId[];
      }>;
      const contests: AnyContest[] = contestRows.map((row) => {
        switch (row.type) {
          case 'candidate': {
            const candidates: Candidate[] = candidateRows
              .filter((candidate) => candidate.contestId === row.id)
              .map((candidate) => ({
                id: candidate.id,
                firstName: candidate.firstName || undefined,
                middleName: candidate.middleName || undefined,
                lastName: candidate.lastName || undefined,
                name: [
                  candidate.firstName,
                  candidate.middleName,
                  candidate.lastName,
                ]
                  .filter(Boolean)
                  .join(' '),
                partyIds:
                  candidate.partyIds.length > 0
                    ? candidate.partyIds
                    : undefined,
              }));
            return typedAs<CandidateContest>({
              id: row.id,
              title: row.title,
              type: row.type,
              districtId: row.districtId,
              seats: assertDefined(row.seats),
              allowWriteIns: assertDefined(row.allowWriteIns),
              partyId: row.partyId ?? undefined,
              termDescription: row.termDescription ?? undefined,
              candidates,
            });
          }
          case 'yesno': {
            return typedAs<YesNoContest>({
              id: row.id,
              title: row.title,
              type: row.type,
              districtId: row.districtId,
              description: assertDefined(row.description),
              yesOption: {
                id: assertDefined(row.yesOptionId),
                label: assertDefined(row.yesOptionLabel),
              },
              noOption: {
                id: assertDefined(row.noOptionId),
                label: assertDefined(row.noOptionLabel),
              },
              additionalOptions: row.additionalOptions ?? undefined,
            });
          }
          default: {
            /* istanbul ignore next - @preserve */
            return throwIllegalValue(row.type);
          }
        }
      });

      const ballotLanguageConfigs = electionRow.ballotLanguageCodes.map(
        (l): BallotLanguageConfig => ({ languages: [l] })
      );

      const ballotStyles = generateBallotStyles({
        ballotLanguageConfigs,
        contests,
        electionType: electionRow.type,
        parties,
        precincts,
        ballotTemplateId: electionRow.ballotTemplateId,
        electionId,
      });

      // Fill in our precinct/ballot style overrides in the VXF election format.
      // This is important for pieces of the code that rely on the VXF election
      // (e.g. rendering ballots)
      const election: Election = {
        id: electionId,
        type: electionRow.type,
        title: electionRow.title,
        date: new DateWithoutTime(electionRow.date.toISOString().split('T')[0]),
        county: {
          id: electionRow.countyId,
          name: electionRow.countyName,
        },
        state: electionRow.state,
        seal: electionRow.seal,
        // Only include signature for the NhBallot
        signature:
          electionRow.ballotTemplateId === 'NhBallot'
            ? electionRow.signature || undefined
            : undefined,
        districts,
        precincts,
        ballotStyles,
        parties,
        contests,
        ballotLayout: {
          paperSize: electionRow.ballotPaperSize,
          metadataEncoding: 'qr-code',
        },
        ballotStrings: {},
      };

      const systemSettings = safeParseSystemSettings(
        electionRow.systemSettingsData
      ).unsafeUnwrap();

      return {
        election,
        precincts,
        ballotStyles,
        systemSettings,
        ballotTemplateId: electionRow.ballotTemplateId,
        createdAt: electionRow.createdAt.toISOString(),
        ballotLanguageConfigs,
        ballotsFinalizedAt: electionRow.ballotsFinalizedAt,
        jurisdictionId: electionRow.jurisdictionId,
        lastExportedBallotHash: electionRow.lastExportedBallotHash || undefined,
        externalSource: electionRow.externalSource || undefined,
      };
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
    const parseResult = safeParseElectionDefinition(row.electionData);
    if (parseResult.isErr()) {
      return err('election-out-of-date');
    }
    const electionDefinition = parseResult.ok();

    // Verify the ballot hash matches the sha256 of the election data
    assert(electionDefinition.ballotHash === row.ballotHash);

    return ok(electionDefinition);
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

  private async generateUniqueElectionCopyTitle(
    client: Client,
    jurisdictionId: string,
    election: Election
  ): Promise<string> {
    if (election.title === '') {
      return election.title;
    }
    let electionTitle = election.title;
    let copyIndex = 0;
    while (
      (
        await client.query(
          `
          select exists(
            select 1 from elections
            where jurisdiction_id = $1 and title = $2 and date = $3
          )
        `,
          jurisdictionId,
          electionTitle,
          election.date.toISOString()
        )
      ).rows[0].exists
    ) {
      copyIndex += 1;
      const copyPrefix = copyIndex > 1 ? `(Copy ${copyIndex})` : '(Copy)';
      electionTitle = `${copyPrefix} ${election.title}`;
    }
    return electionTitle;
  }

  async createElection({
    jurisdictionId,
    election,
    ballotTemplateId,
    systemSettings,
    externalSource,
  }: {
    jurisdictionId: string;
    election: Election;
    ballotTemplateId: BallotTemplateId;
    systemSettings: SystemSettings;
    externalSource?: ExternalElectionSource;
  }): Promise<void> {
    await this.db.withClient((client) =>
      client.withTransaction(async () => {
        const electionTitle = await this.generateUniqueElectionCopyTitle(
          client,
          jurisdictionId,
          election
        );
        await client.query(
          `
          insert into elections (
            id,
            jurisdiction_id,
            type,
            title,
            date,
            county_name,
            county_id,
            state,
            seal,
            signature,
            ballot_paper_size,
            ballot_template_id,
            ballot_language_codes,
            system_settings_data,
            external_source
          )
          values (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            $11,
            $12,
            $13,
            $14,
            $15
          )
        `,
          election.id,
          jurisdictionId,
          election.type,
          electionTitle,
          election.date.toISOString(),
          election.county.name,
          election.county.id,
          election.state,
          election.seal,
          election.signature ? JSON.stringify(election.signature) : null,
          election.ballotLayout.paperSize,
          ballotTemplateId,
          DEFAULT_LANGUAGE_CODES,
          JSON.stringify(systemSettings),
          externalSource
        );
        for (const district of election.districts) {
          await insertDistrict(client, election.id, district);
        }
        for (const precinct of election.precincts) {
          await insertPrecinct(client, election.id, precinct);
        }
        for (const party of election.parties) {
          await insertParty(client, election.id, party);
        }
        for (const contest of election.contests) {
          await insertContest(client, election.id, contest);
        }
        return true;
      })
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

  async updateElectionInfo(
    electionInfo: ElectionInfo
  ): Promise<Result<void, DuplicateElectionError>> {
    try {
      const { rowCount } = await this.db.withClient((client) =>
        client.query(
          `
          update elections
          set
            type = $1,
            title = $2,
            date = $3,
            county_name = $4,
            state = $5,
            seal = $6,
            signature = $7,
            ballot_language_codes = $8
          where id = $9
        `,
          electionInfo.type,
          electionInfo.title,
          electionInfo.date.toISOString(),
          electionInfo.countyName,
          electionInfo.state,
          electionInfo.seal,
          electionInfo.signatureImage
            ? JSON.stringify({
                image: electionInfo.signatureImage,
                caption: electionInfo.signatureCaption,
              })
            : null,
          electionInfo.languageCodes,
          electionInfo.electionId
        )
      );
      assert(rowCount === 1, 'Election not found');
      return ok();
    } catch (error) {
      if (
        isDuplicateKeyError(
          error,
          'elections_jurisdiction_id_title_date_unique_index'
        )
      ) {
        return err('duplicate-title-and-date');
      }
      /* istanbul ignore next - @preserve */
      throw error;
    }
  }

  async listDistricts(electionId: ElectionId): Promise<readonly District[]> {
    const { election } = await this.getElection(electionId);
    return election.districts;
  }

  async createDistrict(
    client: Client,
    electionId: ElectionId,
    district: District
  ): Promise<Result<void, DuplicateDistrictError>> {
    try {
      await insertDistrict(client, electionId, district);
      return ok();
    } catch (error) {
      if (
        isDuplicateKeyError(error, 'districts_election_id_name_unique_index')
      ) {
        return err({ code: 'duplicate-name', districtId: district.id });
      }
      /* istanbul ignore next - @preserve */
      throw error;
    }
  }

  async updateDistrict(
    client: Client,
    electionId: ElectionId,
    district: District
  ): Promise<Result<void, DuplicateDistrictError>> {
    try {
      const { rowCount } = await client.query(
        `
          update districts
          set name = $1
          where id = $2 and election_id = $3
        `,
        district.name,
        district.id,
        electionId
      );

      assert(rowCount === 1, 'District not found');

      return ok();
    } catch (error) {
      if (
        isDuplicateKeyError(error, 'districts_election_id_name_unique_index')
      ) {
        return err({ code: 'duplicate-name', districtId: district.id });
      }
      /* istanbul ignore next - @preserve */
      throw error;
    }
  }

  async deleteDistrict(
    client: Client,
    electionId: ElectionId,
    districtId: DistrictId
  ): Promise<void> {
    await client.query(
      `
        delete from districts
        where id = $1 and election_id = $2
      `,
      districtId,
      electionId
    );
  }

  async updateDistricts(input: {
    electionId: ElectionId;
    deletedDistrictIds?: string[];
    newDistricts?: District[];
    updatedDistricts?: District[];
  }): Promise<Result<void, DuplicateDistrictError>> {
    const { electionId } = input;

    return this.db.withClient(async (client) => {
      let res: Result<void, DuplicateDistrictError> | undefined;

      await client.withTransaction(async () => {
        for (const id of input.deletedDistrictIds || []) {
          await this.deleteDistrict(client, electionId, id);
        }

        for (const d of input.updatedDistricts || []) {
          const district = unsafeParse(DistrictSchema, d);
          res = await this.updateDistrict(client, electionId, district);

          if (res.isErr()) return false;
        }

        for (const d of input.newDistricts || []) {
          const district = unsafeParse(DistrictSchema, d);
          res = await this.createDistrict(client, electionId, district);

          if (res.isErr()) return false;
        }

        res = ok();

        return true;
      });

      return assertDefined(res);
    });
  }

  async listPrecincts(electionId: ElectionId): Promise<readonly Precinct[]> {
    const { election } = await this.getElection(electionId);
    return election.precincts;
  }

  private handlePrecinctError(
    error: unknown
  ): Result<void, DuplicatePrecinctError> {
    if (
      error instanceof Error &&
      error.message === 'duplicate-split-districts'
    ) {
      return err('duplicate-split-districts');
    }
    if (isDuplicateKeyError(error, 'precincts_election_id_name_unique_index')) {
      return err('duplicate-precinct-name');
    }
    if (
      isDuplicateKeyError(
        error,
        'precinct_splits_precinct_id_name_unique_index'
      )
    ) {
      return err('duplicate-split-name');
    }
    throw error;
  }

  async createPrecinct(
    electionId: ElectionId,
    precinct: Precinct
  ): Promise<Result<void, DuplicatePrecinctError>> {
    try {
      await this.db.withClient((client) =>
        client.withTransaction(async () => {
          await insertPrecinct(client, electionId, precinct);
          return true;
        })
      );
      return ok();
    } catch (error) {
      return this.handlePrecinctError(error);
    }
  }

  async updatePrecinct(
    electionId: ElectionId,
    precinct: Precinct
  ): Promise<Result<void, DuplicatePrecinctError>> {
    try {
      await this.db.withClient((client) =>
        client.withTransaction(async () => {
          // It's safe to delete and re-insert the precinct because:
          // 1. The IDs of precincts/splits are stable
          // 2. Precincts/splits are leaf nodes. There are no other tables with
          // foreign keys that reference precincts/splits, so we don't need to
          // worry about ON DELETE triggers.
          const { rowCount } = await client.query(
            `
            delete from precincts
            where id = $1 and election_id = $2
          `,
            precinct.id,
            electionId
          );
          assert(rowCount === 1, 'Precinct not found');
          await insertPrecinct(client, electionId, precinct);
          return true;
        })
      );
      return ok();
    } catch (error) {
      return this.handlePrecinctError(error);
    }
  }

  async deletePrecinct(
    electionId: ElectionId,
    precinctId: PrecinctId
  ): Promise<void> {
    const { rowCount } = await this.db.withClient((client) =>
      client.query(
        `
          delete from precincts
          where id = $1 and election_id = $2
        `,
        precinctId,
        electionId
      )
    );
    assert(rowCount === 1, 'Precinct not found');
  }

  async listBallotStyles(
    electionId: ElectionId
  ): Promise<readonly BallotStyle[]> {
    const { election } = await this.getElection(electionId);
    return election.ballotStyles;
  }

  async listParties(electionId: ElectionId): Promise<readonly Party[]> {
    const { election } = await this.getElection(electionId);
    return election.parties;
  }

  private handlePartyError(
    partyId: string,
    error: unknown
  ): Result<void, DuplicatePartyError> {
    if (isDuplicateKeyError(error, 'parties_election_id_name_unique_index')) {
      return err({ code: 'duplicate-name', partyId });
    }
    if (
      isDuplicateKeyError(error, 'parties_election_id_full_name_unique_index')
    ) {
      return err({ code: 'duplicate-full-name', partyId });
    }
    if (isDuplicateKeyError(error, 'parties_election_id_abbrev_unique_index')) {
      return err({ code: 'duplicate-abbrev', partyId });
    }
    throw error;
  }

  async createParty(
    client: Client,
    electionId: ElectionId,
    party: Party
  ): Promise<Result<void, DuplicatePartyError>> {
    try {
      await insertParty(client, electionId, party);
      return ok();
    } catch (error) {
      return this.handlePartyError(party.id, error);
    }
  }

  async updateParty(
    client: Client,
    electionId: ElectionId,
    party: Party
  ): Promise<Result<void, DuplicatePartyError>> {
    try {
      const { rowCount } = await client.query(
        `
          update parties
          set
            name = $1,
            full_name = $2,
            abbrev = $3
          where id = $4 and election_id = $5
        `,
        party.name,
        party.fullName,
        party.abbrev,
        party.id,
        electionId
      );

      assert(rowCount === 1, 'Party not found');

      return ok();
    } catch (error) {
      return this.handlePartyError(party.id, error);
    }
  }

  async deleteParty(
    client: Client,
    electionId: ElectionId,
    partyId: string
  ): Promise<void> {
    await client.query(
      `
        delete from parties
        where id = $1 and election_id = $2
      `,
      partyId,
      electionId
    );
  }

  async updateParties(input: {
    electionId: ElectionId;
    deletedPartyIds?: string[];
    newParties?: Party[];
    updatedParties?: Party[];
  }): Promise<Result<void, DuplicatePartyError>> {
    let res: Result<void, DuplicatePartyError> | undefined;

    await this.db.withClient((client) =>
      client.withTransaction(async () => {
        for (const id of input.deletedPartyIds || []) {
          await this.deleteParty(client, input.electionId, id);
        }

        for (const p of input.updatedParties || []) {
          const party = unsafeParse(PartySchema, p);
          res = await this.updateParty(client, input.electionId, party);

          if (res.isErr()) return false;
        }

        for (const p of input.newParties || []) {
          const party = unsafeParse(PartySchema, p);
          res = await this.createParty(client, input.electionId, party);

          if (res.isErr()) return false;
        }

        res = ok();

        return true;
      })
    );

    return assertDefined(res);
  }

  async listContests(electionId: ElectionId): Promise<readonly AnyContest[]> {
    const { election } = await this.getElection(electionId);
    return election.contests;
  }

  private handleContestError(
    error: unknown
  ): Result<void, DuplicateContestError> {
    if (isDuplicateKeyError(error, 'contests_unique_index')) {
      return err('duplicate-contest');
    }
    if (isDuplicateKeyError(error, 'candidates_unique_index')) {
      return err('duplicate-candidate');
    }
    throw error;
  }

  async createContest(
    electionId: ElectionId,
    contest: AnyContest
  ): Promise<Result<void, DuplicateContestError>> {
    if (
      contest.type === 'yesno' &&
      contest.yesOption.label === contest.noOption.label
    ) {
      return err('duplicate-option');
    }
    try {
      await this.db.withClient((client) =>
        client.withTransaction(async () => {
          await insertContest(client, electionId, contest);
          return true;
        })
      );
      return ok();
    } catch (error) {
      return this.handleContestError(error);
    }
  }

  async updateContest(
    electionId: ElectionId,
    contest: AnyContest
  ): Promise<Result<void, DuplicateContestError>> {
    if (
      contest.type === 'yesno' &&
      contest.yesOption.label === contest.noOption.label
    ) {
      return err('duplicate-option');
    }
    try {
      await this.db.withClient((client) =>
        client.withTransaction(async () => {
          // It's safe to delete and re-insert the contest because:
          // 1. The IDs of contests/candidates are stable
          // 2. Contests/candidates are leaf nodes. There are no other tables with
          // foreign keys that reference contests/candidates, so we don't need to
          // worry about ON DELETE triggers.
          const { rowCount, rows } = await client.query(
            `
            delete from contests
            where id = $1 and election_id = $2
            returning ballot_order as "ballotOrder"
          `,
            contest.id,
            electionId
          );
          assert(rowCount === 1, 'Contest not found');
          const { ballotOrder } = rows[0] as { ballotOrder: number };
          await insertContest(client, electionId, contest, ballotOrder);
          return true;
        })
      );
      return ok();
    } catch (error) {
      return this.handleContestError(error);
    }
  }

  async reorderContests(
    electionId: ElectionId,
    contestIds: string[]
  ): Promise<void> {
    await this.db.withClient((client) =>
      client.withTransaction(async () => {
        const existingContestIds = (
          await client.query(
            `select id from contests where election_id = $1`,
            electionId
          )
        ).rows.map((row) => row.id);
        assert(
          contestIds.length === existingContestIds.length,
          'Contest list is out of date'
        );
        for (const contestId of contestIds) {
          const { rowCount } = await client.query(
            `
            update contests
            set ballot_order = DEFAULT
            where id = $1 and election_id = $2
          `,
            contestId,
            electionId
          );
          assert(rowCount === 1, `Contest not found: ${contestId}`);
        }
        return true;
      })
    );
  }

  async deleteContest(
    electionId: ElectionId,
    contestId: string
  ): Promise<void> {
    const { rowCount } = await this.db.withClient((client) =>
      // We don't worry about updating ballot_order for other contests because
      // they will still be in the correct order even with a gap.
      client.query(
        `
          delete from contests
          where id = $1 and election_id = $2
        `,
        contestId,
        electionId
      )
    );
    assert(rowCount === 1, 'Contest not found');
  }

  async getBallotLayoutSettings(
    electionId: ElectionId
  ): Promise<{ paperSize: HmpbBallotPaperSize; compact: boolean }> {
    const row = (
      await this.db.withClient((client) =>
        client.query(
          `
            select
              ballot_paper_size as "paperSize",
              ballot_compact as "compact"
            from elections
            where id = $1
          `,
          electionId
        )
      )
    ).rows[0];
    assert(row, 'Election not found');
    return row;
  }

  async updateBallotLayoutSettings(
    electionId: ElectionId,
    paperSize: HmpbBallotPaperSize,
    compact: boolean
  ): Promise<void> {
    const { rowCount } = await this.db.withClient((client) =>
      client.query(
        `
          update elections
          set
            ballot_paper_size = $1,
            ballot_compact = $2
          where id = $3
        `,
        paperSize,
        compact,
        electionId
      )
    );
    assert(rowCount === 1, 'Election not found');
  }

  async deleteElection(electionId: ElectionId): Promise<void> {
    await this.db.withClient((client) =>
      client.query(`delete from elections where id = $1`, electionId)
    );
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

  async getBallotsApprovedAt(electionId: ElectionId): Promise<Date | null> {
    const row: { ballots_approved_at: Date } | undefined = (
      await this.db.withClient((client) =>
        client.query(
          `select ballots_approved_at from elections where id = $1`,
          electionId
        )
      )
    ).rows[0];

    return row?.ballots_approved_at || null;
  }

  async setBallotsApprovedAt(p: {
    approvedAt: Date | null;
    electionId: ElectionId;
  }): Promise<void> {
    await this.db.withClient((client) =>
      client.query(
        `update elections set ballots_approved_at = $1 where id = $2`,
        p.approvedAt,
        p.electionId
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
      assert(ids.length <= 1, `Too many running background tasks! IDs=${ids.join(', ')}`);
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

  async getPollsStatusForElection(
    election: Election,
    ballotHash: string,
    isLive: boolean
  ): Promise<Record<string, QuickReportedPollStatus[]>> {
    const queryParams = [ballotHash, election.id, isLive];
    const rows = (
      await this.db.withClient((client) =>
        client.query(
          `
            select
              polls_state as "pollsState",
              machine_id as "machineId",
              signed_at as "signedAt",
              precinct_id as "precinctId"
            from (
              select
                polls_state,
                machine_id,
                signed_at,
                precinct_id,
                row_number() over (partition by machine_id, ballot_hash order by signed_at desc) as rn
              from results_reports
              where
                ballot_hash = $1 and
                election_id = $2 and
                is_live_mode = $3
            ) ranked_results
            where rn = 1
            order by signed_at desc
          `,
          ...queryParams
        )
      )
    ).rows as Array<{
      pollsState: PollsStateSupportsLiveReporting;
      machineId: string;
      precinctId: string | null;
      signedAt: Date;
    }>;
    const reportsByPrecinctId: Record<string, QuickReportedPollStatus[]> = {};
    for (const precinct of election.precincts) {
      reportsByPrecinctId[precinct.id] = [];
    }

    for (const status of rows) {
      if (
        !status.precinctId &&
        !reportsByPrecinctId[ALL_PRECINCTS_REPORT_KEY]
      ) {
        reportsByPrecinctId[ALL_PRECINCTS_REPORT_KEY] = [];
      }
      reportsByPrecinctId[status.precinctId ?? ALL_PRECINCTS_REPORT_KEY].push({
        machineId: status.machineId,
        signedTimestamp: status.signedAt,
        precinctSelection: status.precinctId
          ? singlePrecinctSelectionFor(status.precinctId)
          : ALL_PRECINCTS_SELECTION,
        pollsState: status.pollsState,
      });
    }
    return reportsByPrecinctId;
  }

  async getLiveReportTalliesForElection(
    election: Election,
    electionBallotHash: string,
    precinctSelection: PrecinctSelection,
    isLive: boolean
  ): Promise<{
    contestResults: Record<ContestId, ContestResults>;
    machinesReporting: string[];
  }> {
    let precinctWhereClause = '';
    const queryParams = [electionBallotHash, election.id, isLive];
    if (precinctSelection.kind === 'SinglePrecinct') {
      precinctWhereClause = `
        and precinct_id = $4
      `;
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
            from results_reports
            where
              ballot_hash = $1 and
              election_id = $2 and
              polls_state = 'polls_closed_final' and
              is_live_mode = $3
              ${precinctWhereClause}
            order by signed_at desc
          `,
          ...queryParams
        )
      )
    ).rows as Array<{
      encodedCompressedTally: string;
      machineId: string;
      precinctId: string | null;
    }>;
    const contestResults = combineAndDecodeCompressedElectionResults({
      election,
      encodedCompressedTallies: rows.map((r) => ({
        encodedTally: r.encodedCompressedTally,
        precinctSelection: r.precinctId
          ? singlePrecinctSelectionFor(r.precinctId)
          : ALL_PRECINCTS_SELECTION,
      })),
    });
    const contestIdsForPrecinct = getContestsForPrecinctAndElection(
      election,
      precinctSelection
    ).map((contest) => contest.id);

    const filteredContestResults: Record<ContestId, ContestResults> = {};
    for (const contestId of contestIdsForPrecinct) {
      assert(contestId in contestResults, 'Missing contest results');
      filteredContestResults[contestId] = contestResults[contestId];
    }

    return {
      contestResults: filteredContestResults,
      machinesReporting: rows.map((r) => r.machineId),
    };
  }

  // Save the provided quick results report, overwriting one for the given election ballot hash, machine and isLive toggle if one already exists.
  async saveQuickResultsReportingTally({
    electionId,
    ballotHash,
    encodedCompressedTally,
    machineId,
    isLive,
    signedTimestamp,
    precinctId,
    pollsState,
  }: {
    electionId: string;
    ballotHash: string;
    encodedCompressedTally: string;
    machineId: string;
    isLive: boolean;
    signedTimestamp: Date;
    precinctId?: string;
    pollsState: PollsState;
  }): Promise<void> {
    await this.db.withClient((client) =>
      client.withTransaction(async () => {
        const { rowCount } = await client.query(
          `
            insert into results_reports (
              ballot_hash,
              election_id,
              machine_id,
              is_live_mode,
              signed_at,
              encoded_compressed_tally,
              precinct_id,
              polls_state
            ) values ($1, $2, $3, $4, $5, $6, $7, $8)
            on conflict (ballot_hash, machine_id, is_live_mode, polls_state)
            do update set
              signed_at = excluded.signed_at,
              encoded_compressed_tally = excluded.encoded_compressed_tally,
              precinct_id = excluded.precinct_id,
              polls_state = excluded.polls_state
          `,
          ballotHash,
          electionId,
          machineId,
          isLive,
          signedTimestamp.toISOString(),
          encodedCompressedTally,
          precinctId || null,
          pollsState
        );
        assert(rowCount === 1, 'Failed to insert results report');

        // Clean up partial reports, if relevant, for this machine.
        await client.query(
          `
          delete from results_reports_partial
          where
            ballot_hash = $1 and
            machine_id = $2 and
            is_live_mode = $3 and
            polls_state = $4
        `,
          ballotHash,
          machineId,
          isLive,
          pollsState
        );
        return true;
      })
    );
  }

  // Save a single partial page of a multi-page QR results report. Each page is
  // stored separately in `results_reports_partial` and identified by its
  // page_index and num_pages. This allows assembling the final report when the
  // last page is received.
  async savePartialQuickResultsReportingPage({
    electionId,
    ballotHash,
    encodedCompressedTally,
    machineId,
    isLive,
    signedTimestamp,
    precinctId,
    pollsState,
    pageIndex,
    numPages,
  }: {
    electionId: string;
    ballotHash: string;
    encodedCompressedTally: string;
    machineId: string;
    isLive: boolean;
    signedTimestamp: Date;
    precinctId?: string;
    pollsState: PollsState;
    pageIndex: number;
    numPages: number;
  }): Promise<void> {
    await this.db.withClient((client) =>
      client.withTransaction(async () => {
        // If any existing partial row has a different num_pages, or precinct_id delete it so the new report will override.
        await client.query(
          `
          delete from results_reports_partial
          where
          ballot_hash = $1 and
          machine_id = $2 and
          is_live_mode = $3 and
          polls_state = $4 and
          (num_pages != $5 OR precinct_id IS DISTINCT FROM $6)
            `,
          ballotHash,
          machineId,
          isLive,
          pollsState,
          numPages,
          precinctId || null
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
              precinct_id,
              polls_state,
              page_index,
              num_pages
            ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            on conflict (ballot_hash, machine_id, is_live_mode, polls_state, page_index)
            do update set
              signed_at = excluded.signed_at,
              encoded_compressed_tally = excluded.encoded_compressed_tally,
              precinct_id = excluded.precinct_id,
              polls_state = excluded.polls_state,
              num_pages = excluded.num_pages
          `,
          ballotHash,
          electionId,
          machineId,
          isLive,
          signedTimestamp.toISOString(),
          encodedCompressedTally,
          precinctId || null,
          pollsState,
          pageIndex,
          numPages
        );
        assert(rowCount === 1, 'Failed to insert partial results report');
        return true;
      })
    );
  }

  // Fetch all partial pages for the given ballot_hash/machine/is_live/polls_state
  // combination ordered by page_index. Returns rows with encoded_compressed_tally
  // and precinct_id.
  async fetchPartialPages({
    ballotHash,
    machineId,
    isLive,
    pollsState,
  }: {
    ballotHash: string;
    machineId: string;
    isLive: boolean;
    pollsState: PollsState;
  }): Promise<
    Array<{
      encodedCompressedTally: string;
      precinctId: string | null;
      numPages: number;
      pageIndex: number;
    }>
  > {
    return await this.db.withClient(async (client) => {
      const res = await client.query(
        `
          select
            encoded_compressed_tally as "encodedCompressedTally",
            precinct_id as "precinctId",
            page_index as "pageIndex",
            num_pages as "numPages"
          from results_reports_partial
          where
            ballot_hash = $1 and
            machine_id = $2 and
            is_live_mode = $3 and
            polls_state = $4
          order by page_index asc
        `,
        ballotHash,
        machineId,
        isLive,
        pollsState
      );
      return res.rows as Array<{
        encodedCompressedTally: string;
        precinctId: string | null;
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
          `
          delete from results_reports
          where election_id = $1
        `,
          electionId
        );
        await client.query(
          `delete from results_reports_partial
        where election_id = $1
      `,
          electionId
        );
        return true;
      })
    );
  }
}
