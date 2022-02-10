//
// The durable datastore for CVRs and configuration info.
//

import {
  BallotIdSchema,
  BallotPaperSize,
  ElectionDefinition,
  err,
  MarkThresholds,
  MarkThresholdsSchema,
  ok,
  Optional,
  PageInterpretation,
  Precinct,
  Result,
  safeParseElectionDefinition,
  unsafeParse,
} from '@votingworks/types';
import { BatchInfo } from '@votingworks/types/api/services/scan';
import { assert } from '@votingworks/utils';
import makeDebug from 'debug';
import { copyFile, emptyDir, ensureDir, mkdtempSync } from 'fs-extra';
import { DateTime } from 'luxon';
import { tmpdir } from 'os';
import { dirname, extname, join, resolve } from 'path';
import { Writable } from 'stream';
import { v4 as uuid } from 'uuid';
import { buildCastVoteRecord } from './build_cast_vote_record';
import { DbClient } from './db_client';
import {
  BallotSheetTemplate,
  BallotSheetTemplateRecord,
  BallotTemplateRecord,
  ElectionRecord,
  PageInterpretationWithFiles,
  SheetOf,
} from './types';
import { normalizeAndJoin } from './util/path';

const debug = makeDebug('scan:store');

export type SqliteBoolean = 0 | 1;
export type SqliteDateTime = string;
export type Nullable<T> = T | null;

export interface ScanSheetRecord {
  id: string;
  batchId: string;

  // Filenames for where the sheet images are stored on disk.
  frontOriginalFilename: string;
  backOriginalFilename: string;

  // Interpretation of the sheet to use.
  selectedInterpretationId: Nullable<string>;

  createdAt: SqliteDateTime;
  deletedAt: Nullable<SqliteDateTime>;
}

export interface ScanInterpretationRecord {
  id: string;
  sheetId: string;
  interpreter: string;

  // Filenames for where the sheet images are stored on disk.
  frontOriginalFilename: string;
  backOriginalFilename: string;
  frontNormalizedFilename: string;
  backNormalizedFilename: string;

  // Original interpretation of the sheet. These values should never be updated.
  frontInterpretationJson: string;
  backInterpretationJson: string;

  // Did this sheet require adjudication? This value should never be updated.
  requiresAdjudication: SqliteBoolean;

  createdAt: SqliteDateTime;
}

export const SchemaPath = join(__dirname, '../schema.sql');

/**
 * Manages a data store for imported ballot image batches and cast vote records
 * interpreted by reading the sheets.
 */
export class Store {
  /**
   * @param dbPath a file system path, or ":memory:" for an in-memory database
   */
  private constructor(
    private readonly client: DbClient,
    private readonly rootPath: string
  ) {}

  /**
   * Creates a {@link Store} instance for a given root path.
   */
  static fileStore(root: string): Store {
    const resolvedRoot = resolve(root);
    const client = DbClient.fileClient(
      join(resolvedRoot, 'ballots.db'),
      SchemaPath
    );
    return new Store(client, resolvedRoot);
  }

  /**
   * Creates an in-memory {@link Store}.
   */
  static memoryStore(): Store {
    const client = DbClient.memoryClient(SchemaPath);
    return new Store(
      client,
      mkdtempSync(join(tmpdir(), `scan-memory-store-${process.pid}-`))
    );
  }

  /**
   * Gets the root directory for an election's data.
   */
  private getElectionRootPath(electionRecord: ElectionRecord): string {
    return normalizeAndJoin(
      this.rootPath,
      `election-${electionRecord.definition.election.date}-${electionRecord.definition.election.title}-${electionRecord.id}`.replace(
        /[^_a-z0-9-]+/gi,
        '-'
      )
    );
  }

  private getElectionBallotImagesRootPath(
    electionRecord: ElectionRecord
  ): string {
    return normalizeAndJoin(
      this.getElectionRootPath(electionRecord),
      'ballot-images'
    );
  }

  /**
   * Save scanned ballot images to the store.
   */
  async saveBallotImages(
    sheetId: string,
    batchId: string,
    frontOriginalBallotImagePath: string,
    backOriginalBallotImagePath: string,
    frontNormalizedBallotImagePath: string,
    backNormalizedBallotImagePath: string
  ): Promise<void> {
    const election = this.getCurrentElection();
    assert(election, 'no current election');

    const ballotImagesRootPath = this.getElectionBallotImagesRootPath(election);
    const frontOriginalBallotImagePathWithinStore = normalizeAndJoin(
      ballotImagesRootPath,
      `${batchId}/${sheetId}-front-original.${extname(
        frontOriginalBallotImagePath
      )}`
    );
    const backOriginalBallotImagePathWithinStore = normalizeAndJoin(
      ballotImagesRootPath,
      `${batchId}/${sheetId}-back-original.${extname(
        backOriginalBallotImagePath
      )}`
    );
    const frontNormalizedBallotImagePathWithinStore = normalizeAndJoin(
      ballotImagesRootPath,
      `${batchId}/${sheetId}-front-normalized.${extname(
        frontNormalizedBallotImagePath
      )}`
    );
    const backNormalizedBallotImagePathWithinStore = normalizeAndJoin(
      ballotImagesRootPath,
      `${batchId}/${sheetId}-back-normalized.${extname(
        backNormalizedBallotImagePath
      )}`
    );

    await ensureDir(dirname(frontOriginalBallotImagePathWithinStore));
    await copyFile(
      frontOriginalBallotImagePath,
      frontOriginalBallotImagePathWithinStore
    );
    await ensureDir(dirname(backOriginalBallotImagePathWithinStore));
    await copyFile(
      backOriginalBallotImagePath,
      backOriginalBallotImagePathWithinStore
    );
    await ensureDir(dirname(frontNormalizedBallotImagePathWithinStore));
    await copyFile(
      frontNormalizedBallotImagePath,
      frontNormalizedBallotImagePathWithinStore
    );
    await ensureDir(dirname(backNormalizedBallotImagePathWithinStore));
    await copyFile(
      backNormalizedBallotImagePath,
      backNormalizedBallotImagePathWithinStore
    );

    this.client.run(
      `
      update scan_sheets set
        front_original_filename = ?,
        back_original_filename = ?,
        front_normalized_filename = ?,
        back_normalized_filename = ?
      where id = ?
      `,
      frontOriginalBallotImagePathWithinStore,
      backOriginalBallotImagePathWithinStore,
      frontNormalizedBallotImagePathWithinStore,
      backNormalizedBallotImagePathWithinStore,
      sheetId
    );
  }

  /**
   * Gets the ballot image paths for a sheet.
   */
  getBallotImagesPaths(
    sheetId: string
  ):
    | {
        frontOriginalBallotImagePath: string;
        backOriginalBallotImagePath: string;
        frontNormalizedBallotImagePath: string;
        backNormalizedBallotImagePath: string;
      }
    | undefined {
    return this.client.one(
      `
      select
        front_original_filename as frontOriginalBallotImagePath,
        back_original_filename as backOriginalBallotImagePath,
        front_normalized_filename as frontNormalizedBallotImagePath,
        back_normalized_filename as backNormalizedBallotImagePath
      from scan_sheets
      where id = ?
      `,
      sheetId
    ) as ReturnType<Store['getBallotImagesPaths']>;
  }

  /**
   * Gets the current election.
   */
  getCurrentElection(): ElectionRecord | undefined {
    const row = this.client.one(
      `select current_election_id as currentElectionId from config`
    ) as { currentElectionId: string | null } | undefined;

    return row?.currentElectionId
      ? this.getElection(row.currentElectionId)
      : undefined;
  }

  /**
   * Sets the current election.
   */
  setCurrentElection(electionId?: string): void {
    this.client.run(`delete from config`);
    this.client.run(
      `
      insert into config (
        current_election_id
      ) values (
        ?
      )
      `,
      electionId ?? null
    );
  }

  /**
   * Retrieves the election with the given ID.
   */
  getElection(electionId: string): ElectionRecord | undefined {
    const election = this.client.one(
      `
      select
        id,
        definition_json as definitionJson,
        election_hash as electionHash,
        test_mode as testMode,
        mark_threshold_overrides_json as markThresholdOverridesJson,
        created_at as createdAt
      from elections
      where id = ?
      `,
      electionId
    ) as
      | {
          id: string;
          definitionJson: string;
          electionHash: string;
          testMode: SqliteBoolean;
          markThresholdOverridesJson: string | null;
          createdAt: string;
        }
      | undefined;
    assert(election, `election ${electionId} not found`);

    return {
      id: election.id,
      definition: safeParseElectionDefinition(
        election.definitionJson
      ).unsafeUnwrap(),
      electionHash: election.electionHash,
      testMode: election.testMode === 1,
      markThresholdOverrides: election.markThresholdOverridesJson
        ? unsafeParse(
            MarkThresholdsSchema,
            JSON.parse(election.markThresholdOverridesJson)
          )
        : undefined,
      createdAt: DateTime.fromSQL(election.createdAt),
    };
  }

  /**
   * Adds an election to the database.
   */
  addElection(
    electionDefinition: ElectionDefinition,
    markThresholdOverrides?: MarkThresholds
  ): { test: ElectionRecord; live: ElectionRecord } {
    const testModeElectionId = uuid();
    const liveModeElectionId = uuid();

    this.client.transaction(() => {
      for (const [id, testMode] of [
        [testModeElectionId, true],
        [liveModeElectionId, false],
      ] as const) {
        this.client.run(
          `
          insert into elections (
            id,
            definition_json,
            election_hash,
            test_mode,
            mark_threshold_overrides_json
          ) values (
            ?, ?, ?, ?, ?
          )
          `,
          id,
          electionDefinition.electionData,
          electionDefinition.electionHash,
          testMode ? 1 : 0,
          markThresholdOverrides
            ? JSON.stringify(markThresholdOverrides, null, 2)
            : null
        );
      }
    });

    const testModeElection = this.getElection(testModeElectionId);
    const liveModeElection = this.getElection(liveModeElectionId);
    assert(
      testModeElection,
      `newly created election ${testModeElectionId} not found`
    );
    assert(
      liveModeElection,
      `newly created election ${liveModeElectionId} not found`
    );
    return {
      test: testModeElection,
      live: liveModeElection,
    };
  }

  /**
   * Determines whether the current election is in test mode or not. If there
   * is no current election then this returns undefined.
   */
  getTestMode(): boolean | undefined {
    const row = this.client.one(
      `
      select test_mode as testMode
      from elections
      where id = (
        select current_election_id as currentElectionId from config
      )
      `
    ) as { testMode: number } | undefined;
    return row ? row.testMode === 1 : undefined;
  }

  /**
   * Selects the current election if {@link testMode} matches the current
   * election's test mode, or selects the alternate election that matches the
   * current election and given test mode. If there is no current election,
   * this returns undefined.
   */
  setTestMode(testMode: boolean): string | undefined {
    const matchingElections = this.client.all(
      `
      select
        id,
        test_mode as testMode,
        (id = (select current_election_id as currentElectionId from config)) as isCurrent
      from elections
      where election_hash = (
        select election_hash from elections where id = (
          select current_election_id as currentElectionId from config
        )
      )
      `
    ) as Array<{
      id: string;
      testMode: SqliteBoolean;
      isCurrent: SqliteBoolean;
    }>;

    for (const election of matchingElections) {
      if ((election.testMode === 1) === testMode) {
        if (!election.isCurrent) {
          this.setCurrentElection(election.id);
        }
        return election.id;
      }
    }
  }

  /**
   * Gets the current election's paper size, e.g. letter or legal.
   */
  getBallotPaperSizeForElection(): BallotPaperSize {
    const currentElection = this.getCurrentElection();
    return (
      currentElection?.definition.election.ballotLayout?.paperSize ??
      BallotPaperSize.Letter
    );
  }

  /**
   * Gets the current override values for mark thresholds.
   */
  getMarkThresholdOverrides(): MarkThresholds | undefined {
    const currentElection = this.getCurrentElection();
    return currentElection?.markThresholdOverrides;
  }

  /**
   * Sets the current override values for mark thresholds. A value of undefined
   * will remove overrides and cause thresholds to fallback to the default values
   * in the election definition.
   */
  setMarkThresholdOverrides(markThresholds?: MarkThresholds): void {
    this.client.one(
      `
      update elections
        set mark_threshold_overrides_json = ?
      where id = (select current_election_id from config)
      `,
      markThresholds ? JSON.stringify(markThresholds, null, 2) : null
    );
  }

  /**
   * Gets the current precinct `scan` is accepting ballots for. If set to
   * `undefined`, ballots from all precincts will be accepted (this is the
   * default).
   */
  getCurrentPrecinctId(): Optional<Precinct['id']> {
    const selected = this.client.one(
      `
      select current_precinct_id as currentPrecinctId
      from elections
      where id = (select current_election_id from config)
      `
    ) as { currentPrecinctId: string | null } | undefined;
    return selected?.currentPrecinctId ?? undefined;
  }

  /**
   * Sets the current precinct `scan` is accepting ballots for. Set to
   * `undefined` to accept from all precincts (this is the default).
   */
  setCurrentPrecinctId(currentPrecinctId?: Precinct['id']): void {
    this.client.one(
      `
      update elections
        set current_precinct_id = ?
      where id = (select current_election_id from config)
      `,
      currentPrecinctId ?? null
    );
  }

  /**
   * Adds a batch and returns its id.
   */
  addBatch(): string {
    const id = uuid();
    this.client.run(
      `
      insert into scan_batches
      (
        id,
        election_id,
        batch_number,
        label
      ) values (
        /* id = */ ?,
        /* election_id = */ (select current_election_id from config),
        /* batch_number = */ (
          select coalesce(max(batch_number), 0) + 1
          from scan_batches
          where election_id = (select current_election_id from config)
        ),
        /* label = */ ('Batch ' || (
          select coalesce(max(batch_number), 0) + 1
          from scan_batches
          where election_id = (select current_election_id from config)
        ))
      )
      `,
      id
    );
    return id;
  }

  /**
   * Gets the scanned batches for the current election.
   */
  getBatches(): BatchInfo[] {
    const rows = this.client.all(`
      select
        id,
        label,
        started_at as startedAt,
        ended_at as endedAt,
        error,
        (select count(*) from scan_sheets where batch_id = scan_batches.id) as count
      from scan_batches
      where deleted_at is null
        and election_id = (select current_election_id from config)
    `) as Array<{
      id: string;
      label: string | null;
      startedAt: string;
      endedAt: string | null;
      error: string | null;
      count: number;
    }>;

    return rows.map((row) => ({
      id: row.id,
      label: row.label ?? '',
      startedAt: DateTime.fromSQL(row.startedAt).toISO(),
      endedAt: row.endedAt ? DateTime.fromSQL(row.endedAt).toISO() : undefined,
      error: row.error ?? undefined,
      count: row.count,
    }));
  }

  /**
   * Marks the current batch as finished.
   */
  finishCurrentBatch({ error }: { error?: string } = {}): void {
    this.client.run(
      `
      update scan_batches
      set ended_at = current_timestamp, error = ?
      where ended_at is null
      `,
      error ?? null
    );
  }

  /**
   * Mark a sheet as deleted.
   */
  deleteSheet(sheetId: string): void {
    this.client.run(
      `
      update scan_sheets
      set deleted_at = current_timestamp
      where id = ?
      `,
      sheetId
    );
  }

  async exportCvrs(writeStream: Writable): Promise<void> {
    const currentElection = await this.getCurrentElection();

    if (!currentElection) {
      throw new Error('no election configured');
    }

    const sql = `
      select
        scan_sheets.id as id,
        scan_batches.id as batchId,
        scan_batches.label as batchLabel,
        scan_interpretations.front_interpretation_json as frontInterpretationJson,
        scan_interpretations.back_interpretation_json as backInterpretationJson
      from scan_sheets
      left join scan_batches on scan_sheets.batch_id = scan_batches.id
      left join scan_interpretations on scan_sheets.id = scan_interpretations.sheet_id
      where scan_sheets.deleted_at is null
        and scan_batches.deleted_at is null
    `;
    for (const {
      id,
      batchId,
      batchLabel,
      frontInterpretationJson,
      backInterpretationJson,
    } of (await this.client.all(sql)) as Array<{
      id: string;
      batchId: string;
      batchLabel: string | null;
      frontInterpretationJson: string;
      backInterpretationJson: string;
    }>) {
      const frontInterpretation: PageInterpretation = JSON.parse(
        frontInterpretationJson
      );
      const backInterpretation: PageInterpretation = JSON.parse(
        backInterpretationJson
      );
      const cvr = buildCastVoteRecord(
        id,
        batchId,
        batchLabel || '',
        (frontInterpretation.type === 'InterpretedBmdPage' &&
          frontInterpretation.ballotId) ||
          (backInterpretation.type === 'InterpretedBmdPage' &&
            backInterpretation.ballotId) ||
          unsafeParse(BallotIdSchema, id),
        currentElection.definition.election,
        [
          {
            interpretation: frontInterpretation,
            contestIds:
              frontInterpretation.type === 'InterpretedHmpbPage'
                ? [
                    ...new Set(
                      frontInterpretation.markInfo.marks.map(
                        (mark) => mark.contestId
                      )
                    ),
                  ]
                : undefined,
          },
          {
            interpretation: backInterpretation,
            contestIds:
              backInterpretation.type === 'InterpretedHmpbPage'
                ? [
                    ...new Set(
                      backInterpretation.markInfo.marks.map(
                        (mark) => mark.contestId
                      )
                    ),
                  ]
                : undefined,
          },
        ]
      );

      if (cvr) {
        writeStream.write(JSON.stringify(cvr));
        writeStream.write('\n');
      }
    }
  }

  /**
   * Deletes all batches and sheets in the current election as well as the
   * ballot images associated with them.
   */
  async zero(): Promise<void> {
    const currentElection = this.getCurrentElection();
    if (!currentElection) {
      return;
    }
    this.client.run(
      `
      delete from scan_batches
      where election_id = (select current_election_id from config)
      `
    );
    await emptyDir(this.getElectionBallotImagesRootPath(currentElection));
  }

  /**
   * Deletes the batch with id {@link batchId}.
   */
  deleteBatch(batchId: string): Result<void, Error> {
    this.client.run(
      `
      update scan_batches
        set deleted_at = current_timestamp
      where id = ?
      `,
      batchId
    );
    return ok();
  }

  /**
   * Cleanup partial batches.
   */
  cleanupIncompleteBatches(): void {
    // cascades to the sheets
    this.client.run(
      `
      delete from scan_batches
      where ended_at is null
        and election_id = (select current_election_id from config)
      `
    );
  }

  /**
   * Gets all batches, including their sheet count.
   */
  batchStatus(): BatchInfo[] {
    interface BatchInfoRecord {
      id: string;
      label: string;
      startedAt: SqliteDateTime;
      endedAt: SqliteDateTime | null;
      error: string | null;
      count: number;
    }
    const batchInfo = this.client.all(`
      select
        scan_batches.id as id,
        scan_batches.label as label,
        started_at as startedAt,
        ended_at as endedAt,
        error,
        sum(case when sheets.id is null then 0 else 1 end) as count
      from
        scan_batches left join scan_sheets
      on
        sheets.batch_id = scan_batches.id
      where
        deleted_at is null
      group by
        scan_batches.id,
        scan_batches.started_at,
        scan_batches.ended_at,
        error
      order by
        scan_batches.started_at desc
    `) as BatchInfoRecord[];
    return batchInfo.map((info) => ({
      id: info.id,
      label: info.label,
      startedAt: DateTime.fromSQL(info.startedAt).toISO(),
      endedAt:
        (info.endedAt && DateTime.fromSQL(info.endedAt).toISO()) || undefined,
      error: info.error || undefined,
      count: info.count,
    }));
  }

  addBallotTemplate(
    pdf: Buffer,
    ballotSheetTemplates: readonly BallotSheetTemplate[]
  ): BallotTemplateRecord {
    debug('storing ballot template: %O', ballotSheetTemplates);

    const id = uuid();
    const ballotSheetTemplateRecords: BallotSheetTemplateRecord[] = [];

    this.client.transaction(() => {
      this.client.run(
        `
      insert into ballot_templates (
        id, pdf
      ) values (
        ?, ?
      )
      `,
        id,
        pdf
      );

      for (const ballotSheetTemplate of ballotSheetTemplates) {
        const ballotSheetTemplateId = uuid();
        this.client.run(
          `
        insert into ballot_template_sheets (
          id, ballot_template_id,
          front_identifier, back_identifier,
          front_layout, back_layout
        ) values (
          ?, ?, ?, ?, ?, ?
        )
        `,
          ballotSheetTemplateId,
          id,
          ballotSheetTemplate.frontIdentifier,
          ballotSheetTemplate.backIdentifier,
          ballotSheetTemplate.frontLayout,
          ballotSheetTemplate.backLayout
        );
        ballotSheetTemplateRecords.push({
          id: ballotSheetTemplateId,
          ballotTemplateId: id,
          frontIdentifier: ballotSheetTemplate.frontIdentifier,
          backIdentifier: ballotSheetTemplate.backIdentifier,
          frontLayout: ballotSheetTemplate.frontLayout,
          backLayout: ballotSheetTemplate.backLayout,
        });
      }
    });

    return { id, pdf, sheetTemplates: ballotSheetTemplateRecords };
  }

  getBallotTemplates(): BallotTemplateRecord[] {
    const ballotTemplates = this.client.all(
      `
        select
          id,
          pdf
        from ballot_templates
        order by created_at asc
      `
    ) as BallotTemplateRecord[];
    const results: BallotTemplateRecord[] = [];

    for (const { id, pdf } of ballotTemplates) {
      const sheetTemplates = this.client.all(
        `
          select
            id,
            ballot_template_id,
            front_identifier,
            back_identifier,
            front_layout,
            back_layout
            from ballot_template_sheets
            where ballot_template_id = ?
            order by created_at asc
        `,
        id
      ) as Array<{
        id: string;
        ballotTemplateId: string;
        frontIdentifier: string;
        backIdentifier: string;
        frontLayout: string;
        backLayout: string;
      }>;
      debug(
        'loading stored ballot template id=%s sheets: %O',
        id,
        sheetTemplates
      );
      results.push({
        id,
        pdf,
        sheetTemplates,
      });
    }

    return results;
  }

  getBallotSheetTemplate(
    frontIdentifier: string,
    backIdentifier: string
  ): BallotSheetTemplateRecord {
    const ballotSheetTemplate = this.client.one(
      `
        select
          id,
          ballot_template_id,
          front_identifier,
          back_identifier,
          front_layout,
          back_layout
        from ballot_template_sheets
        where front_identifier = ? and back_identifier = ?
      `,
      frontIdentifier,
      backIdentifier
    ) as BallotSheetTemplateRecord | undefined;

    if (!ballotSheetTemplate) {
      throw new Error(
        `no ballot layouts found matching frontIdentifier=${frontIdentifier} and backIdentifier=${backIdentifier}`
      );
    }

    return ballotSheetTemplate;
  }

  /**
   * Get the current batch ID, if any.
   */
  getCurrentBatchId(): string | undefined {
    const batch = this.client.one(
      `
      select
        id
      from scan_batches
      where
        ended_at is null
        and election_id = (select current_election_id from config)
      `
    ) as { id: string } | undefined;
    return batch?.id;
  }

  /**
   * Add a scanned sheet to the current batch.
   */
  addScannedSheet(sheet: SheetOf<string>): Result<string, Error> {
    const batchId = this.getCurrentBatchId();
    if (!batchId) {
      return err(new Error('no current batch found'));
    }

    const [frontOriginalFilename, backOriginalFilename] = sheet;
    const id = uuid();
    const record: ScanSheetRecord = {
      id,
      batchId,
      frontOriginalFilename,
      backOriginalFilename,
      selectedInterpretationId: null,
      createdAt: DateTime.now().toSQL(),
      deletedAt: null,
    };

    this.client.run(
      `
      insert into scan_sheets (
        id,
        batch_id,
        front_original_filename,
        back_original_filename,
        selected_interpretation_id
      ) values (
        /* id = */ ?,
        /* batch_id = */ ?,
        /* front_original_filename = */ ?,
        /* back_original_filename = */ ?,
        /* selected_interpretation_id = */ ?
      )
      `,
      record.id,
      record.batchId,
      record.frontOriginalFilename,
      record.backOriginalFilename,
      record.selectedInterpretationId
    );

    return ok(id);
  }

  /**
   * Adds an interpretation for a sheet. It will not select this interpretation
   * automatically. Use `selectInterpretation` to do so.
   */
  addScanInterpretation(
    sheetId: string,
    interpreter: string,
    interpretationsWithFiles: SheetOf<PageInterpretationWithFiles>
  ): Result<string, Error> {
    const [front, back] = interpretationsWithFiles;
    const id = uuid();
    const record: ScanInterpretationRecord = {
      id,
      sheetId,
      interpreter,
      frontOriginalFilename: front.originalFilename,
      backOriginalFilename: back.originalFilename,
      frontNormalizedFilename: front.normalizedFilename,
      backNormalizedFilename: back.normalizedFilename,
      frontInterpretationJson: JSON.stringify(front.interpretation, null, 2),
      backInterpretationJson: JSON.stringify(back.interpretation, null, 2),
      requiresAdjudication: 0,
      createdAt: DateTime.now().toSQL(),
    };

    this.client.run(
      `
      insert into scan_interpretations (
        id,
        sheet_id,
        interpreter,
        front_original_filename,
        back_original_filename,
        front_normalized_filename,
        back_normalized_filename,
        front_interpretation_json,
        back_interpretation_json,
        requires_adjudication
      ) values (
        /* id = */ ?,
        /* sheet_id = */ ?,
        /* interpreter = */ ?,
        /* front_original_filename = */ ?,
        /* back_original_filename = */ ?,
        /* front_normalized_filename = */ ?,
        /* back_normalized_filename = */ ?,
        /* front_interpretation_json = */ ?,
        /* back_interpretation_json = */ ?,
        /* requires_adjudication = */ ?
      )
      `,
      record.id,
      record.sheetId,
      record.interpreter,
      record.frontOriginalFilename,
      record.backOriginalFilename,
      record.frontNormalizedFilename,
      record.backNormalizedFilename,
      record.frontInterpretationJson,
      record.backInterpretationJson,
      record.requiresAdjudication
    );

    return ok(id);
  }

  /**
   * Selects an interpretation for a scanned sheet.
   */
  selectScanInterpretation(sheetId: string, interpretationId: string): void {
    this.client.run(
      `
      update scan_sheets
      set selected_interpretation_id = ?
      where id = ?
      `,
      interpretationId,
      sheetId
    );
  }
}
