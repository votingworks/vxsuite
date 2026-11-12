import {
  assert,
  DateWithoutTime,
  err,
  ok,
  iter,
  type Result,
  uniqueDeep,
} from '@votingworks/basics';
import type { Client as DbClient } from '@votingworks/db';
import type {
  DistrictsUpdate,
  DuplicateDistrictError,
  DuplicatePrecinctError,
  ElectionInfo,
  ElectionInfoUpdate,
  PollingPlaceDelete,
  PollingPlaceSet,
  PrecinctCreate,
  PrecinctDelete,
  PrecinctUpdate,
  SetPollingPlaceError,
} from '@votingworks/election-definition-backend';
import {
  type District,
  type DistrictId,
  DistrictSchema,
  type ElectionId,
  type ElectionRegisteredVoterCounts,
  type ElectionType,
  hasSplits,
  isPrecinctCount,
  isSplitCounts,
  LanguageCodeSchema,
  type NhPrecinctSplitOptions,
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

  createPrecinct(input: PrecinctCreate): Result<void, DuplicatePrecinctError> {
    return this.writePrecinct(
      input.electionId,
      input.newPrecinct,
      input.registeredVoterCounts
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
    unparsedRegisteredVoterCounts?: PrecinctRegisteredVoterCountEntry
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
                splitCount
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
              registeredVoterCounts
            );
          }
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
      counts[precinctId] = count;
    }
    for (const { precinctId, splitId, count } of splitCountRows) {
      const existing = counts[precinctId];
      counts[precinctId] = {
        splits: {
          ...(existing !== undefined && isSplitCounts(existing)
            ? existing.splits
            : {}),
          [splitId]: count,
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
}
