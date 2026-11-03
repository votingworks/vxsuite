import {
  assert,
  assertDefined,
  DateWithoutTime,
  err,
  ok,
  type Result,
  throwIllegalValue,
} from '@votingworks/basics';
import type { Client as DbClient } from '@votingworks/db';
import {
  type BallotTemplateId,
  buildElectionRecord,
  type CreateElectionParams,
  type DesignElectionStore,
  type CandidateRow,
  contestOrderPlacingNewCandidateContest,
  contestsFromRows,
  type ContestRow,
  type DuplicateContestError,
  type DuplicateDistrictError,
  type DuplicateElectionError,
  type DuplicatePartyError,
  type DuplicatePrecinctError,
  type ElectionInfoUpdate,
  type ElectionRecord,
  type ExternalElectionSource,
  generateId,
  hasDuplicateOptionLabels,
  hasDuplicateSplitDistricts,
  naturalSortBy,
  pollingPlacesFromRows,
  precinctsFromRows,
  type PrecinctRow,
  type PrecinctSplitRow,
  registeredVoterCountsFromRows,
  type SetPollingPlaceError,
  type StateFeaturesConfig,
  straightPartyContestId,
} from '@votingworks/design-backend';

import {
  type BallotStyle,
  type Contest,
  type District,
  DistrictSchema,
  type DistrictId,
  type Election,
  type ElectionId,
  type ElectionRegisteredVoterCounts,
  type ElectionType,
  type HmpbBallotPaperSize,
  hasSplits,
  isPrecinctCount,
  isSplitCounts,
  LanguageCode,
  type Party,
  PartySchema,
  type PollingPlace,
  pollingPlaceGenerateFromPrecinct,
  type PollingPlaceType,
  type Precinct,
  type PrecinctId,
  type PrecinctRegisteredVoterCountEntry,
  safeParseSystemSettings,
  type Signature,
  type SystemSettings,
  unsafeParse,
} from '@votingworks/types';

const DEFAULT_LANGUAGE_CODES = [LanguageCode.ENGLISH];

const PARTY_NAME_COLLATOR = new Intl.Collator('en');

export const LOCAL_JURISDICTION_ID = 'vxadmin-local';

class DuplicateKeyError extends Error {
  readonly index: string;

  constructor(index: string) {
    super(`duplicate key value violates unique index ${index}`);
    this.index = index;
  }
}

const UNIQUE_INDEX_COLUMNS: Record<string, string> = {
  design_districts_election_id_name_unique_index:
    'design_districts.election_id, design_districts.name',
  design_precincts_election_id_name_unique_index:
    'design_precincts.election_id, design_precincts.name',
  design_precinct_splits_precinct_id_name_unique_index:
    'design_precinct_splits.precinct_id, design_precinct_splits.name',
  design_parties_election_id_name_unique_index:
    'design_parties.election_id, design_parties.name',
  design_parties_election_id_full_name_unique_index:
    'design_parties.election_id, design_parties.full_name',
  design_parties_election_id_abbrev_unique_index:
    'design_parties.election_id, design_parties.abbrev',
  design_contests_unique_index:
    'design_contests.district_id, design_contests.title, design_contests.seats, design_contests.term_description, design_contests.party_id',
  design_candidates_unique_index:
    'design_candidates.contest_id, design_candidates.first_name, design_candidates.middle_name, design_candidates.last_name',
  design_polling_places_uniq_election_id_name_type:
    'design_polling_places.election_id, design_polling_places.name, design_polling_places.type',
};

function isSqliteError(
  error: unknown
): error is Error & { code: string; message: string } {
  return error instanceof Error && 'code' in error;
}

function isDuplicateKeyError(error: unknown, index: string): boolean {
  if (error instanceof DuplicateKeyError) return error.index === index;
  return (
    isSqliteError(error) &&
    error.code === 'SQLITE_CONSTRAINT_UNIQUE' &&
    error.message === `UNIQUE constraint failed: ${UNIQUE_INDEX_COLUMNS[index]}`
  );
}

function isForeignKeyError(error: unknown): boolean {
  return isSqliteError(error) && error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY';
}

function toSqliteBoolean(value: boolean | undefined | null): number | null {
  if (value === undefined || value === null) return null;
  return value ? 1 : 0;
}

function sqliteTimestampToIso(timestamp: string): string {
  return timestamp.includes('T')
    ? timestamp
    : `${timestamp.replace(' ', 'T')}Z`;
}

function groupIds(
  rows: ReadonlyArray<{ key: string; id: string }>
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const { key, id } of rows) {
    const ids = map.get(key);
    if (ids) {
      ids.push(id);
    } else {
      map.set(key, [id]);
    }
  }
  return map;
}

interface DesignElectionDbRow {
  type: ElectionType;
  isMiCombinedBallotPrimary: number;
  title: string;
  date: string;
  jurisdictionName: string;
  jurisdictionExternalId: string;
  state: string;
  seal: string;
  signature: string | null;
  systemSettingsData: string;
  ballotPaperSize: HmpbBallotPaperSize;
  ballotTemplateId: BallotTemplateId;
  ballotsFinalizedAt: string | null;
  createdAt: string;
  ballotLanguageCodes: string | null;
  externalSource: ExternalElectionSource | null;
}

export type DesignExportStatus = 'running' | 'complete' | 'failed';

export interface DesignExportProgress {
  label: string;
  progress: number;
  total: number;
}

export interface DesignExport {
  status: DesignExportStatus;
  progress?: DesignExportProgress;
  error?: string;
  startedAt: string;
  completedAt?: string;
  ballotHash?: string;
  electionPackagePath?: string;
  officialBallotsPath?: string;
  testBallotsPath?: string;
  sampleBallotsPath?: string;
}

export interface DesignStoreOptions {
  getStateFeatures(electionId: ElectionId): StateFeaturesConfig;
}

export class DesignStore implements DesignElectionStore {
  private readonly client: DbClient;
  private readonly options: DesignStoreOptions;

  constructor(client: DbClient, options: DesignStoreOptions) {
    this.client = client;
    this.options = options;
  }

  getCurrentElectionId(): ElectionId | undefined {
    const row = this.client.one('select id from design_elections') as
      | { id: ElectionId }
      | undefined;
    return row?.id;
  }

  createElection({
    stateFeatures,
    election,
    isMiCombinedBallotPrimary,
    ballotTemplateId,
    systemSettings,
    externalSource,
  }: CreateElectionParams): void {
    if (isMiCombinedBallotPrimary && !stateFeatures.COMBINED_BALLOT_PRIMARIES) {
      throw new Error(
        'Combined ballot primary elections are not supported for this jurisdiction'
      );
    }

    this.client.transaction(() => {
      this.client.run(
        `
          insert into design_elections (
            id,
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
          values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        election.id,
        election.type,
        toSqliteBoolean(isMiCombinedBallotPrimary),
        election.title,
        election.date.toISOString(),
        election.jurisdiction.name,
        election.jurisdiction.id,
        election.state,
        election.seal,
        election.signature ? JSON.stringify(election.signature) : null,
        election.ballotLayout.paperSize,
        ballotTemplateId,
        JSON.stringify(DEFAULT_LANGUAGE_CODES),
        JSON.stringify(systemSettings),
        externalSource ?? null
      );
      for (const district of election.districts) {
        this.insertDistrict(election.id, district);
      }
      for (const precinct of election.precincts) {
        this.insertPrecinct(election.id, precinct);
      }
      // @coverage-defer
      for (const place of election.pollingPlaces || []) {
        this.insertPollingPlace(election.id, place).unsafeUnwrap();
      }
      for (const party of election.parties) {
        this.insertParty(election.id, party);
      }
      for (const contest of election.contests) {
        this.insertContest(election.id, contest);
      }
    });
  }

  getElection(electionId: ElectionId): ElectionRecord {
    const row = this.client.one(
      `
        select
          type,
          is_mi_combined_ballot_primary as isMiCombinedBallotPrimary,
          title,
          date,
          jurisdiction_name as jurisdictionName,
          jurisdiction_external_id as jurisdictionExternalId,
          state,
          seal,
          signature,
          system_settings_data as systemSettingsData,
          ballot_paper_size as ballotPaperSize,
          ballot_template_id as ballotTemplateId,
          ballots_finalized_at as ballotsFinalizedAt,
          created_at as createdAt,
          ballot_language_codes as ballotLanguageCodes,
          external_source as externalSource
        from design_elections
        where id = ?
      `,
      electionId
    ) as DesignElectionDbRow | undefined;
    assert(row, 'Election not found');

    return buildElectionRecord({
      electionId,
      row: {
        jurisdictionId: LOCAL_JURISDICTION_ID,
        type: row.type,
        isMiCombinedBallotPrimary: row.isMiCombinedBallotPrimary === 1,
        title: row.title,
        date: new DateWithoutTime(row.date),
        jurisdictionName: row.jurisdictionName,
        jurisdictionExternalId: row.jurisdictionExternalId,
        state: row.state,
        seal: row.seal,
        signature: row.signature
          ? (JSON.parse(row.signature) as Signature)
          : undefined,
        systemSettingsData: row.systemSettingsData,
        ballotPaperSize: row.ballotPaperSize,
        ballotTemplateId: row.ballotTemplateId,
        ballotsFinalizedAt: row.ballotsFinalizedAt
          ? new Date(row.ballotsFinalizedAt)
          : null,
        createdAt: sqliteTimestampToIso(row.createdAt),
        ballotLanguageCodes: JSON.parse(
          row.ballotLanguageCodes ?? '[]'
        ) as LanguageCode[],
        externalSource: row.externalSource ?? undefined,
      },
      districts: this.listDistricts(electionId),
      precincts: this.listPrecincts(electionId),
      parties: this.listParties(electionId),
      contests: this.listStoredContests(electionId),
      pollingPlaces: this.listPollingPlaces(electionId),
      stateFeatures: this.options.getStateFeatures(electionId),
    });
  }

  getSystemSettings(electionId: ElectionId): SystemSettings {
    const row = this.client.one(
      'select system_settings_data as data from design_elections where id = ?',
      electionId
    ) as { data: string } | undefined;
    return safeParseSystemSettings(
      assertDefined(row, 'Election not found').data
    ).unsafeUnwrap();
  }

  updateSystemSettings(
    electionId: ElectionId,
    systemSettings: SystemSettings
  ): void {
    this.client.run(
      'update design_elections set system_settings_data = ? where id = ?',
      JSON.stringify(systemSettings),
      electionId
    );
  }

  updateElectionInfo(
    electionInfoUpdate: ElectionInfoUpdate
  ): Result<void, DuplicateElectionError> {
    const changes = this.runChanges(
      `
        update design_elections
        set
          type = ?,
          is_mi_combined_ballot_primary = ?,
          title = ?,
          date = ?,
          jurisdiction_name = ?,
          state = ?,
          seal = ?,
          signature = ?,
          ballot_language_codes = ?
        where id = ?
      `,
      electionInfoUpdate.type,
      toSqliteBoolean(electionInfoUpdate.isMiCombinedBallotPrimary),
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
      JSON.stringify(electionInfoUpdate.languageCodes),
      electionInfoUpdate.electionId
    );
    assert(changes === 1, 'Election not found');
    return ok();
  }

  listDistricts(electionId: ElectionId): District[] {
    return naturalSortBy(
      this.client.all(
        'select id, name from design_districts where election_id = ?',
        electionId
      ) as District[],
      (district) => district.name
    );
  }

  updateDistricts(input: {
    electionId: ElectionId;
    deletedDistrictIds?: string[];
    newDistricts?: District[];
    updatedDistricts?: District[];
  }): Result<void, DuplicateDistrictError> {
    const { electionId } = input;
    return this.client.transaction(
      (): Result<void, DuplicateDistrictError> => {
        for (const id of input.deletedDistrictIds || []) {
          this.client.run(
            'delete from design_districts where id = ? and election_id = ?',
            id,
            electionId
          );
        }
        for (const d of input.updatedDistricts || []) {
          const district = unsafeParse(DistrictSchema, d);
          try {
            const changes = this.runChanges(
              'update design_districts set name = ? where id = ? and election_id = ?',
              district.name,
              district.id,
              electionId
            );
            assert(changes === 1, 'District not found');
          } catch (error) {
            if (
              isDuplicateKeyError(
                error,
                'design_districts_election_id_name_unique_index'
              )
            ) {
              return err({ code: 'duplicate-name', districtId: district.id });
            }
            throw error;
          }
        }
        for (const d of input.newDistricts || []) {
          const district = unsafeParse(DistrictSchema, d);
          try {
            this.insertDistrict(electionId, district);
          } catch (error) {
            if (
              isDuplicateKeyError(
                error,
                'design_districts_election_id_name_unique_index'
              )
            ) {
              return err({ code: 'duplicate-name', districtId: district.id });
            }
            throw error;
          }
        }
        return ok();
      },
      (result) => result.isOk()
    );
  }

  listPrecincts(electionId: ElectionId): Precinct[] {
    const precinctDistricts = groupIds(
      this.client.all(
        `
          select dp.precinct_id as key, dp.district_id as id
          from design_districts_precincts dp
          join design_precincts p on p.id = dp.precinct_id
          where p.election_id = ?
          order by dp.district_id
        `,
        electionId
      ) as Array<{ key: string; id: string }>
    );
    const splitDistricts = groupIds(
      this.client.all(
        `
          select dps.precinct_split_id as key, dps.district_id as id
          from design_districts_precinct_splits dps
          join design_precinct_splits s on s.id = dps.precinct_split_id
          join design_precincts p on p.id = s.precinct_id
          where p.election_id = ?
          order by dps.district_id
        `,
        electionId
      ) as Array<{ key: string; id: string }>
    );

    const precinctRows: PrecinctRow[] = naturalSortBy(
      this.client.all(
        'select id, name from design_precincts where election_id = ?',
        electionId
      ) as Array<{ id: PrecinctId; name: string }>,
      (row) => row.name
    ).map((row) => ({
      ...row,
      districtIds: (precinctDistricts.get(row.id) ?? []) as DistrictId[],
    }));

    const splitRows: PrecinctSplitRow[] = naturalSortBy(
      this.client.all(
        `
          select s.id, s.precinct_id as precinctId, s.name, s.nh_options as nhOptions
          from design_precinct_splits s
          join design_precincts p on p.id = s.precinct_id
          where p.election_id = ?
        `,
        electionId
      ) as Array<{
        id: string;
        precinctId: PrecinctId;
        name: string;
        nhOptions: string;
      }>,
      (row) => row.name
    ).map((row) => ({
      ...row,
      nhOptions: JSON.parse(row.nhOptions),
      districtIds: (splitDistricts.get(row.id) ?? []) as DistrictId[],
    }));

    return precinctsFromRows(precinctRows, splitRows);
  }

  createPrecinct(
    electionId: ElectionId,
    precinct: Precinct
  ): Result<void, DuplicatePrecinctError> {
    const stateFeatures = this.options.getStateFeatures(electionId);
    try {
      this.client.transaction(() => {
        this.insertPrecinct(electionId, precinct);
        if (stateFeatures.EDIT_POLLING_PLACES) {
          const generatedPlace = pollingPlaceGenerateFromPrecinct({
            id: generateId(),
            precinct,
            type: 'election_day',
          });
          const res = this.insertPollingPlace(electionId, generatedPlace);
          if (res.isErr()) {
            const error = res.err();
            switch (error) {
              case 'duplicate-name':
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
      });
      return ok();
    } catch (error) {
      return this.handlePrecinctError(error);
    }
  }

  updatePrecinct(
    electionId: ElectionId,
    precinct: Precinct
  ): Result<void, DuplicatePrecinctError> {
    try {
      this.client.transaction(() => {
        const changes = this.runChanges(
          'update design_precincts set name = ? where id = ? and election_id = ?',
          precinct.name,
          precinct.id,
          electionId
        );
        assert(changes === 1, 'Precinct not found');
        this.client.run(
          'delete from design_districts_precincts where precinct_id = ?',
          precinct.id
        );
        this.client.run(
          'delete from design_precinct_splits where precinct_id = ?',
          precinct.id
        );
        this.insertPrecinctDistrictsOrSplits(precinct);
      });
      return ok();
    } catch (error) {
      return this.handlePrecinctError(error);
    }
  }

  setPrecinctRegisteredVoterCounts(
    precinct: Precinct,
    registeredVoterCounts?: PrecinctRegisteredVoterCountEntry
  ): void {
    this.client.transaction(() => {
      this.client.run(
        'delete from design_precinct_registered_voter_counts where precinct_id = ?',
        precinct.id
      );
      if (
        !hasSplits(precinct) &&
        registeredVoterCounts !== undefined &&
        isPrecinctCount(registeredVoterCounts)
      ) {
        this.client.run(
          'insert into design_precinct_registered_voter_counts (precinct_id, count) values (?, ?)',
          precinct.id,
          registeredVoterCounts
        );
      }
      this.client.run(
        `
          delete from design_precinct_split_registered_voter_counts
          where split_id in (
            select id from design_precinct_splits where precinct_id = ?
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
            this.client.run(
              'insert into design_precinct_split_registered_voter_counts (split_id, count) values (?, ?)',
              split.id,
              splitCount
            );
          }
        }
      }
    });
  }

  deletePrecinct(electionId: ElectionId, precinctId: PrecinctId): void {
    const changes = this.runChanges(
      'delete from design_precincts where id = ? and election_id = ?',
      precinctId,
      electionId
    );
    assert(changes === 1, 'Precinct not found');
  }

  getRegisteredVoterCounts(
    electionId: ElectionId
  ): ElectionRegisteredVoterCounts {
    const precinctRows = this.client.all(
      `
        select p.id, prc.count
        from design_precincts p
        left join design_precinct_registered_voter_counts prc on prc.precinct_id = p.id
        where p.election_id = ?
      `,
      electionId
    ) as Array<{ id: PrecinctId; count: number | null }>;
    const splitRows = this.client.all(
      `
        select ps.id, ps.precinct_id as precinctId, psrc.count
        from design_precinct_splits ps
        join design_precincts p on ps.precinct_id = p.id
        left join design_precinct_split_registered_voter_counts psrc on psrc.split_id = ps.id
        where p.election_id = ?
      `,
      electionId
    ) as Array<{ id: string; precinctId: PrecinctId; count: number | null }>;
    return registeredVoterCountsFromRows(precinctRows, splitRows);
  }

  listBallotStyles(electionId: ElectionId): readonly BallotStyle[] {
    return this.getElection(electionId).election.ballotStyles;
  }

  listParties(electionId: ElectionId): Party[] {
    return (
      this.client.all(
        `
          select id, name, full_name as fullName, abbrev
          from design_parties
          where election_id = ?
        `,
        electionId
      ) as Party[]
    ).toSorted((a, b) => PARTY_NAME_COLLATOR.compare(a.name, b.name));
  }

  updateParties(input: {
    electionId: ElectionId;
    deletedPartyIds?: string[];
    newParties?: Party[];
    updatedParties?: Party[];
  }): Result<void, DuplicatePartyError> {
    const { electionId } = input;
    return this.client.transaction(
      (): Result<void, DuplicatePartyError> => {
        for (const id of input.deletedPartyIds || []) {
          this.client.run(
            'delete from design_parties where id = ? and election_id = ?',
            id,
            electionId
          );
        }
        for (const p of input.updatedParties || []) {
          const party = unsafeParse(PartySchema, p);
          try {
            const changes = this.runChanges(
              `
                update design_parties
                set name = ?, full_name = ?, abbrev = ?
                where id = ? and election_id = ?
              `,
              party.name,
              party.fullName,
              party.abbrev,
              party.id,
              electionId
            );
            assert(changes === 1, 'Party not found');
          } catch (error) {
            return this.handlePartyError(party.id, error);
          }
        }
        for (const p of input.newParties || []) {
          const party = unsafeParse(PartySchema, p);
          try {
            this.insertParty(electionId, party);
          } catch (error) {
            return this.handlePartyError(party.id, error);
          }
        }
        return ok();
      },
      (result) => result.isOk()
    );
  }

  listContests(electionId: ElectionId): readonly Contest[] {
    return this.getElection(electionId).election.contests;
  }

  createContest(
    electionId: ElectionId,
    contest: Contest
  ): Result<void, DuplicateContestError> {
    if (contest.type === 'yesno' && hasDuplicateOptionLabels(contest)) {
      return err('duplicate-option');
    }
    try {
      this.client.transaction(() => this.insertContest(electionId, contest));
      return ok();
    } catch (error) {
      return this.handleContestError(error);
    }
  }

  updateContest(
    electionId: ElectionId,
    contest: Contest
  ): Result<void, DuplicateContestError> {
    if (contest.type === 'yesno' && hasDuplicateOptionLabels(contest)) {
      return err('duplicate-option');
    }
    try {
      this.client.transaction(() => {
        const row = this.client.one(
          'select ballot_order as ballotOrder from design_contests where id = ? and election_id = ?',
          contest.id,
          electionId
        ) as { ballotOrder: number } | undefined;
        assert(row, 'Contest not found');
        this.client.run(
          'delete from design_contests where id = ? and election_id = ?',
          contest.id,
          electionId
        );
        this.insertContest(electionId, contest, row.ballotOrder);
      });
      return ok();
    } catch (error) {
      return this.handleContestError(error);
    }
  }

  reorderContests(electionId: ElectionId, contestIds: string[]): void {
    const storedContestIds = contestIds.filter(
      (id) => id !== straightPartyContestId(electionId)
    );
    this.client.transaction(() => {
      const existing = this.client.all(
        'select id from design_contests where election_id = ?',
        electionId
      );
      assert(
        storedContestIds.length === existing.length,
        'Contest list is out of date'
      );
      for (const contestId of storedContestIds) {
        const changes = this.runChanges(
          `
            update design_contests
            set ballot_order = (select coalesce(max(ballot_order), 0) + 1 from design_contests)
            where id = ? and election_id = ?
          `,
          contestId,
          electionId
        );
        assert(changes === 1, `Contest not found: ${contestId}`);
      }
    });
  }

  deleteContest(electionId: ElectionId, contestId: string): void {
    const changes = this.runChanges(
      'delete from design_contests where id = ? and election_id = ?',
      contestId,
      electionId
    );
    assert(changes === 1, 'Contest not found');
  }

  getBallotLayoutSettings(electionId: ElectionId): {
    paperSize: HmpbBallotPaperSize;
    compact: boolean;
  } {
    const row = this.client.one(
      `
        select ballot_paper_size as paperSize, ballot_compact as compact
        from design_elections where id = ?
      `,
      electionId
    ) as { paperSize: HmpbBallotPaperSize; compact: number } | undefined;
    assert(row, 'Election not found');
    return { paperSize: row.paperSize, compact: row.compact === 1 };
  }

  updateBallotLayoutSettings(
    electionId: ElectionId,
    paperSize: HmpbBallotPaperSize,
    compact: boolean
  ): void {
    const changes = this.runChanges(
      'update design_elections set ballot_paper_size = ?, ballot_compact = ? where id = ?',
      paperSize,
      toSqliteBoolean(compact),
      electionId
    );
    assert(changes === 1, 'Election not found');
  }

  deleteElection(electionId: ElectionId): void {
    this.client.run('delete from design_elections where id = ?', electionId);
  }

  getBallotsFinalizedAt(electionId: ElectionId): Date | null {
    const row = this.client.one(
      'select ballots_finalized_at as finalizedAt from design_elections where id = ?',
      electionId
    ) as { finalizedAt: string | null } | undefined;
    return row?.finalizedAt ? new Date(row.finalizedAt) : null;
  }

  setBallotsFinalizedAt({
    electionId,
    finalizedAt,
  }: {
    electionId: ElectionId;
    finalizedAt: Date | null;
  }): void {
    this.client.run(
      'update design_elections set ballots_finalized_at = ? where id = ?',
      finalizedAt ? finalizedAt.toISOString() : null,
      electionId
    );
  }

  getBallotTemplate(electionId: ElectionId): BallotTemplateId {
    const row = this.client.one(
      'select ballot_template_id as ballotTemplateId from design_elections where id = ?',
      electionId
    ) as { ballotTemplateId: BallotTemplateId } | undefined;
    return assertDefined(row, 'Election not found').ballotTemplateId;
  }

  setBallotTemplate(
    electionId: ElectionId,
    ballotTemplateId: BallotTemplateId
  ): void {
    this.client.run(
      'update design_elections set ballot_template_id = ? where id = ?',
      ballotTemplateId,
      electionId
    );
  }

  listPollingPlaces(electionId: ElectionId): PollingPlace[] {
    const precinctIds = groupIds(
      this.client.all(
        `
          select ppp.polling_place_id as key, ppp.precinct_id as id
          from design_polling_places_precincts ppp
          join design_polling_places pp on pp.id = ppp.polling_place_id
          where pp.election_id = ?
          order by ppp.precinct_id
        `,
        electionId
      ) as Array<{ key: string; id: string }>
    );
    const rows = this.client.all(
      'select id, name, type from design_polling_places where election_id = ?',
      electionId
    ) as Array<{ id: string; name: string; type: PollingPlaceType }>;
    const sorted = naturalSortBy(rows, (row) => row.name).toSorted((a, b) =>
      a.type.localeCompare(b.type)
    );
    return pollingPlacesFromRows(
      sorted.map((row) => ({
        ...row,
        precinctIds: precinctIds.get(row.id) ?? [],
      }))
    );
  }

  setPollingPlace(
    electionId: ElectionId,
    place: PollingPlace
  ): Result<void, SetPollingPlaceError> {
    return this.client.transaction(
      () => {
        this.client.run(
          'delete from design_polling_places where id = ? and election_id = ?',
          place.id,
          electionId
        );
        return this.insertPollingPlace(electionId, place);
      },
      (result) => result.isOk()
    );
  }

  deletePollingPlace(p: { electionId: string; id: string }): void {
    this.client.run(
      'delete from design_polling_places where id = ? and election_id = ?',
      p.id,
      p.electionId
    );
  }

  getExport(electionId: ElectionId): DesignExport | undefined {
    const row = this.client.one(
      `
        select
          status,
          progress,
          error,
          started_at as startedAt,
          completed_at as completedAt,
          ballot_hash as ballotHash,
          election_package_path as electionPackagePath,
          official_ballots_path as officialBallotsPath,
          test_ballots_path as testBallotsPath,
          sample_ballots_path as sampleBallotsPath
        from design_exports where election_id = ?
      `,
      electionId
    ) as
      | (Omit<DesignExport, 'progress'> & {
          progress: string | null;
        } & Record<string, unknown>)
      | undefined;
    if (!row) return undefined;
    return {
      status: row.status,
      progress: row.progress
        ? (JSON.parse(row.progress) as DesignExportProgress)
        : undefined,
      error: row.error ?? undefined,
      startedAt: row.startedAt,
      completedAt: row.completedAt ?? undefined,
      ballotHash: row.ballotHash ?? undefined,
      electionPackagePath: row.electionPackagePath ?? undefined,
      officialBallotsPath: row.officialBallotsPath ?? undefined,
      testBallotsPath: row.testBallotsPath ?? undefined,
      sampleBallotsPath: row.sampleBallotsPath ?? undefined,
    };
  }

  startExport(electionId: ElectionId): void {
    this.client.run(
      `
        insert or replace into design_exports (election_id, status, started_at)
        values (?, 'running', ?)
      `,
      electionId,
      new Date().toISOString()
    );
  }

  updateExportProgress(
    electionId: ElectionId,
    progress: DesignExportProgress
  ): void {
    this.client.run(
      "update design_exports set progress = ? where election_id = ? and status = 'running'",
      JSON.stringify(progress),
      electionId
    );
  }

  completeExport(
    electionId: ElectionId,
    result: {
      ballotHash: string;
      electionPackagePath: string;
      officialBallotsPath: string;
      testBallotsPath?: string;
      sampleBallotsPath?: string;
    }
  ): void {
    this.client.run(
      `
        update design_exports
        set
          status = 'complete',
          completed_at = ?,
          ballot_hash = ?,
          election_package_path = ?,
          official_ballots_path = ?,
          test_ballots_path = ?,
          sample_ballots_path = ?
        where election_id = ?
      `,
      new Date().toISOString(),
      result.ballotHash,
      result.electionPackagePath,
      result.officialBallotsPath,
      result.testBallotsPath ?? null,
      result.sampleBallotsPath ?? null,
      electionId
    );
  }

  failExport(electionId: ElectionId, error: string): void {
    this.client.run(
      "update design_exports set status = 'failed', completed_at = ?, error = ? where election_id = ?",
      new Date().toISOString(),
      error,
      electionId
    );
  }

  clearExport(electionId: ElectionId): void {
    this.client.run(
      'delete from design_exports where election_id = ?',
      electionId
    );
  }

  failInterruptedExports(): void {
    this.client.run(
      "update design_exports set status = 'failed', completed_at = ?, error = 'Interrupted by a restart' where status = 'running'",
      new Date().toISOString()
    );
  }

  private runChanges(
    sql: string,
    ...params: Array<string | number | null>
  ): number {
    this.client.run(sql, ...params);
    return (this.client.one('select changes() as n') as { n: number }).n;
  }

  private listStoredContests(electionId: ElectionId): Contest[] {
    const contestRows = (
      this.client.all(
        `
          select
            id,
            title,
            type,
            district_id as districtId,
            seats,
            allow_write_ins as allowWriteIns,
            party_id as partyId,
            term_description as termDescription,
            description,
            yes_option_id as yesOptionId,
            yes_option_label as yesOptionLabel,
            no_option_id as noOptionId,
            no_option_label as noOptionLabel,
            additional_options as additionalOptions
          from design_contests
          where election_id = ?
          order by ballot_order
        `,
        electionId
      ) as Array<
        Omit<ContestRow, 'allowWriteIns' | 'additionalOptions'> & {
          allowWriteIns: number | null;
          additionalOptions: string | null;
        }
      >
    ).map((row): ContestRow => ({
      ...row,
      allowWriteIns:
        row.allowWriteIns === null ? null : row.allowWriteIns === 1,
      additionalOptions: row.additionalOptions
        ? JSON.parse(row.additionalOptions)
        : null,
    }));

    const partyNames = new Map(
      this.listParties(electionId).map((party) => [party.id, party.name])
    );
    const candidateParties = groupIds(
      this.client.all(
        `
          select cp.candidate_id as key, cp.party_id as id
          from design_candidates_parties cp
          join design_candidates c on c.id = cp.candidate_id
          join design_contests ct on ct.id = c.contest_id
          where ct.election_id = ?
        `,
        electionId
      ) as Array<{ key: string; id: string }>
    );
    const candidateRows = (
      this.client.all(
        `
          select
            c.id,
            c.contest_id as contestId,
            c.first_name as firstName,
            c.middle_name as middleName,
            c.last_name as lastName,
            c.designation
          from design_candidates c
          join design_contests ct on ct.id = c.contest_id
          where ct.election_id = ?
          order by c.ballot_order
        `,
        electionId
      ) as Array<Omit<CandidateRow, 'partyIds'>>
    ).map((row): CandidateRow => ({
      ...row,
      partyIds: (candidateParties.get(row.id) ?? []).toSorted((a, b) =>
        PARTY_NAME_COLLATOR.compare(
          partyNames.get(a) ?? '',
          partyNames.get(b) ?? ''
        )
      ),
    }));

    return contestsFromRows(contestRows, candidateRows);
  }

  private insertDistrict(electionId: ElectionId, district: District): void {
    this.client.run(
      'insert into design_districts (id, election_id, name) values (?, ?, ?)',
      district.id,
      electionId,
      district.name
    );
  }

  private insertPrecinct(electionId: ElectionId, precinct: Precinct): void {
    assert(
      this.client.isInTransaction(),
      'Expected to be within a transaction'
    );
    this.client.run(
      'insert into design_precincts (id, election_id, name) values (?, ?, ?)',
      precinct.id,
      electionId,
      precinct.name
    );
    this.insertPrecinctDistrictsOrSplits(precinct);
  }

  private insertPrecinctDistrictsOrSplits(precinct: Precinct): void {
    assert(
      this.client.isInTransaction(),
      'Expected to be within a transaction'
    );
    if (hasSplits(precinct)) {
      if (hasDuplicateSplitDistricts(precinct)) {
        throw new Error('duplicate-split-districts');
      }
      for (const split of precinct.splits) {
        const { id: splitId, name, districtIds, ...nhOptions } = split;
        this.client.run(
          'insert into design_precinct_splits (id, precinct_id, name, nh_options) values (?, ?, ?, ?)',
          splitId,
          precinct.id,
          name,
          JSON.stringify(nhOptions)
        );
        for (const districtId of districtIds) {
          this.client.run(
            'insert into design_districts_precinct_splits (district_id, precinct_split_id) values (?, ?)',
            districtId,
            splitId
          );
        }
      }
    } else {
      for (const districtId of precinct.districtIds) {
        this.client.run(
          'insert into design_districts_precincts (district_id, precinct_id) values (?, ?)',
          districtId,
          precinct.id
        );
      }
    }
  }

  private insertParty(electionId: ElectionId, party: Party): void {
    this.client.run(
      'insert into design_parties (id, election_id, name, full_name, abbrev) values (?, ?, ?, ?, ?)',
      party.id,
      electionId,
      party.name,
      party.fullName,
      party.abbrev
    );
  }

  private assertNoDuplicateContest(contest: Contest): void {
    if (contest.type !== 'candidate' && contest.type !== 'yesno') return;
    const duplicate = this.client.one(
      `
        select 1 from design_contests
        where district_id = ?
          and title = ?
          and seats is ?
          and term_description is ?
          and party_id is ?
      `,
      contest.districtId,
      contest.title,
      contest.type === 'candidate' ? contest.seats : null,
      contest.type === 'candidate' ? (contest.termDescription ?? null) : null,
      contest.type === 'candidate' ? (contest.partyId ?? null) : null
    );
    if (duplicate) {
      throw new DuplicateKeyError('design_contests_unique_index');
    }
  }

  private assertNoDuplicateCandidate(
    contestId: string,
    candidate: { firstName?: string; middleName?: string; lastName?: string }
  ): void {
    const duplicate = this.client.one(
      `
        select 1 from design_candidates
        where contest_id = ?
          and first_name is ?
          and middle_name is ?
          and last_name is ?
      `,
      contestId,
      candidate.firstName ?? null,
      candidate.middleName ?? null,
      candidate.lastName ?? null
    );
    if (duplicate) {
      throw new DuplicateKeyError('design_candidates_unique_index');
    }
  }

  private insertContest(
    electionId: ElectionId,
    contest: Contest,
    ballotOrder?: number
  ): void {
    assert(
      this.client.isInTransaction(),
      'Expected to be within a transaction'
    );
    assert(
      contest.type !== 'straight-party',
      'Straight party contests are generated on read'
    );
    this.assertNoDuplicateContest(contest);
    const nextBallotOrder =
      '(select coalesce(max(ballot_order), 0) + 1 from design_contests)';
    switch (contest.type) {
      case 'candidate': {
        this.client.run(
          `
            insert into design_contests (
              id, election_id, title, type, district_id, seats,
              allow_write_ins, party_id, term_description, ballot_order
            )
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ${ballotOrder ? '?' : nextBallotOrder})
          `,
          contest.id,
          electionId,
          contest.title,
          contest.type,
          contest.districtId,
          contest.seats,
          toSqliteBoolean(contest.allowWriteIns),
          contest.partyId ?? null,
          contest.termDescription ?? null,
          ...(ballotOrder ? [ballotOrder] : [])
        );
        for (const candidate of contest.candidates) {
          this.assertNoDuplicateCandidate(contest.id, candidate);
          this.client.run(
            `
              insert into design_candidates (
                id, contest_id, first_name, middle_name, last_name,
                designation, ballot_order
              )
              values (?, ?, ?, ?, ?, ?, (select coalesce(max(ballot_order), 0) + 1 from design_candidates))
            `,
            candidate.id,
            contest.id,
            candidate.firstName ?? null,
            candidate.middleName ?? null,
            candidate.lastName ?? null,
            candidate.designation ?? null
          );
          for (const partyId of candidate.partyIds ?? []) {
            this.client.run(
              'insert into design_candidates_parties (candidate_id, party_id) values (?, ?)',
              candidate.id,
              partyId
            );
          }
        }

        if (ballotOrder === undefined) {
          const allContests = this.client.all(
            'select id, type from design_contests where election_id = ? order by ballot_order',
            electionId
          ) as Array<{ id: string; type: string }>;
          const contestIds = contestOrderPlacingNewCandidateContest(
            allContests,
            contest.id
          );
          if (contestIds) {
            for (const contestId of contestIds) {
              this.client.run(
                `update design_contests set ballot_order = ${nextBallotOrder} where id = ? and election_id = ?`,
                contestId,
                electionId
              );
            }
          }
        }
        break;
      }

      case 'yesno': {
        this.client.run(
          `
            insert into design_contests (
              id, election_id, title, type, district_id, description,
              yes_option_id, yes_option_label, no_option_id, no_option_label,
              additional_options, ballot_order
            )
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${ballotOrder ? '?' : nextBallotOrder})
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

  private insertPollingPlace(
    electionId: ElectionId,
    place: PollingPlace
  ): Result<void, SetPollingPlaceError> {
    assert(
      Object.values(place.precincts).every((p) => p.type === 'whole'),
      'partial precinct coverage not yet supported for polling places'
    );
    assert(
      this.client.isInTransaction(),
      'Expected to be within a transaction'
    );
    try {
      this.client.run(
        'insert into design_polling_places (election_id, id, name, type) values (?, ?, ?, ?)',
        electionId,
        place.id,
        place.name,
        place.type
      );
      for (const precinctId of Object.keys(place.precincts)) {
        this.client.run(
          'insert into design_polling_places_precincts (polling_place_id, precinct_id) values (?, ?)',
          place.id,
          precinctId
        );
      }
    } catch (error) {
      if (
        isDuplicateKeyError(
          error,
          'design_polling_places_uniq_election_id_name_type'
        )
      ) {
        return err('duplicate-name');
      }
      if (isForeignKeyError(error)) {
        return err('invalid-precinct');
      }
      // @coverage-defer
      throw error;
    }
    return ok();
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
    if (
      isDuplicateKeyError(
        error,
        'design_precincts_election_id_name_unique_index'
      )
    ) {
      return err('duplicate-precinct-name');
    }
    if (
      isDuplicateKeyError(
        error,
        'design_precinct_splits_precinct_id_name_unique_index'
      )
    ) {
      return err('duplicate-split-name');
    }
    throw error;
  }

  private handlePartyError(
    partyId: string,
    error: unknown
  ): Result<void, DuplicatePartyError> {
    if (
      isDuplicateKeyError(error, 'design_parties_election_id_name_unique_index')
    ) {
      return err({ code: 'duplicate-name', partyId });
    }
    if (
      isDuplicateKeyError(
        error,
        'design_parties_election_id_full_name_unique_index'
      )
    ) {
      return err({ code: 'duplicate-full-name', partyId });
    }
    if (
      isDuplicateKeyError(
        error,
        'design_parties_election_id_abbrev_unique_index'
      )
    ) {
      return err({ code: 'duplicate-abbrev', partyId });
    }
    throw error;
  }

  private handleContestError(
    error: unknown
  ): Result<void, DuplicateContestError> {
    if (isDuplicateKeyError(error, 'design_contests_unique_index')) {
      return err('duplicate-contest');
    }
    if (isDuplicateKeyError(error, 'design_candidates_unique_index')) {
      return err('duplicate-candidate');
    }
    throw error;
  }
}
