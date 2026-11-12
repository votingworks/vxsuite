import {
  assert,
  DateWithoutTime,
  err,
  ok,
  type Result,
} from '@votingworks/basics';
import type { Client as DbClient } from '@votingworks/db';
import type {
  DistrictsUpdate,
  DuplicateDistrictError,
  ElectionInfo,
  ElectionInfoUpdate,
} from '@votingworks/election-definition-backend';
import {
  type District,
  DistrictSchema,
  type ElectionId,
  type ElectionType,
  LanguageCodeSchema,
  unsafeParse,
  unsafeParseJson,
} from '@votingworks/types';
import { z } from 'zod/v4';

const NATURAL_SORT_COLLATOR = new Intl.Collator('en', { numeric: true });

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

/**
 * Stores the election being defined on VxAdmin.
 */
export class ElectionDefinitionStore {
  private readonly client: DbClient;

  constructor(client: DbClient) {
    this.client = client;
  }

  getInProgressElection(): ElectionInfo | undefined {
    const row = this.client.one(
      `
      select
        id as electionId,
        type,
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

  createInProgressElection(electionInfo: ElectionInfoUpdate): void {
    this.client.run(
      `
      insert into design_elections (
        id,
        type,
        title,
        date,
        state,
        jurisdiction_name,
        seal,
        signature_image,
        signature_caption,
        language_codes
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      electionInfo.electionId,
      electionInfo.type,
      electionInfo.title,
      electionInfo.date.toISOString(),
      electionInfo.state,
      electionInfo.jurisdictionName,
      electionInfo.seal,
      electionInfo.signatureImage ?? null,
      electionInfo.signatureCaption ?? null,
      JSON.stringify(electionInfo.languageCodes)
    );
  }

  updateInProgressElectionInfo(electionInfo: ElectionInfoUpdate): void {
    this.client.run(
      `
      update design_elections
      set
        type = ?,
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
}
