import {
  assert,
  assertDefined,
  DateWithoutTime,
  err,
  ok,
  iter,
  type Result,
  throwIllegalValue,
  uniqueDeep,
} from '@votingworks/basics';
import type { Bindable, Client as DbClient } from '@votingworks/db';
import {
  type BallotLayoutSettings,
  type BallotLayoutSettingsUpdate,
  type ContestCreate,
  type ContestDelete,
  type ContestsReorder,
  type ContestUpdate,
  type DistrictsUpdate,
  type DuplicateContestError,
  type DuplicateDistrictError,
  type DuplicatePartyError,
  type DuplicatePartyErrorCode,
  type DuplicatePrecinctError,
  type ElectionInfo,
  type ElectionInfoUpdate,
  generateStraightPartyContest,
  hasDuplicateOptionLabels,
  type PartiesUpdate,
  type PollingPlaceDelete,
  type PollingPlaceSet,
  type PrecinctCreate,
  type PrecinctDelete,
  type PrecinctUpdate,
  type SetPollingPlaceError,
} from '@votingworks/election-definition-backend';
import { type BallotTemplateId, generateBallotStyles } from '@votingworks/hmpb';
import {
  type BallotStyle,
  type BallotStyleGroupId,
  type Candidate,
  type CandidateContest,
  type CandidateId,
  type CandidateOrderings,
  type Contest,
  type ContestId,
  ContestSchema,
  type District,
  type DistrictId,
  DistrictSchema,
  type Election,
  type ElectionId,
  type ElectionRegisteredVoterCounts,
  type ElectionType,
  hasSplits,
  isPrecinctCount,
  isSplitCounts,
  type HmpbBallotPaperSize,
  type LanguageCode,
  LanguageCodeSchema,
  type NhPrecinctSplitOptions,
  type Party,
  type PartyId,
  PartySchema,
  type PollingPlace,
  PollingPlaceSchema,
  type PollingPlaceType,
  type Precinct,
  type PrecinctId,
  type PrecinctRegisteredVoterCountEntry,
  PrecinctRegisteredVoterCountEntrySchema,
  PrecinctSchema,
  type PrecinctSplit,
  type PrecinctSplitId,
  type SystemSettings,
  SystemSettingsSchema,
  unsafeParse,
  unsafeParseJson,
  type YesNoContest,
  YesNoOptionSchema,
} from '@votingworks/types';
import { z } from 'zod/v4';
import type { TranslatedString } from './translations.js';

/** Progress of building an election package. */
export interface ElectionPackageProgress {
  label: string;
  progress: number;
  total: number;
}

/** The election package of a finalized election definition. */
export type ElectionDefinitionPackage =
  | { status: 'running'; progress?: ElectionPackageProgress }
  | {
      status: 'succeeded';
      ballotHash: string;
      officialBallotsPath: string;
      sampleBallotsPath?: string;
      testBallotsPath?: string;
    }
  | { status: 'failed'; error: string };

const NATURAL_SORT_COLLATOR = new Intl.Collator('en', { numeric: true });
const ALPHABETICAL_SORT_COLLATOR = new Intl.Collator('en');

const PLACEHOLDER_JURISDICTION_ID = 'jurisdiction';

function isDuplicateDistrictNameError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    error.code === 'SQLITE_CONSTRAINT_UNIQUE' &&
    error.message.includes(
      'design_districts.election_id, design_districts.name'
    )
  );
}

function extractDuplicatePartyErrorCode(
  error: unknown
): DuplicatePartyErrorCode | undefined {
  if (isDuplicateContestError(error)) {
    return 'duplicate-contest';
  }
  if (
    !(
      error instanceof Error &&
      'code' in error &&
      error.code === 'SQLITE_CONSTRAINT_UNIQUE' &&
      error.message.includes('design_parties.')
    )
  ) {
    return undefined;
  }
  if (error.message.includes('design_parties.name')) {
    return 'duplicate-name';
  }
  if (error.message.includes('design_parties.full_name')) {
    return 'duplicate-full-name';
  }
  if (error.message.includes('design_parties.abbrev')) {
    return 'duplicate-abbrev';
  }
  // @coverage-exclude: design_parties has no other unique indexes
  return undefined;
}

function isDuplicateContestError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    error.code === 'SQLITE_CONSTRAINT_UNIQUE' &&
    error.message.includes("index 'design_contests_unique_index'")
  );
}

function isDuplicateCandidateError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    error.code === 'SQLITE_CONSTRAINT_UNIQUE' &&
    error.message.includes("index 'design_candidates_unique_index'")
  );
}

function isDuplicatePrecinctNameError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    error.code === 'SQLITE_CONSTRAINT_UNIQUE' &&
    error.message.includes(
      'design_precincts.election_id, design_precincts.name'
    )
  );
}

function isDuplicatePrecinctSplitNameError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    error.code === 'SQLITE_CONSTRAINT_UNIQUE' &&
    error.message.includes(
      'design_precinct_splits.precinct_id, design_precinct_splits.name'
    )
  );
}

function isDuplicatePollingPlaceNameError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    error.code === 'SQLITE_CONSTRAINT_UNIQUE' &&
    error.message.includes(
      'design_polling_places.election_id, design_polling_places.name, design_polling_places.type'
    )
  );
}

interface DistrictIdRow {
  ownerId: string;
  districtId: DistrictId;
}

function parseRegisteredVoterCounts(
  registeredVoterCounts?: PrecinctRegisteredVoterCountEntry
): PrecinctRegisteredVoterCountEntry | undefined {
  return registeredVoterCounts === undefined
    ? undefined
    : unsafeParse(
        PrecinctRegisteredVoterCountEntrySchema,
        registeredVoterCounts
      );
}

function hasDuplicateSplitDistricts(precinct: Precinct): boolean {
  return (
    hasSplits(precinct) &&
    uniqueDeep(precinct.splits, (split) => split.districtIds.toSorted())
      .length !== precinct.splits.length
  );
}

function catchDuplicateContestErrors(
  write: () => void
): Result<void, DuplicateContestError> {
  try {
    write();
    return ok();
  } catch (error) {
    if (isDuplicateContestError(error)) {
      return err('duplicate-contest');
    }
    if (isDuplicateCandidateError(error)) {
      return err('duplicate-candidate');
    }
    throw error;
  }
}

interface ContestRow {
  id: ContestId;
  title: string;
  type: 'candidate' | 'yesno';
  districtId: DistrictId;
  seats: number | null;
  allowWriteIns: number | null;
  partyId: PartyId | null;
  termDescription: string | null;
  description: string | null;
  yesOptionId: string | null;
  yesOptionLabel: string | null;
  noOptionId: string | null;
  noOptionLabel: string | null;
  additionalOptions: string | null;
}

interface CandidateRow {
  id: CandidateId;
  contestId: ContestId;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  designation: string | null;
}

interface CandidatePartyRow {
  candidateId: CandidateId;
  partyId: PartyId;
  partyName: string;
}

function contestColumnValues(
  contest: CandidateContest | YesNoContest
): Bindable[] {
  switch (contest.type) {
    case 'candidate':
      return [
        contest.title,
        contest.type,
        contest.districtId,
        contest.seats,
        contest.allowWriteIns ? 1 : 0,
        contest.partyId ?? null,
        contest.termDescription ?? null,
        null,
        null,
        null,
        null,
        null,
        null,
      ];
    case 'yesno':
      return [
        contest.title,
        contest.type,
        contest.districtId,
        null,
        null,
        null,
        null,
        contest.description,
        contest.options[0].id,
        contest.options[0].label,
        contest.options[1].id,
        contest.options[1].label,
        JSON.stringify(contest.options.slice(2)),
      ];
    default:
      throwIllegalValue(contest, 'type');
  }
}

function catchDuplicatePrecinctNames(
  write: () => void
): Result<void, DuplicatePrecinctError> {
  try {
    write();
    return ok();
  } catch (error) {
    if (isDuplicatePrecinctNameError(error)) {
      return err('duplicate-precinct-name');
    }
    if (isDuplicatePrecinctSplitNameError(error)) {
      return err('duplicate-split-name');
    }
    throw error;
  }
}

/**
 * Stores the election being defined on VxAdmin.
 */
export class ElectionDefinitionStore {
  private readonly client: DbClient;

  constructor(client: DbClient) {
    this.client = client;
  }

  getElectionInfo(): ElectionInfo | undefined {
    const row = this.client.one(
      `
      select
        id as electionId,
        type,
        is_mi_combined_ballot_primary as isMiCombinedBallotPrimary,
        title,
        date,
        state,
        jurisdiction_name as jurisdictionName,
        seal,
        signature_image as signatureImage,
        signature_caption as signatureCaption,
        language_codes as languageCodes
      from design_elections
    `
    ) as
      | {
          electionId: ElectionId;
          type: ElectionType;
          isMiCombinedBallotPrimary: number;
          title: string;
          date: string;
          state: string;
          jurisdictionName: string;
          seal: string;
          signatureImage: string | null;
          signatureCaption: string | null;
          languageCodes: string;
        }
      | undefined;
    if (!row) {
      return undefined;
    }
    return {
      electionId: row.electionId,
      type: row.type,
      isMiCombinedBallotPrimary: row.isMiCombinedBallotPrimary === 1,
      title: row.title,
      date: new DateWithoutTime(row.date),
      state: row.state,
      jurisdictionName: row.jurisdictionName,
      seal: row.seal,
      signatureImage: row.signatureImage ?? undefined,
      signatureCaption: row.signatureCaption ?? undefined,
      languageCodes: unsafeParseJson(
        row.languageCodes,
        z.array(LanguageCodeSchema)
      ),
    };
  }

  // TODO fill this method in after all election entities are added to the store
  getElection(electionId: ElectionId): Election | undefined {
    return this.getElectionWithCandidateOrderings(electionId)?.election;
  }

  getElectionWithCandidateOrderings(
    electionId: ElectionId,
    { straightPartyVoting = false }: { straightPartyVoting?: boolean } = {}
  ):
    | {
        election: Election;
        candidateOrderings: Map<BallotStyleGroupId, CandidateOrderings>;
      }
    | undefined {
    const electionInfo = this.getElectionInfo();
    if (electionInfo?.electionId !== electionId) {
      return undefined;
    }
    const { ballotStyles, candidateOrderings } =
      this.generateBallotStyles(electionId);
    const districts = this.listDistricts(electionId);
    const parties = this.listParties(electionId);
    const contests = this.listContests(electionId);
    const straightPartyContest =
      straightPartyVoting && electionInfo.type === 'general'
        ? generateStraightPartyContest({
            electionId,
            districts,
            parties,
            ballotStyles,
          })
        : undefined;
    const election: Election = {
      id: electionInfo.electionId,
      type: electionInfo.type,
      title: electionInfo.title,
      date: electionInfo.date,
      state: electionInfo.state,
      jurisdiction: {
        id: PLACEHOLDER_JURISDICTION_ID,
        name: electionInfo.jurisdictionName,
      },
      seal: electionInfo.seal,
      ...(electionInfo.signatureImage !== undefined &&
      electionInfo.signatureCaption !== undefined
        ? {
            signature: {
              image: electionInfo.signatureImage,
              caption: electionInfo.signatureCaption,
            },
          }
        : {}),
      districts,
      precincts: this.listPrecincts(electionId),
      pollingPlaces: this.listPollingPlaces(electionId),
      parties,
      contests: straightPartyContest
        ? [straightPartyContest, ...contests]
        : contests,
      ballotStyles,
      ballotLayout: {
        paperSize: this.getBallotLayoutSettings(electionId).paperSize,
        metadataEncoding: 'qr-code',
      },
      ballotStrings: {},
    };
    return { election, candidateOrderings };
  }

  getBallotLayoutSettings(electionId: ElectionId): BallotLayoutSettings {
    const row = assertDefined(
      this.client.one(
        `
        select
          ballot_paper_size as paperSize,
          ballot_compact as compact
        from design_elections
        where id = ?
      `,
        electionId
      ) as { paperSize: HmpbBallotPaperSize; compact: number } | undefined,
      'Election not found'
    );
    return { paperSize: row.paperSize, compact: row.compact === 1 };
  }

  updateBallotLayoutSettings(input: BallotLayoutSettingsUpdate): void {
    assert(
      this.client.one(
        `
        update design_elections
        set
          ballot_paper_size = ?,
          ballot_compact = ?,
          updated_at = current_timestamp
        where id = ?
        returning id
      `,
        input.paperSize,
        input.compact ? 1 : 0,
        input.electionId
      ),
      'Election not found'
    );
  }

  listBallotStyles(electionId: ElectionId): BallotStyle[] {
    return this.generateBallotStyles(electionId).ballotStyles;
  }

  private generateBallotStyles(
    electionId: ElectionId
  ): ReturnType<typeof generateBallotStyles> {
    const electionInfo = assertDefined(this.getElectionInfo());
    assert(electionInfo.electionId === electionId, 'Election not found');
    return generateBallotStyles({
      ballotLanguageConfigs: electionInfo.languageCodes.map((languageCode) => ({
        languages: [languageCode],
      })),
      contests: this.listContests(electionId),
      electionType: electionInfo.type,
      isMiCombinedBallotPrimary: !!electionInfo.isMiCombinedBallotPrimary,
      parties: this.listParties(electionId),
      precincts: this.listPrecincts(electionId),
      ballotTemplateId: this.getBallotTemplateId(electionId),
      electionId,
    });
  }

  getBallotTemplateId(electionId: ElectionId): BallotTemplateId {
    const { ballotTemplateId } = assertDefined(
      this.client.one(
        'select ballot_template_id as ballotTemplateId from design_elections where id = ?',
        electionId
      ) as { ballotTemplateId: BallotTemplateId } | undefined,
      'Election not found'
    );
    return ballotTemplateId;
  }

  createInProgressElection(
    electionInfo: ElectionInfoUpdate,
    systemSettings: SystemSettings,
    ballotTemplateId: BallotTemplateId
  ): void {
    this.client.run(
      `
      insert into design_elections (
        id,
        type,
        is_mi_combined_ballot_primary,
        ballot_template_id,
        title,
        date,
        state,
        jurisdiction_name,
        seal,
        signature_image,
        signature_caption,
        language_codes,
        system_settings
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      electionInfo.electionId,
      electionInfo.type,
      electionInfo.isMiCombinedBallotPrimary ? 1 : 0,
      ballotTemplateId,
      electionInfo.title,
      electionInfo.date.toISOString(),
      electionInfo.state,
      electionInfo.jurisdictionName,
      electionInfo.seal,
      electionInfo.signatureImage ?? null,
      electionInfo.signatureCaption ?? null,
      JSON.stringify(electionInfo.languageCodes),
      JSON.stringify(systemSettings)
    );
  }

  updateInProgressElectionInfo(electionInfo: ElectionInfoUpdate): void {
    this.client.run(
      `
      update design_elections
      set
        type = ?,
        is_mi_combined_ballot_primary = ?,
        title = ?,
        date = ?,
        state = ?,
        jurisdiction_name = ?,
        seal = ?,
        signature_image = ?,
        signature_caption = ?,
        language_codes = ?,
        updated_at = current_timestamp
      where id = ?
    `,
      electionInfo.type,
      electionInfo.isMiCombinedBallotPrimary ? 1 : 0,
      electionInfo.title,
      electionInfo.date.toISOString(),
      electionInfo.state,
      electionInfo.jurisdictionName,
      electionInfo.seal,
      electionInfo.signatureImage ?? null,
      electionInfo.signatureCaption ?? null,
      JSON.stringify(electionInfo.languageCodes),
      electionInfo.electionId
    );
  }

  deleteInProgressElection(): void {
    this.client.run('delete from design_elections');
  }

  getSystemSettings(electionId: ElectionId): SystemSettings {
    const row = assertDefined(
      this.client.one(
        `
        select system_settings as systemSettings
        from design_elections
        where id = ?
      `,
        electionId
      ) as { systemSettings: string } | undefined,
      'Election not found'
    );
    return unsafeParseJson(row.systemSettings, SystemSettingsSchema);
  }

  isElectionEditable(electionId: ElectionId): boolean {
    const row = assertDefined(
      this.client.one(
        `
        select status
        from design_elections
        where id = ?
      `,
        electionId
      ) as { status: 'in_progress' | 'finalized' } | undefined,
      'Election not found'
    );
    return row.status === 'in_progress';
  }

  finalizeElection(electionId: ElectionId): void {
    this.client.transaction(() => {
      assert(
        this.client.one(
          `
          update design_elections
          set
            status = 'finalized',
            updated_at = current_timestamp
          where id = ? and status = 'in_progress'
          returning id
        `,
          electionId
        ),
        'Election is not in progress'
      );
      this.client.run(
        'delete from design_election_packages where election_id = ?',
        electionId
      );
      this.client.run(
        `
        insert into design_election_packages (election_id)
        values (?)
      `,
        electionId
      );
    });
  }

  getElectionPackage(
    electionId: ElectionId
  ): ElectionDefinitionPackage | undefined {
    const row = this.client.one(
      `
      select
        status,
        progress_label as progressLabel,
        progress,
        progress_total as progressTotal,
        error,
        ballot_hash as ballotHash,
        official_ballots_path as officialBallotsPath,
        sample_ballots_path as sampleBallotsPath,
        test_ballots_path as testBallotsPath
      from design_election_packages
      where election_id = ?
    `,
      electionId
    ) as
      | {
          status: ElectionDefinitionPackage['status'];
          progressLabel: string | null;
          progress: number | null;
          progressTotal: number | null;
          error: string | null;
          ballotHash: string | null;
          officialBallotsPath: string | null;
          sampleBallotsPath: string | null;
          testBallotsPath: string | null;
        }
      | undefined;
    if (!row) {
      return undefined;
    }
    switch (row.status) {
      case 'running':
        return {
          status: 'running',
          progress:
            row.progressLabel === null
              ? undefined
              : {
                  label: row.progressLabel,
                  progress: assertDefined(row.progress),
                  total: assertDefined(row.progressTotal),
                },
        };
      case 'succeeded':
        return {
          status: 'succeeded',
          ballotHash: assertDefined(row.ballotHash),
          officialBallotsPath: assertDefined(row.officialBallotsPath),
          sampleBallotsPath: row.sampleBallotsPath ?? undefined,
          testBallotsPath: row.testBallotsPath ?? undefined,
        };
      case 'failed':
        return { status: 'failed', error: assertDefined(row.error) };
      default:
        throwIllegalValue(row.status);
    }
  }

  updateElectionPackageProgress(
    electionId: ElectionId,
    { label, progress, total }: ElectionPackageProgress
  ): void {
    this.client.run(
      `
      update design_election_packages
      set
        progress_label = ?,
        progress = ?,
        progress_total = ?
      where election_id = ? and status = 'running'
    `,
      label,
      progress,
      total,
      electionId
    );
  }

  completeElectionPackage(
    electionId: ElectionId,
    result: Omit<
      Extract<ElectionDefinitionPackage, { status: 'succeeded' }>,
      'status'
    >
  ): void {
    this.client.run(
      `
      update design_election_packages
      set
        status = 'succeeded',
        ballot_hash = ?,
        official_ballots_path = ?,
        sample_ballots_path = ?,
        test_ballots_path = ?,
        completed_at = current_timestamp
      where election_id = ? and status = 'running'
    `,
      result.ballotHash,
      result.officialBallotsPath,
      result.sampleBallotsPath ?? null,
      result.testBallotsPath ?? null,
      electionId
    );
  }

  failElectionPackage(electionId: ElectionId, error: string): void {
    this.client.transaction(() => {
      const failed = this.client.one(
        `
        update design_election_packages
        set
          status = 'failed',
          error = ?,
          completed_at = current_timestamp
        where election_id = ? and status = 'running'
        returning election_id
      `,
        error,
        electionId
      );
      if (failed) {
        this.returnToEditing(electionId);
      }
    });
  }

  private returnToEditing(electionId: ElectionId): void {
    this.client.run(
      `
      update design_elections
      set
        status = 'in_progress',
        updated_at = current_timestamp
      where id = ?
    `,
      electionId
    );
  }

  failInterruptedElectionPackages(error: string): ElectionId[] {
    return this.client.transaction(() => {
      const electionIds = (
        this.client.all(
          `
          update design_election_packages
          set
            status = 'failed',
            error = ?,
            completed_at = current_timestamp
          where status = 'running'
          returning election_id as electionId
        `,
          error
        ) as Array<{ electionId: ElectionId }>
      ).map(({ electionId }) => electionId);
      for (const electionId of electionIds) {
        this.returnToEditing(electionId);
      }
      return electionIds;
    });
  }

  listDistricts(electionId: ElectionId): District[] {
    const districts = this.client.all(
      `
      select id, name
      from design_districts
      where election_id = ?
    `,
      electionId
    ) as District[];
    return districts.toSorted((a, b) =>
      NATURAL_SORT_COLLATOR.compare(a.name, b.name)
    );
  }

  updateDistricts(
    input: DistrictsUpdate
  ): Result<void, DuplicateDistrictError> {
    const { electionId } = input;
    return this.client.transaction(
      (): Result<void, DuplicateDistrictError> => {
        for (const districtId of input.deletedDistrictIds ?? []) {
          this.client.run(
            'delete from design_districts where id = ? and election_id = ?',
            districtId,
            electionId
          );
        }

        for (const d of input.updatedDistricts ?? []) {
          const district = unsafeParse(DistrictSchema, d);
          const result = this.writeDistrict(district, () =>
            assert(
              this.client.one(
                'update design_districts set name = ? where id = ? and election_id = ? returning id',
                district.name,
                district.id,
                electionId
              ),
              'District not found'
            )
          );
          if (result.isErr()) return result;
        }

        for (const d of input.newDistricts ?? []) {
          const district = unsafeParse(DistrictSchema, d);
          const result = this.writeDistrict(district, () =>
            this.client.run(
              'insert into design_districts (id, election_id, name) values (?, ?, ?)',
              district.id,
              electionId,
              district.name
            )
          );
          if (result.isErr()) return result;
        }

        return ok();
      },
      (result) => result.isOk()
    );
  }

  private writeDistrict(
    district: District,
    write: () => void
  ): Result<void, DuplicateDistrictError> {
    try {
      write();
      return ok();
    } catch (error) {
      if (isDuplicateDistrictNameError(error)) {
        return err({ code: 'duplicate-name', districtId: district.id });
      }
      throw error;
    }
  }

  listParties(electionId: ElectionId): Party[] {
    const parties = this.client.all(
      `
      select id, name, full_name as fullName, abbrev
      from design_parties
      where election_id = ?
    `,
      electionId
    ) as Party[];
    return parties.toSorted((a, b) =>
      ALPHABETICAL_SORT_COLLATOR.compare(a.name, b.name)
    );
  }

  updateParties(input: PartiesUpdate): Result<void, DuplicatePartyError> {
    const { electionId } = input;
    return this.client.transaction(
      (): Result<void, DuplicatePartyError> => {
        for (const partyId of input.deletedPartyIds ?? []) {
          const result = this.writeParty(partyId, () =>
            this.client.run(
              'delete from design_parties where id = ? and election_id = ?',
              partyId,
              electionId
            )
          );
          if (result.isErr()) return result;
        }

        for (const p of input.updatedParties ?? []) {
          const party = unsafeParse(PartySchema, p);
          const result = this.writeParty(party.id, () =>
            assert(
              this.client.one(
                'update design_parties set name = ?, full_name = ?, abbrev = ? where id = ? and election_id = ? returning id',
                party.name,
                party.fullName,
                party.abbrev,
                party.id,
                electionId
              ),
              'Party not found'
            )
          );
          if (result.isErr()) return result;
        }

        for (const p of input.newParties ?? []) {
          const party = unsafeParse(PartySchema, p);
          const result = this.writeParty(party.id, () =>
            this.client.run(
              'insert into design_parties (id, election_id, name, full_name, abbrev) values (?, ?, ?, ?, ?)',
              party.id,
              electionId,
              party.name,
              party.fullName,
              party.abbrev
            )
          );
          if (result.isErr()) return result;
        }

        return ok();
      },
      (result) => result.isOk()
    );
  }

  private writeParty(
    partyId: PartyId,
    write: () => void
  ): Result<void, DuplicatePartyError> {
    try {
      write();
      return ok();
    } catch (error) {
      const code = extractDuplicatePartyErrorCode(error);
      if (code) {
        return err({ code, partyId });
      }
      throw error;
    }
  }

  listContests(electionId: ElectionId): Contest[] {
    const contestRows = this.client.all(
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
    ) as ContestRow[];
    const candidateRowsByContestId = iter(
      this.client.all(
        `
        select
          design_candidates.id,
          design_candidates.contest_id as contestId,
          design_candidates.first_name as firstName,
          design_candidates.middle_name as middleName,
          design_candidates.last_name as lastName,
          design_candidates.designation
        from design_candidates
        join design_contests
          on design_contests.id = design_candidates.contest_id
        where design_contests.election_id = ?
        order by design_candidates.ballot_order
      `,
        electionId
      ) as CandidateRow[]
    ).toMap((row) => row.contestId);
    const partyRowsByCandidateId = iter(
      (
        this.client.all(
          `
          select
            design_candidates_parties.candidate_id as candidateId,
            design_parties.id as partyId,
            design_parties.name as partyName
          from design_candidates_parties
          join design_parties
            on design_parties.id = design_candidates_parties.party_id
          where design_parties.election_id = ?
        `,
          electionId
        ) as CandidatePartyRow[]
      ).toSorted((a, b) =>
        ALPHABETICAL_SORT_COLLATOR.compare(a.partyName, b.partyName)
      )
    ).toMap((row) => row.candidateId);

    function candidateFromRow(row: CandidateRow): Candidate {
      const partyIds = [...(partyRowsByCandidateId.get(row.id) ?? [])].map(
        (partyRow) => partyRow.partyId
      );
      return {
        id: row.id,
        firstName: row.firstName ?? undefined,
        middleName: row.middleName ?? undefined,
        lastName: row.lastName ?? undefined,
        designation: row.designation ?? undefined,
        name: [row.firstName, row.middleName, row.lastName]
          .filter(Boolean)
          .join(' '),
        partyIds: partyIds.length > 0 ? partyIds : undefined,
      };
    }

    return contestRows.map((row): Contest => {
      switch (row.type) {
        case 'candidate':
          return {
            id: row.id,
            title: row.title,
            type: row.type,
            districtId: row.districtId,
            seats: assertDefined(row.seats),
            allowWriteIns: assertDefined(row.allowWriteIns) === 1,
            partyId: row.partyId ?? undefined,
            termDescription: row.termDescription ?? undefined,
            candidates: [...(candidateRowsByContestId.get(row.id) ?? [])].map(
              candidateFromRow
            ),
          };
        case 'yesno':
          return {
            id: row.id,
            title: row.title,
            type: row.type,
            districtId: row.districtId,
            description: assertDefined(row.description),
            options: [
              {
                id: assertDefined(row.yesOptionId),
                label: assertDefined(row.yesOptionLabel),
              },
              {
                id: assertDefined(row.noOptionId),
                label: assertDefined(row.noOptionLabel),
              },
              ...unsafeParseJson(
                assertDefined(row.additionalOptions),
                z.array(YesNoOptionSchema)
              ),
            ],
          };
        default:
          return throwIllegalValue(row.type);
      }
    });
  }

  createContest(input: ContestCreate): Result<void, DuplicateContestError> {
    const { electionId } = input;
    return this.writeContest(input.newContest, (contest) => {
      const { ballotOrder } = this.client.one(
        'select ifnull(max(ballot_order) + 1, 0) as ballotOrder from design_contests where election_id = ?',
        electionId
      ) as { ballotOrder: number };
      this.client.run(
        `
        insert into design_contests (
          id,
          election_id,
          ballot_order,
          title,
          type,
          district_id,
          seats,
          allow_write_ins,
          party_id,
          term_description,
          description,
          yes_option_id,
          yes_option_label,
          no_option_id,
          no_option_label,
          additional_options
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        contest.id,
        electionId,
        ballotOrder,
        ...contestColumnValues(contest)
      );
      this.reorderContestsAfterInsertion(electionId, contest);
    });
  }

  /**
   * Updates the order of contests to include the new contest so that all
   * candidate contests still precede all ballot measure contests.
   */
  private reorderContestsAfterInsertion(
    electionId: ElectionId,
    contest: CandidateContest | YesNoContest
  ): void {
    if (contest.type !== 'candidate') {
      return;
    }
    const { firstBallotMeasureOrder } = this.client.one(
      `
      select min(ballot_order) as firstBallotMeasureOrder
      from design_contests
      where election_id = ? and type = 'yesno'
    `,
      electionId
    ) as { firstBallotMeasureOrder: number | null };
    if (firstBallotMeasureOrder === null) {
      return;
    }
    this.client.run(
      'update design_contests set ballot_order = ballot_order + 1 where election_id = ? and ballot_order >= ? and id != ?',
      electionId,
      firstBallotMeasureOrder,
      contest.id
    );
    this.client.run(
      'update design_contests set ballot_order = ? where id = ?',
      firstBallotMeasureOrder,
      contest.id
    );
  }

  updateContest(input: ContestUpdate): Result<void, DuplicateContestError> {
    const { electionId } = input;
    return this.writeContest(input.updatedContest, (contest) => {
      assert(
        this.client.one(
          `
          update design_contests set
            title = ?,
            type = ?,
            district_id = ?,
            seats = ?,
            allow_write_ins = ?,
            party_id = ?,
            term_description = ?,
            description = ?,
            yes_option_id = ?,
            yes_option_label = ?,
            no_option_id = ?,
            no_option_label = ?,
            additional_options = ?
          where id = ? and election_id = ?
          returning id
        `,
          ...contestColumnValues(contest),
          contest.id,
          electionId
        ),
        'Contest not found'
      );
    });
  }

  private writeContest(
    unparsedContest: Contest,
    writeContestRow: (contest: CandidateContest | YesNoContest) => void
  ): Result<void, DuplicateContestError> {
    const contest = unsafeParse(ContestSchema, unparsedContest);
    assert(
      contest.type !== 'straight-party',
      'Straight party contests are not supported'
    );
    if (contest.type === 'yesno' && hasDuplicateOptionLabels(contest)) {
      return err('duplicate-option');
    }
    return catchDuplicateContestErrors(() =>
      this.client.transaction(() => {
        writeContestRow(contest);
        this.client.run(
          'delete from design_candidates where contest_id = ?',
          contest.id
        );
        if (contest.type !== 'candidate') {
          return;
        }
        for (const [index, candidate] of contest.candidates.entries()) {
          this.client.run(
            `
            insert into design_candidates (
              id,
              contest_id,
              first_name,
              middle_name,
              last_name,
              designation,
              ballot_order
            ) values (?, ?, ?, ?, ?, ?, ?)
          `,
            candidate.id,
            contest.id,
            candidate.firstName ?? null,
            candidate.middleName ?? null,
            candidate.lastName ?? null,
            candidate.designation ?? null,
            index
          );
          for (const partyId of candidate.partyIds ?? []) {
            this.client.run(
              'insert into design_candidates_parties (candidate_id, party_id) values (?, ?)',
              candidate.id,
              partyId
            );
          }
        }
      })
    );
  }

  reorderContests(input: ContestsReorder): void {
    const { electionId, contestIds } = input;
    this.client.transaction(() => {
      const { contestCount } = this.client.one(
        'select count(*) as contestCount from design_contests where election_id = ?',
        electionId
      ) as { contestCount: number };
      assert(
        contestIds.length === contestCount &&
          new Set(contestIds).size === contestIds.length,
        'Contest list is out of date'
      );
      const updatedRows = this.client.all(
        `
        update design_contests
        set ballot_order = contest_order.key
        from json_each(?) as contest_order
        where design_contests.id = contest_order.value
          and design_contests.election_id = ?
        returning design_contests.id
      `,
        JSON.stringify(contestIds),
        electionId
      );
      assert(
        updatedRows.length === contestIds.length,
        'Contest list is out of date'
      );
    });
  }

  deleteContest(input: ContestDelete): void {
    assert(
      this.client.one(
        'delete from design_contests where id = ? and election_id = ? returning id',
        input.contestId,
        input.electionId
      ),
      'Contest not found'
    );
  }

  listPrecincts(electionId: ElectionId): Precinct[] {
    const precinctRows = this.client.all(
      `
      select id, name
      from design_precincts
      where election_id = ?
    `,
      electionId
    ) as Array<{ id: PrecinctId; name: string }>;
    const splitRows = this.client.all(
      `
      select
        design_precinct_splits.id,
        design_precinct_splits.precinct_id as precinctId,
        design_precinct_splits.name,
        design_precinct_splits.nh_options as nhOptions
      from design_precinct_splits
      join design_precincts
        on design_precincts.id = design_precinct_splits.precinct_id
      where design_precincts.election_id = ?
    `,
      electionId
    ) as Array<{
      id: PrecinctSplitId;
      precinctId: PrecinctId;
      name: string;
      nhOptions: string;
    }>;
    const precinctDistrictRows = iter(
      this.client.all(
        `
        select
          design_districts_precincts.precinct_id as ownerId,
          design_districts_precincts.district_id as districtId
        from design_districts_precincts
        join design_precincts
          on design_precincts.id = design_districts_precincts.precinct_id
        where design_precincts.election_id = ?
        order by design_districts_precincts.district_id
      `,
        electionId
      ) as DistrictIdRow[]
    ).toMap((row) => row.ownerId);
    const splitDistrictRows = iter(
      this.client.all(
        `
        select
          design_districts_precinct_splits.precinct_split_id as ownerId,
          design_districts_precinct_splits.district_id as districtId
        from design_districts_precinct_splits
        join design_precinct_splits
          on design_precinct_splits.id =
            design_districts_precinct_splits.precinct_split_id
        join design_precincts
          on design_precincts.id = design_precinct_splits.precinct_id
        where design_precincts.election_id = ?
        order by design_districts_precinct_splits.district_id
      `,
        electionId
      ) as DistrictIdRow[]
    ).toMap((row) => row.ownerId);
    const splitRowsByPrecinctId = iter(
      splitRows.toSorted((a, b) =>
        NATURAL_SORT_COLLATOR.compare(a.name, b.name)
      )
    ).toMap((row) => row.precinctId);

    function districtIds(rows?: Set<DistrictIdRow>): DistrictId[] {
      return [...(rows ?? [])].map((row) => row.districtId);
    }

    return precinctRows
      .toSorted((a, b) => NATURAL_SORT_COLLATOR.compare(a.name, b.name))
      .map(({ id, name }) => {
        const precinctSplitRows = splitRowsByPrecinctId.get(id);
        if (!precinctSplitRows) {
          return {
            id,
            name,
            districtIds: districtIds(precinctDistrictRows.get(id)),
          };
        }
        return {
          id,
          name,
          splits: [...precinctSplitRows].map((split): PrecinctSplit => ({
            id: split.id,
            name: split.name,
            districtIds: districtIds(splitDistrictRows.get(split.id)),
            ...(JSON.parse(split.nhOptions) as NhPrecinctSplitOptions),
          })),
        };
      });
  }

  createPrecinct(
    input: PrecinctCreate,
    generatedPollingPlace?: PollingPlace
  ): Result<void, DuplicatePrecinctError> {
    return this.writePrecinct(
      input.electionId,
      input.newPrecinct,
      input.registeredVoterCounts,
      generatedPollingPlace
    );
  }

  updatePrecinct(input: PrecinctUpdate): Result<void, DuplicatePrecinctError> {
    assert(
      this.client.one(
        'select 1 from design_precincts where id = ? and election_id = ?',
        input.updatedPrecinct.id,
        input.electionId
      ),
      'Precinct not found'
    );
    return this.writePrecinct(
      input.electionId,
      input.updatedPrecinct,
      input.registeredVoterCounts
    );
  }

  private writePrecinct(
    electionId: ElectionId,
    unparsedPrecinct: Precinct,
    unparsedRegisteredVoterCounts?: PrecinctRegisteredVoterCountEntry,
    generatedPollingPlace?: PollingPlace
  ): Result<void, DuplicatePrecinctError> {
    const precinct = unsafeParse(PrecinctSchema, unparsedPrecinct);
    const registeredVoterCounts = parseRegisteredVoterCounts(
      unparsedRegisteredVoterCounts
    );
    if (hasDuplicateSplitDistricts(precinct)) {
      return err('duplicate-split-districts');
    }
    return catchDuplicatePrecinctNames(() =>
      this.client.transaction(() => {
        this.client.run(
          `
          insert into design_precincts (id, election_id, name)
          values (?, ?, ?)
          on conflict (id) do update set name = excluded.name
        `,
          precinct.id,
          electionId,
          precinct.name
        );
        this.client.run(
          'delete from design_districts_precincts where precinct_id = ?',
          precinct.id
        );
        this.client.run(
          'delete from design_precinct_splits where precinct_id = ?',
          precinct.id
        );
        this.client.run(
          'delete from design_precinct_registered_voter_counts where precinct_id = ?',
          precinct.id
        );

        if (hasSplits(precinct)) {
          for (const split of precinct.splits) {
            const { id, name, districtIds, ...nhOptions } = split;
            this.client.run(
              'insert into design_precinct_splits (id, precinct_id, name, nh_options) values (?, ?, ?, ?)',
              id,
              precinct.id,
              name,
              JSON.stringify(nhOptions)
            );
            for (const districtId of districtIds) {
              this.client.run(
                'insert into design_districts_precinct_splits (district_id, precinct_split_id) values (?, ?)',
                districtId,
                id
              );
            }
            const splitCount =
              registeredVoterCounts !== undefined &&
              isSplitCounts(registeredVoterCounts)
                ? registeredVoterCounts.splits[id]
                : undefined;
            if (splitCount !== undefined) {
              this.client.run(
                'insert into design_precinct_split_registered_voter_counts (split_id, count) values (?, ?)',
                id,
                splitCount.total
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
          if (
            registeredVoterCounts !== undefined &&
            isPrecinctCount(registeredVoterCounts)
          ) {
            this.client.run(
              'insert into design_precinct_registered_voter_counts (precinct_id, count) values (?, ?)',
              precinct.id,
              registeredVoterCounts.total
            );
          }
        }

        if (generatedPollingPlace) {
          const placeResult = this.writePollingPlace(
            electionId,
            generatedPollingPlace
          );
          assert(
            placeResult.isOk() || placeResult.err() === 'duplicate-name',
            'Generated polling place is invalid'
          );
        }
      })
    );
  }

  deletePrecinct(input: PrecinctDelete): void {
    assert(
      this.client.one(
        'delete from design_precincts where id = ? and election_id = ? returning id',
        input.precinctId,
        input.electionId
      ),
      'Precinct not found'
    );
  }

  getRegisteredVoterCounts(
    electionId: ElectionId
  ): ElectionRegisteredVoterCounts {
    const precinctCountRows = this.client.all(
      `
      select counts.precinct_id as precinctId, counts.count
      from design_precinct_registered_voter_counts counts
      join design_precincts on design_precincts.id = counts.precinct_id
      where design_precincts.election_id = ?
    `,
      electionId
    ) as Array<{ precinctId: PrecinctId; count: number }>;
    const splitCountRows = this.client.all(
      `
      select
        design_precinct_splits.precinct_id as precinctId,
        counts.split_id as splitId,
        counts.count
      from design_precinct_split_registered_voter_counts counts
      join design_precinct_splits
        on design_precinct_splits.id = counts.split_id
      join design_precincts
        on design_precincts.id = design_precinct_splits.precinct_id
      where design_precincts.election_id = ?
    `,
      electionId
    ) as Array<{
      precinctId: PrecinctId;
      splitId: PrecinctSplitId;
      count: number;
    }>;

    const counts: ElectionRegisteredVoterCounts = {};
    for (const { precinctId, count } of precinctCountRows) {
      counts[precinctId] = { total: count };
    }
    for (const { precinctId, splitId, count } of splitCountRows) {
      const existing = counts[precinctId];
      counts[precinctId] = {
        splits: {
          ...(existing !== undefined && isSplitCounts(existing)
            ? existing.splits
            : {}),
          [splitId]: { total: count },
        },
      };
    }
    return counts;
  }

  listPollingPlaces(electionId: ElectionId): PollingPlace[] {
    const placeRows = this.client.all(
      `
      select id, name, type
      from design_polling_places
      where election_id = ?
    `,
      electionId
    ) as Array<{ id: string; name: string; type: PollingPlaceType }>;
    const precinctRowsByPlaceId = iter(
      this.client.all(
        `
        select
          design_polling_places_precincts.polling_place_id as placeId,
          design_polling_places_precincts.precinct_id as precinctId
        from design_polling_places_precincts
        join design_polling_places
          on design_polling_places.id =
            design_polling_places_precincts.polling_place_id
        where design_polling_places.election_id = ?
        order by design_polling_places_precincts.precinct_id
      `,
        electionId
      ) as Array<{ placeId: string; precinctId: PrecinctId }>
    ).toMap((row) => row.placeId);

    return placeRows
      .toSorted(
        (a, b) =>
          NATURAL_SORT_COLLATOR.compare(a.type, b.type) ||
          NATURAL_SORT_COLLATOR.compare(a.name, b.name)
      )
      .map(({ id, name, type }) => ({
        id,
        name,
        precincts: Object.fromEntries(
          [...(precinctRowsByPlaceId.get(id) ?? [])].map((row) => [
            row.precinctId,
            { type: 'whole' } as const,
          ])
        ),
        type,
      }));
  }

  setPollingPlace(input: PollingPlaceSet): Result<void, SetPollingPlaceError> {
    const place = unsafeParse(PollingPlaceSchema, input.place);
    return this.client.transaction(
      () => this.writePollingPlace(input.electionId, place),
      (result) => result.isOk()
    );
  }

  private writePollingPlace(
    electionId: ElectionId,
    place: PollingPlace
  ): Result<void, SetPollingPlaceError> {
    assert(
      Object.values(place.precincts).every((p) => p.type === 'whole'),
      'Partial precinct coverage is not supported for polling places'
    );
    const electionPrecinctIds = new Set(
      (
        this.client.all(
          'select id from design_precincts where election_id = ?',
          electionId
        ) as Array<{ id: PrecinctId }>
      ).map((row) => row.id)
    );
    const precinctIds = Object.keys(place.precincts);
    if (!precinctIds.every((id) => electionPrecinctIds.has(id))) {
      return err('invalid-precinct');
    }
    try {
      this.client.run(
        `
        insert into design_polling_places (id, election_id, name, type)
        values (?, ?, ?, ?)
        on conflict (id) do update set
          name = excluded.name,
          type = excluded.type
      `,
        place.id,
        electionId,
        place.name,
        place.type
      );
    } catch (error) {
      if (isDuplicatePollingPlaceNameError(error)) {
        return err('duplicate-name');
      }
      throw error;
    }
    this.client.run(
      'delete from design_polling_places_precincts where polling_place_id = ?',
      place.id
    );
    for (const precinctId of precinctIds) {
      this.client.run(
        'insert into design_polling_places_precincts (polling_place_id, precinct_id) values (?, ?)',
        place.id,
        precinctId
      );
    }
    return ok();
  }

  deletePollingPlace(input: PollingPlaceDelete): void {
    assert(
      this.client.one(
        'delete from design_polling_places where id = ? and election_id = ? returning id',
        input.id,
        input.electionId
      ),
      'Polling place not found'
    );
  }

  /**
   * Loads the saved translations for the given language code. Note that these
   * translations may be outdated if the English election content has changed
   * since they were saved. To ensure outdated translations are not used, use
   * `translations.loadStringsAndTranslations` instead of calling this method directly.
   */
  getTranslations(
    electionId: ElectionId,
    languageCode: LanguageCode
  ): Array<Omit<TranslatedString, 'context'>> {
    const rows = this.client.all(
      `
      select
        key,
        english_text as "englishText",
        translated_text as "translatedText"
      from design_translations
      where election_id = ? and language_code = ?
      `,
      electionId,
      languageCode
    ) as Array<{
      key: string;
      englishText: string;
      translatedText: string | null;
    }>;
    return rows.map((row) => ({
      ...row,
      translatedText: row.translatedText ?? undefined,
    }));
  }

  updateTranslations(
    electionId: ElectionId,
    languageCode: LanguageCode,
    translations: Array<Omit<TranslatedString, 'context'>>
  ): void {
    this.client.transaction(() => {
      this.client.run(
        `delete from design_translations where election_id = ? and language_code = ?`,
        electionId,
        languageCode
      );
      for (const translation of translations) {
        this.client.run(
          `
          insert into design_translations (
            election_id,
            language_code,
            key,
            english_text,
            translated_text
          ) values (?, ?, ?, ?, ?)
          `,
          electionId,
          languageCode,
          translation.key,
          translation.englishText,
          translation.translatedText ?? null
        );
      }
    });
  }
}
