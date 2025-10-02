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
} from '@votingworks/basics';
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
  TtsString,
  TtsStringKey,
  safeParse,
  PhoneticWordsSchema,
  ContestId,
  PrecinctSelection,
} from '@votingworks/types';
import {
  singlePrecinctSelectionFor,
  ALL_PRECINCTS_SELECTION,
  combineAndDecodeCompressedElectionResults,
  getContestsForPrecinctAndElection,
} from '@votingworks/utils';
import { v4 as uuid } from 'uuid';
import { BaseLogger } from '@votingworks/logging';
import { BallotTemplateId } from '@votingworks/hmpb';
import { DatabaseError } from 'pg';
import { ContestResults } from '@votingworks/types/src/tabulation';
import {
  BallotStyle,
  convertToVxfBallotStyle,
  ElectionInfo,
  ElectionListing,
  Org,
} from './types';
import { generateBallotStyles } from './ballot_styles';
import { Db } from './db/db';
import { Bindable, Client } from './db/client';

export interface ElectionRecord {
  orgId: string;
  election: Election;
  ballotStyles: BallotStyle[];
  systemSettings: SystemSettings;
  createdAt: Iso8601Timestamp;
  ballotLanguageConfigs: BallotLanguageConfigs;
  ballotTemplateId: BallotTemplateId;
  ballotsFinalizedAt: Date | null;
  lastExportedBallotHash?: string;
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
}

export interface BackgroundTaskProgress {
  label: string;
  progress: number;
  total: number;
}

const getBackgroundTasksBaseQuery = `
  select
    id,
    task_name as "taskName",
    payload,
    created_at as "createdAt",
    started_at as "startedAt",
    completed_at as "completedAt",
    progress,
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
  progress: BackgroundTaskProgress | null;
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
    progress: row.progress ?? undefined,
    error: row.error ?? undefined,
  };
}

export interface BackgroundTaskMetadata {
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

export type DuplicateDistrictError = 'duplicate-name';

export type DuplicatePrecinctError =
  | 'duplicate-precinct-name'
  | 'duplicate-split-name';

export type DuplicatePartyError =
  | 'duplicate-name'
  | 'duplicate-full-name'
  | 'duplicate-abbrev';

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
            ballot_order
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, ${
            ballotOrder ? '$11' : 'DEFAULT'
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

export class Store {
  constructor(
    private readonly db: Db,
    private readonly logger: BaseLogger
  ) {}

  static new(logger: BaseLogger): Store {
    return new Store(new Db(logger), logger);
  }

  /**
   * Takes the organizations from Auth0 (the source of truth) and caches them in
   * the database, adding/removing/updating records as necessary.
   */
  async syncOrganizationsCache(organizations: Org[]): Promise<void> {
    await this.db.withClient((client) =>
      client.withTransaction(async () => {
        // Add new orgs or update existing orgs
        // Relies on invariant that Auth0 org IDs never change
        for (const org of organizations) {
          const { rowCount } = await client.query(
            `
            insert into organizations (id, name)
            values ($1, $2)
            on conflict (id) do update
            set name = excluded.name
            `,
            org.id,
            org.name
          );
          assert(rowCount === 1, `Failed to insert or update org ${org.id}`);
        }

        if (organizations.length > 0) {
          // Delete orgs that are no longer in Auth0
          await client.query(
            `
            delete from organizations
            where not (id = any ($1))
            `,
            organizations.map((org) => org.id)
          );
        }

        return true;
      })
    );
  }

  async listOrganizations(): Promise<Org[]> {
    return await this.db.withClient(async (client) => {
      const orgRows = (
        await client.query(
          `
          select id, name
          from organizations
          `
        )
      ).rows as Array<{ id: string; name: string }>;
      return orgRows;
    });
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
        return 'ballotsFinalized';
      })(),
    }));
  }

  async getElection(electionId: ElectionId): Promise<ElectionRecord> {
    return await this.db.withClient(async (client) => {
      const electionRow = (
        await client.query(
          `
            select
              org_id as "orgId",
              type,
              title,
              date,
              jurisdiction,
              state,
              seal,
              signature,
              system_settings_data as "systemSettingsData",
              ballot_paper_size as "ballotPaperSize",
              ballot_template_id as "ballotTemplateId",
              ballots_finalized_at as "ballotsFinalizedAt",
              created_at as "createdAt",
              ballot_language_codes as "ballotLanguageCodes",
              last_exported_ballot_hash as "lastExportedBallotHash"
            from elections
            where id = $1
          `,
          electionId
        )
      ).rows[0] as {
        orgId: string;
        type: ElectionType;
        title: string;
        date: Date;
        jurisdiction: string;
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
            order by name
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
            order by precincts.name
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
            order by precinct_splits.name
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
              no_option_label as "noOptionLabel"
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
      });

      // Fill in our precinct/ballot style overrides in the VXF election format.
      // This is important for pieces of the code that rely on the VXF election
      // (e.g. rendering ballots)
      const election: Election = {
        id: electionId,
        type: electionRow.type,
        title: electionRow.title,
        date: new DateWithoutTime(electionRow.date.toISOString().split('T')[0]),
        // County ID needs to be deterministic, but doesn't actually get used anywhere
        county: { id: `${electionId}-county`, name: electionRow.jurisdiction },
        state: electionRow.state,
        seal: electionRow.seal,
        // Only include signature for the NhBallot
        signature:
          electionRow.ballotTemplateId === 'NhBallot'
            ? electionRow.signature || undefined
            : undefined,
        districts,
        precincts,
        ballotStyles: ballotStyles.map(convertToVxfBallotStyle),
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
        orgId: electionRow.orgId,
        lastExportedBallotHash: electionRow.lastExportedBallotHash || undefined,
      };
    });
  }

  async getElectionFromBallotHash(
    ballotHash: string
  ): Promise<ElectionRecord | undefined> {
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

    return this.getElection(electionId);
  }

  async getElectionOrgId(electionId: ElectionId): Promise<string> {
    const row = (
      await this.db.withClient((client) =>
        client.query(
          `
          select org_id as "orgId"
          from elections
          where id = $1
        `,
          electionId
        )
      )
    ).rows[0];
    assert(row, 'Election not found');
    return row.orgId;
  }

  private async generateUniqueElectionCopyTitle(
    client: Client,
    orgId: string,
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
            where org_id = $1 and title = $2 and date = $3
          )
        `,
          orgId,
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

  async createElection(
    orgId: string,
    election: Election,
    ballotTemplateId: BallotTemplateId,
    systemSettings = DEFAULT_SYSTEM_SETTINGS
  ): Promise<void> {
    await this.db.withClient((client) =>
      client.withTransaction(async () => {
        const electionTitle = await this.generateUniqueElectionCopyTitle(
          client,
          orgId,
          election
        );
        await client.query(
          `
          insert into elections (
            id,
            org_id,
            type,
            title,
            date,
            jurisdiction,
            state,
            seal,
            signature,
            ballot_paper_size,
            ballot_template_id,
            ballot_language_codes,
            system_settings_data
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
            $13
          )
        `,
          election.id,
          orgId,
          election.type,
          electionTitle,
          election.date.toISOString(),
          election.county.name,
          election.state,
          election.seal,
          election.signature ? JSON.stringify(election.signature) : null,
          election.ballotLayout.paperSize,
          ballotTemplateId,
          DEFAULT_LANGUAGE_CODES,
          JSON.stringify(systemSettings)
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
            jurisdiction = $4,
            state = $5,
            seal = $6,
            signature = $7,
            ballot_language_codes = $8
          where id = $9
        `,
          electionInfo.type,
          electionInfo.title,
          electionInfo.date.toISOString(),
          electionInfo.jurisdiction,
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
        isDuplicateKeyError(error, 'elections_org_id_title_date_unique_index')
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
    electionId: ElectionId,
    district: District
  ): Promise<Result<void, DuplicateDistrictError>> {
    try {
      await this.db.withClient(async (client) =>
        insertDistrict(client, electionId, district)
      );
      return ok();
    } catch (error) {
      if (
        isDuplicateKeyError(error, 'districts_election_id_name_unique_index')
      ) {
        return err('duplicate-name');
      }
      /* istanbul ignore next - @preserve */
      throw error;
    }
  }

  async updateDistrict(
    electionId: ElectionId,
    district: District
  ): Promise<Result<void, DuplicateDistrictError>> {
    try {
      const { rowCount } = await this.db.withClient((client) =>
        client.query(
          `
          update districts
          set name = $1
          where id = $2 and election_id = $3
        `,
          district.name,
          district.id,
          electionId
        )
      );
      assert(rowCount === 1, 'District not found');
      return ok();
    } catch (error) {
      if (
        isDuplicateKeyError(error, 'districts_election_id_name_unique_index')
      ) {
        return err('duplicate-name');
      }
      /* istanbul ignore next - @preserve */
      throw error;
    }
  }

  async deleteDistrict(
    electionId: ElectionId,
    districtId: DistrictId
  ): Promise<void> {
    const { rowCount } = await this.db.withClient((client) =>
      client.query(
        `
          delete from districts
          where id = $1 and election_id = $2
        `,
        districtId,
        electionId
      )
    );
    assert(rowCount === 1, 'District not found');
  }

  async listPrecincts(electionId: ElectionId): Promise<readonly Precinct[]> {
    const { election } = await this.getElection(electionId);
    return election.precincts;
  }

  private handlePrecinctError(
    error: unknown
  ): Result<void, DuplicatePrecinctError> {
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
  ): Promise<Result<void, 'duplicate-precinct-name' | 'duplicate-split-name'>> {
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

  async listBallotStyles(electionId: ElectionId): Promise<BallotStyle[]> {
    const { ballotStyles } = await this.getElection(electionId);
    return ballotStyles;
  }

  async listParties(electionId: ElectionId): Promise<readonly Party[]> {
    const { election } = await this.getElection(electionId);
    return election.parties;
  }

  private handlePartyError(error: unknown): Result<void, DuplicatePartyError> {
    if (isDuplicateKeyError(error, 'parties_election_id_name_unique_index')) {
      return err('duplicate-name');
    }
    if (
      isDuplicateKeyError(error, 'parties_election_id_full_name_unique_index')
    ) {
      return err('duplicate-full-name');
    }
    if (isDuplicateKeyError(error, 'parties_election_id_abbrev_unique_index')) {
      return err('duplicate-abbrev');
    }
    throw error;
  }

  async createParty(
    electionId: ElectionId,
    party: Party
  ): Promise<Result<void, DuplicatePartyError>> {
    try {
      await this.db.withClient((client) =>
        insertParty(client, electionId, party)
      );
      return ok();
    } catch (error) {
      return this.handlePartyError(error);
    }
  }

  async updateParty(
    electionId: ElectionId,
    party: Party
  ): Promise<Result<void, DuplicatePartyError>> {
    try {
      const { rowCount } = await this.db.withClient((client) =>
        client.query(
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
        )
      );
      assert(rowCount === 1, 'Party not found');
      return ok();
    } catch (error) {
      return this.handlePartyError(error);
    }
  }

  async deleteParty(electionId: ElectionId, partyId: string): Promise<void> {
    const { rowCount } = await this.db.withClient((client) =>
      client.query(
        `
          delete from parties
          where id = $1 and election_id = $2
        `,
        partyId,
        electionId
      )
    );
    assert(rowCount === 1, 'Party not found');
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
          'Invalid contest IDs'
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
    shouldExportAudio: boolean,
    shouldExportSampleBallots: boolean,
    numAuditIdBallots?: number
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
            shouldExportSampleBallots,
            numAuditIdBallots,
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

  async setElectionPackageExportInformation({
    electionId,
    electionPackageUrl,
    ballotHash,
  }: {
    electionId: ElectionId;
    electionPackageUrl: string;
    ballotHash: string;
  }): Promise<void> {
    await this.db.withClient((client) =>
      client.query(
        `
          update elections
          set election_package_url = $1,
              last_exported_ballot_hash = $2
          where id = $3
        `,
        electionPackageUrl,
        ballotHash,
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

  async requeueInterruptedBackgroundTasks(): Promise<void> {
    await this.db.withClient(async (client) =>
      client.query(`
        update background_tasks
        set started_at = null
        where started_at is not null and completed_at is null
      `)
    );
  }

  async ttsStringsGet(key: TtsStringKey): Promise<TtsString | null> {
    return this.db.withClient(async (client) => {
      const res = await client.query(
        `
          select
            export_source as "exportSource",
            phonetic,
            text
          from tts_strings
          where
            election_id = $1 and
            key = $2 and
            subkey = $3 and
            language_code = $4
        `,
        key.electionId,
        key.key,
        key.subkey,
        key.languageCode
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

  async ttsStringsSet(key: TtsStringKey, data: TtsString): Promise<void> {
    return this.db.withClient(async (client) => {
      await client.query(
        `
            insert into tts_strings (
              election_id,
              key,
              subkey,
              language_code,
              export_source,
              phonetic,
              text
            )
            values ($1, $2, $3, $4, $5, $6, $7)
            on conflict (election_id, key, subkey, language_code) do update set
              export_source = EXCLUDED.export_source,
              phonetic = EXCLUDED.phonetic,
              text = EXCLUDED.text
          `,
        key.electionId,
        key.key,
        key.subkey,
        key.languageCode,
        data.exportSource,
        JSON.stringify(data.phonetic),
        data.text
      );
    });
  }

  async getQuickResultsReportingTalliesForElection(
    election: ElectionRecord,
    precinctSelection: PrecinctSelection,
    isLive: boolean
  ): Promise<{
    contestResults: Record<ContestId, ContestResults>;
    machinesReporting: string[];
  }> {
    assert(
      election.lastExportedBallotHash !== undefined,
      'Election has not yet been exported.'
    );
    let precinctWhereClause = '';
    const queryParams = [
      election.lastExportedBallotHash,
      election.election.id,
      isLive,
    ];
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
      election: election.election,
      encodedCompressedTallies: rows.map((r) => ({
        encodedTally: r.encodedCompressedTally,
        precinctSelection: r.precinctId
          ? singlePrecinctSelectionFor(r.precinctId)
          : ALL_PRECINCTS_SELECTION,
      })),
    });
    const contestIdsForPrecinct = getContestsForPrecinctAndElection(
      election.election,
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
  }: {
    electionId: string;
    ballotHash: string;
    encodedCompressedTally: string;
    machineId: string;
    isLive: boolean;
    signedTimestamp: Date;
    precinctId?: string;
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
              precinct_id
            ) values ($1, $2, $3, $4, $5, $6, $7)
            on conflict (ballot_hash, machine_id, is_live_mode)
            do update set
              signed_at = excluded.signed_at,
              encoded_compressed_tally = excluded.encoded_compressed_tally,
              precinct_id = excluded.precinct_id
          `,
          ballotHash,
          electionId,
          machineId,
          isLive,
          signedTimestamp.toISOString(),
          encodedCompressedTally,
          precinctId || null
        );
        assert(rowCount === 1, 'Failed to insert results report');
        return true;
      })
    );
  }

  async deleteQuickReportingResultsForElection(
    electionId: ElectionId,
    isLive: boolean
  ): Promise<void> {
    await this.db.withClient((client) =>
      client.query(
        `
          delete from results_reports
          where election_id = $1 and is_live_mode = $2
        `,
        electionId,
        isLive
      )
    );
  }
}
