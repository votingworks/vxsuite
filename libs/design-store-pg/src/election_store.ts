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
import {
  buildElectionRecord,
  contestOrderPlacingNewCandidateContest,
  contestsFromRows,
  type DuplicateContestError,
  type DuplicateDistrictError,
  type DuplicateElectionError,
  type DuplicatePartyError,
  type DuplicatePrecinctError,
  type ElectionListingWithoutJurisdictionName,
  type ElectionInfoUpdate,
  type ElectionRecord,
  type ElectionStatus,
  type ExternalElectionSource,
  generateId,
  hasDuplicateOptionLabels,
  hasDuplicateSplitDistricts,
  pollingPlacesFromRows,
  precinctsFromRows,
  registeredVoterCountsFromRows,
  type SetPollingPlaceError,
  type StateFeaturesConfig,
  straightPartyContestId,
  type CandidateRow,
  type ContestRow,
  type PrecinctRow,
  type PrecinctSplitRow,
} from '@votingworks/design-backend';
import type { Db } from './db/db.js';
import type { Bindable, Client } from './db/client.js';

const DEFAULT_LANGUAGE_CODES = [LanguageCode.ENGLISH];

/**
 * Ensures that the given function is called within a transaction by querying
 * the database (only in non-production environments). Useful for any helper
 * function that groups multiple database operations together.
 */
async function assertWithinTransaction(client: Client): Promise<void> {
  // @coverage-defer
  if (process.env.NODE_ENV !== 'production') {
    const { isInTransaction } = (
      await client.query(
        'select now() != statement_timestamp() as "isInTransaction"'
      )
    ).rows[0];
    assert(isInTransaction, 'Expected to be within a transaction');
  }
}

// `pg` is CommonJS and node's ESM named-export detection cannot see its
// exports, so a named import of the class fails to load under node — `tsc` and
// vitest both accept it, which is why this went unnoticed. Take the class off
// the default import (`module.exports`); the type still comes from `pg` by name.
const { DatabaseError: DatabaseErrorClass } = pg;

function isDuplicateKeyError(
  error: unknown,
  constraint: string
): error is DatabaseError {
  return (
    error instanceof DatabaseErrorClass &&
    error.code === '23505' &&
    error.constraint === constraint
  );
}

function isForeignKeyError(
  error: unknown,
  constraint: string
): error is DatabaseError {
  return (
    error instanceof DatabaseErrorClass &&
    error.code === '23503' &&
    error.constraint === constraint
  );
}

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

  await insertPrecinctDistrictsOrSplits(client, precinct);
}

async function insertPrecinctDistrictsOrSplits(
  client: Client,
  precinct: Precinct
) {
  await assertWithinTransaction(client);

  if (hasSplits(precinct)) {
    if (hasDuplicateSplitDistricts(precinct)) {
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
  contest: Contest,
  ballotOrder?: number
) {
  await assertWithinTransaction(client);
  // @coverage-exclude
  if (contest.type === 'straight-party') {
    return straightPartyNotYetImplemented();
  }
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
              last_name,
              designation
            )
            values ($1, $2, $3, $4, $5, $6)
          `,
          candidate.id,
          contest.id,
          candidate.firstName,
          candidate.middleName,
          candidate.lastName,
          candidate.designation
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
        const contestIds = contestOrderPlacingNewCandidateContest(
          allContests as Array<{ id: string; type: string }>,
          contest.id
        );
        if (contestIds) {
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
        contest.options[0].id,
        contest.options[0].label,
        contest.options[1].id,
        contest.options[1].label,
        JSON.stringify(contest.options.slice(2)),
        ...(ballotOrder ? [ballotOrder] : [])
      );
      break;
    }

    default: {
      throwIllegalValue(contest);
    }
  }
}

export interface ElectionStoreOptions {
  getStateFeatures(electionId: ElectionId): Promise<StateFeaturesConfig>;
}

export class ElectionStore {
  private readonly db: Db;
  private readonly options: ElectionStoreOptions;

  constructor(db: Db, options: ElectionStoreOptions) {
    this.db = db;
    this.options = options;
  }

  async listElections(input: {
    jurisdictionIds?: string[];
  }): Promise<ElectionListingWithoutJurisdictionName[]> {
    let whereClause = '';
    const params: Bindable[] = [];

    // @coverage-defer
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
                elections.type,
                elections.title,
                elections.date,
                elections.state,
                elections.ballots_finalized_at as "ballotsFinalizedAt",
                elections.ballots_approved_at as "ballotsApprovedAt",
                elections.external_source as "externalSource",
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
            Omit<ElectionListingWithoutJurisdictionName, 'status'> & {
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
      type: row.type,
      title: row.title,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      date: new DateWithoutTime(row.date.toISOString().split('T')[0]!),
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
              is_mi_combined_ballot_primary as "isMiCombinedBallotPrimary",
              title,
              date,
              jurisdiction_name as "jurisdictionName",
              jurisdiction_external_id as "jurisdictionExternalId",
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
            where elections.id = $1
          `,
          electionId
        )
      ).rows[0] as {
        jurisdictionId: string;
        type: ElectionType;
        isMiCombinedBallotPrimary: boolean;
        title: string;
        date: Date;
        jurisdictionName: string;
        jurisdictionExternalId: string;
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
      ).rows as PrecinctRow[];
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
      ).rows as PrecinctSplitRow[];
      const precincts = precinctsFromRows(precinctRows, precinctSplitRows);

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
      ).rows as ContestRow[];
      const candidateRows = (
        await client.query(
          `
            select
              candidates.id,
              contest_id as "contestId",
              first_name as "firstName",
              middle_name as "middleName",
              last_name as "lastName",
              designation,
              -- Order by name for a deterministic order (party ids are
              -- randomly generated, so ordering by them varies per import)
              array_remove(array_agg(candidates_parties.party_id ORDER BY parties.name), NULL) as "partyIds"
            from candidates
            join contests on candidates.contest_id = contests.id
            left join candidates_parties on candidates_parties.candidate_id = candidates.id
            left join parties on parties.id = candidates_parties.party_id
            where contests.election_id = $1
            group by candidates.id
            order by candidates.ballot_order
          `,
          electionId
        )
      ).rows as CandidateRow[];
      const contests = contestsFromRows(contestRows, candidateRows);

      const pollingPlaces = await this.listPollingPlaces(electionId);
      const stateFeatures = await this.options.getStateFeatures(electionId);

      return buildElectionRecord({
        electionId,
        row: {
          ...electionRow,
          date: new DateWithoutTime(
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            electionRow.date.toISOString().split('T')[0]!
          ),
          signature: electionRow.signature || undefined,
          createdAt: electionRow.createdAt.toISOString(),
          lastExportedBallotHash:
            electionRow.lastExportedBallotHash || undefined,
          externalSource: electionRow.externalSource || undefined,
        },
        districts,
        precincts,
        parties,
        contests,
        pollingPlaces,
        stateFeatures,
      });
    });
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
    stateFeatures,
    election,
    isMiCombinedBallotPrimary,
    ballotTemplateId,
    systemSettings,
    externalSource,
  }: {
    jurisdictionId: string;
    stateFeatures: StateFeaturesConfig;
    election: Election;
    isMiCombinedBallotPrimary: boolean;
    ballotTemplateId: BallotTemplateId;
    systemSettings: SystemSettings;
    externalSource?: ExternalElectionSource;
  }): Promise<void> {
    if (isMiCombinedBallotPrimary) {
      if (!stateFeatures.COMBINED_BALLOT_PRIMARIES) {
        throw new Error(
          'Combined ballot primary elections are not supported for this jurisdiction'
        );
      }
    }

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
            is_mi_combined_ballot_primary,
            title,
            date,
            jurisdiction_name,
            jurisdiction_external_id,
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
            $15,
            $16
          )
        `,
          election.id,
          jurisdictionId,
          election.type,
          isMiCombinedBallotPrimary,
          electionTitle,
          election.date.toISOString(),
          election.jurisdiction.name,
          election.jurisdiction.id,
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
        // @coverage-defer
        for (const place of election.pollingPlaces || []) {
          const res = await insertPollingPlace(client, election.id, place);
          res.unsafeUnwrap();
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
    electionInfoUpdate: ElectionInfoUpdate
  ): Promise<Result<void, DuplicateElectionError>> {
    try {
      const { rowCount } = await this.db.withClient((client) =>
        client.query(
          `
          update elections
          set
            type = $1,
            is_mi_combined_ballot_primary = $2,
            title = $3,
            date = $4,
            jurisdiction_name = $5,
            state = $6,
            seal = $7,
            signature = $8,
            ballot_language_codes = $9
          where id = $10
        `,
          electionInfoUpdate.type,
          electionInfoUpdate.isMiCombinedBallotPrimary,
          electionInfoUpdate.title,
          electionInfoUpdate.date.toISOString(),
          electionInfoUpdate.jurisdictionName,
          electionInfoUpdate.state,
          electionInfoUpdate.seal,
          electionInfoUpdate.signatureImage
            ? JSON.stringify({
                image: electionInfoUpdate.signatureImage,
                caption: electionInfoUpdate.signatureCaption,
              })
            : null,
          electionInfoUpdate.languageCodes,
          electionInfoUpdate.electionId
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
      // @coverage-exclude
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
      // @coverage-exclude
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
    const stateFeatures = await this.options.getStateFeatures(electionId);

    try {
      await this.db.withClient((client) =>
        client.withTransaction(async () => {
          await insertPrecinct(client, electionId, precinct);

          // Product assumption: most users will want a corresponding polling
          // place for every precinct created, so we optimize for that use case
          // here, to reduce the amount of manual entry work needed.
          if (stateFeatures.EDIT_POLLING_PLACES) {
            const generatedPlace = pollingPlaceGenerateFromPrecinct({
              id: generateId(),
              precinct,
              type: 'election_day',
            });

            const res = await insertPollingPlace(
              client,
              electionId,
              generatedPlace
            );
            if (res.isErr()) {
              const error = res.err();
              switch (error) {
                case 'duplicate-name':
                  // Name collision with existing polling place - assume the
                  // user will resolve this manually.
                  break;

                // @coverage-exclude: shouldn't be possible
                case 'invalid-precinct':
                  throw new Error(
                    `unexpected polling place generation error: ${error}`
                  );

                default:
                  throwIllegalValue(error);
              }
            }
          }

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
          const { rowCount } = await client.query(
            `
              update precincts set name = $1
              where
                id = $2
                and election_id = $3
            `,
            precinct.name,
            precinct.id,
            electionId
          );
          assert(rowCount === 1, 'Precinct not found');

          await client.query(
            `delete from districts_precincts where precinct_id = $1`,
            precinct.id
          );

          await client.query(
            `delete from precinct_splits where precinct_id = $1`,
            precinct.id
          );

          await insertPrecinctDistrictsOrSplits(client, precinct);

          return true;
        })
      );
      return ok();
    } catch (error) {
      return this.handlePrecinctError(error);
    }
  }

  /**
   * Sets the registered voter counts for a precinct or splits in a precinct.
   * @param precinct The precinct to update.
   * @param registeredVoterCounts Will unset the registered voter count if undefined.
   */
  async setPrecinctRegisteredVoterCounts(
    precinct: Precinct,
    registeredVoterCounts?: PrecinctRegisteredVoterCountEntry
  ): Promise<void> {
    await this.db.withClient((client) =>
      client.withTransaction(async () => {
        await client.query(
          `delete from precinct_registered_voter_counts where precinct_id = $1`,
          precinct.id
        );
        if (
          !hasSplits(precinct) &&
          registeredVoterCounts !== undefined &&
          isPrecinctCount(registeredVoterCounts)
        ) {
          await client.query(
            `
              insert into precinct_registered_voter_counts (precinct_id, count)
              values ($1, $2)
            `,
            precinct.id,
            registeredVoterCounts
          );
        }
        await client.query(
          `
            delete from precinct_split_registered_voter_counts
            where split_id in (
              select id from precinct_splits where precinct_id = $1
            )
          `,
          precinct.id
        );
        if (
          hasSplits(precinct) &&
          registeredVoterCounts !== undefined &&
          isSplitCounts(registeredVoterCounts)
        ) {
          for (const split of precinct.splits) {
            const splitCount = registeredVoterCounts.splits[split.id];
            if (splitCount !== undefined) {
              await client.query(
                `
                  insert into precinct_split_registered_voter_counts (split_id, count)
                  values ($1, $2)
                `,
                split.id,
                splitCount
              );
            }
          }
        }
        return true;
      })
    );
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

  async getRegisteredVoterCounts(
    electionId: ElectionId
  ): Promise<ElectionRegisteredVoterCounts> {
    return this.db.withClient(async (client) => {
      const precinctRows = (
        await client.query(
          `
            select p.id, prc.count
            from precincts p
            left join precinct_registered_voter_counts prc on prc.precinct_id = p.id
            where p.election_id = $1
          `,
          electionId
        )
      ).rows as Array<{ id: PrecinctId; count: number | null }>;

      const splitRows = (
        await client.query(
          `
            select
              ps.id,
              ps.precinct_id as "precinctId",
              psrc.count
            from precinct_splits ps
            join precincts p on ps.precinct_id = p.id
            left join precinct_split_registered_voter_counts psrc on psrc.split_id = ps.id
            where p.election_id = $1
          `,
          electionId
        )
      ).rows as Array<{
        id: string;
        precinctId: PrecinctId;
        count: number | null;
      }>;

      return registeredVoterCountsFromRows(precinctRows, splitRows);
    });
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

  async listContests(electionId: ElectionId): Promise<readonly Contest[]> {
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
    contest: Contest
  ): Promise<Result<void, DuplicateContestError>> {
    if (contest.type === 'yesno' && hasDuplicateOptionLabels(contest)) {
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
    contest: Contest
  ): Promise<Result<void, DuplicateContestError>> {
    if (contest.type === 'yesno' && hasDuplicateOptionLabels(contest)) {
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
    // eslint-disable-next-line no-param-reassign
    contestIds = contestIds.filter(
      (id) => id !== straightPartyContestId(electionId)
    );
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

  async listPollingPlaces(electionId: ElectionId): Promise<PollingPlace[]> {
    return this.db.withClient(async (client) => {
      const res = (await client.query(
        `
          select
            id,
            name,
            array_remove(array_agg(precinct_id order by precinct_id), NULL) as "precinct_ids",
            type
          from polling_places
          left join polling_places_precincts as precincts on
            precincts.polling_place_id = id
          where
            election_id = $1
          group by id
          order by type, name collate natural_sort
      `,
        electionId
      )) as {
        rows: Array<{
          id: string;
          name: string;
          precinct_ids: string[];
          type: PollingPlaceType;
        }>;
      };

      return pollingPlacesFromRows(
        res.rows.map((row) => ({
          id: row.id,
          name: row.name,
          precinctIds: row.precinct_ids,
          type: row.type,
        }))
      );
    });
  }

  async setPollingPlace(
    electionId: ElectionId,
    place: PollingPlace
  ): Promise<Result<void, SetPollingPlaceError>> {
    let res: Result<void, SetPollingPlaceError> | undefined;

    await this.db.withClient(async (client) =>
      client.withTransaction(async () => {
        await deletePollingPlace(client, {
          electionId,
          id: place.id,
        });

        res = await insertPollingPlace(client, electionId, place);

        return true;
      })
    );

    return assertDefined(res);
  }

  async deletePollingPlace(p: {
    electionId: string;
    id: string;
  }): Promise<void> {
    await this.db.withClient(async (client) => deletePollingPlace(client, p));
  }
}

async function deletePollingPlace(
  client: Client,
  p: { electionId: string; id: string }
): Promise<void> {
  await client.query(
    `delete from polling_places where id = $1 and election_id = $2`,
    p.id,
    p.electionId
  );
}

async function insertPollingPlace(
  client: Client,
  electionId: ElectionId,
  place: PollingPlace
): Promise<Result<void, SetPollingPlaceError>> {
  assert(
    Object.values(place.precincts).every((p) => p.type === 'whole'),
    'partial precinct coverage not yet supported for polling places'
  );

  await assertWithinTransaction(client);
  try {
    await client.query(
      `
        insert into polling_places (
          election_id,
          id,
          name,
          type
        )
        values ($1, $2, $3, $4)
      `,
      electionId,
      place.id,
      place.name,
      place.type
    );

    await insertPollingPlacePrecincts(client, place);
  } catch (error) {
    const nameIndex = 'polling_places_uniq_election_id_name_type';
    if (isDuplicateKeyError(error, nameIndex)) {
      return err('duplicate-name');
    }

    const precinctsForeignKey = 'polling_places_precincts_precinct_id_fkey';
    if (isForeignKeyError(error, precinctsForeignKey)) {
      return err('invalid-precinct');
    }

    // @coverage-defer
    throw error;
  }

  return ok();
}

async function insertPollingPlacePrecincts(
  client: Client,
  place: PollingPlace
) {
  const precinctIds = Object.keys(place.precincts);
  // @coverage-defer
  if (precinctIds.length === 0) return;

  const params = [place.id, ...precinctIds];
  const placeholders: string[] = [];

  for (let i = 2; i <= params.length; i += 1) {
    placeholders.push(`($1, $${i})`);
  }

  await client.query(
    `
      insert into polling_places_precincts (
        polling_place_id,
        precinct_id
      ) values
        ${placeholders.join(', ')}
  `,
    ...params
  );
}
