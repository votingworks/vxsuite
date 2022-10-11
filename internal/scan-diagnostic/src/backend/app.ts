import {
  int,
  loadImage,
  rotate180,
  toImageData,
  writeImageData,
} from '@votingworks/image-utils';
import {
  ElectionDefinition,
  ElectionDefinitionSchema,
  Id,
  MarkThresholdsSchema,
  PageInterpretationSchema,
  PageInterpretationWithFiles,
  Result,
  safeParseInt,
  safeParseJson,
} from '@votingworks/types';
import Database from 'better-sqlite3';
import express from 'express';
import { existsSync } from 'fs';
import { isAbsolute, join } from 'path';

// TODO: use `Store` and/or `Client` from `@votingworks/scan`
type Database = Database.Database;

function run(db: Database, sql: string, ...params: unknown[]): void {
  db.prepare(sql).run(...params);
}

function one(db: Database, sql: string, ...params: unknown[]): unknown {
  return db.prepare(sql).get(...params);
}

function all(db: Database, sql: string, ...params: unknown[]): unknown[] {
  return db.prepare(sql).all(...params);
}

function joinPaths(...paths: string[]): string {
  return paths.reduce((a, b) => (isAbsolute(b) ? b : join(a, b)));
}

interface SheetInterpretation {
  readonly id: Id;
  readonly front: PageInterpretationWithFiles;
  readonly back: PageInterpretationWithFiles;
}

/**
 * Builds an express app that serves the backend API.
 */
export function buildApp(backupRoot: string): express.Express {
  const db = new Database(join(backupRoot, 'ballots.db'));

  function getElectionDefinition(): Result<ElectionDefinition, Error> {
    return safeParseJson(
      (
        one(db, `SELECT value FROM configs WHERE key = 'election'`) as
          | { value: string }
          | undefined
      )?.value ?? '',
      ElectionDefinitionSchema
    );
  }

  function getImagePath(imageBasename: string): string {
    return joinPaths(process.cwd(), backupRoot, imageBasename);
  }

  function getSheets({
    limit,
    offset,
  }: {
    limit: int;
    offset: int;
  }): SheetInterpretation[];
  function getSheets({ id }: { id: Id }): SheetInterpretation[];
  function getSheets({
    id,
    limit = 1,
    offset = 0,
  }: {
    id?: Id;
    limit?: int;
    offset?: int;
  }): SheetInterpretation[] {
    const sheets = all(
      db,
      `
        SELECT
          id,
          front_interpretation_json as frontInterpretationJson,
          back_interpretation_json as backInterpretationJson,
          front_original_filename as frontOriginalFilename,
          back_original_filename as backOriginalFilename,
          front_normalized_filename as frontNormalizedFilename,
          back_normalized_filename as backNormalizedFilename
        FROM sheets
        ${id ? 'WHERE id = ?' : ''}
        ORDER BY created_at ASC
        LIMIT ? OFFSET ?
      `,
      ...(id ? [id] : []),
      limit,
      offset
    ) as Array<{
      id: Id;
      frontInterpretationJson: string;
      backInterpretationJson: string;
      frontOriginalFilename: string;
      backOriginalFilename: string;
      frontNormalizedFilename: string;
      backNormalizedFilename: string;
    }>;

    return sheets.map((sheet): SheetInterpretation => {
      const frontInterpretationParseResult = safeParseJson(
        sheet.frontInterpretationJson,
        PageInterpretationSchema
      );
      const backInterpretationParseResult = safeParseJson(
        sheet.backInterpretationJson,
        PageInterpretationSchema
      );

      return {
        id: sheet.id,
        front: {
          interpretation: frontInterpretationParseResult.unsafeUnwrap(),
          originalFilename: getImagePath(sheet.frontOriginalFilename),
          normalizedFilename: getImagePath(sheet.frontNormalizedFilename),
        },
        back: {
          interpretation: backInterpretationParseResult.unsafeUnwrap(),
          originalFilename: getImagePath(sheet.backOriginalFilename),
          normalizedFilename: getImagePath(sheet.backNormalizedFilename),
        },
      };
    });
  }

  return express()
    .get('/api/election', (req, res) => {
      const electionDefinitionResult = getElectionDefinition();

      if (electionDefinitionResult.isErr()) {
        res.status(404).send('Election definition not found');
        return;
      }

      res
        .setHeader('Content-Type', 'application/json')
        .send(electionDefinitionResult.ok().electionData);
    })

    .get('/api/mark-thresholds', (req, res) => {
      const selectMarkThresholdOverridesRow = one(
        db,
        `SELECT value FROM configs WHERE key = 'markThresholdOverrides'`
      ) as { value: string } | undefined;

      if (selectMarkThresholdOverridesRow) {
        const markThresholdOverridesResult = safeParseJson(
          selectMarkThresholdOverridesRow.value,
          MarkThresholdsSchema
        );

        if (markThresholdOverridesResult.isOk()) {
          res.json(markThresholdOverridesResult.ok());
          return;
        }
      }

      const electionDefinitionResult = getElectionDefinition();

      if (electionDefinitionResult.isErr()) {
        res.status(404).send('Election definition not found');
        return;
      }

      res.json(electionDefinitionResult.ok().election.markThresholds);
    })

    .get<unknown, unknown, unknown, { limit?: string; offset?: string }>(
      '/api/sheets',
      (req, res) => {
        const limit = safeParseInt(req.query.limit, { min: 1 }).ok() ?? 100;
        const offset = safeParseInt(req.query.offset, { min: 0 }).ok() ?? 0;
        const sheets = getSheets({ limit, offset });

        res.json({
          limit,
          offset,
          sheets: sheets.map((sheet) => {
            return {
              id: sheet.id,
              frontInterpretation: sheet.front.interpretation,
              backInterpretation: sheet.back.interpretation,
              frontOriginalFilename: sheet.front.originalFilename,
              backOriginalFilename: sheet.back.originalFilename,
            };
          }),
        });
      }
    )

    .get<{ sheetId: Id; side: 'front' | 'back' }>(
      '/api/sheets/:sheetId/images/:side',
      (req, res) => {
        const { sheetId, side } = req.params;
        const [sheet] = getSheets({ id: sheetId });

        if (!sheet) {
          res.status(404).send(`sheet ID not found: ${sheetId}`);
          return;
        }

        for (const imageBasename of [
          sheet[side].normalizedFilename,
          sheet[side].originalFilename,
        ]) {
          const imagePath = getImagePath(imageBasename);

          if (existsSync(imagePath)) {
            res.sendFile(imagePath);
            return;
          }
        }

        res
          .status(404)
          .send(`images not found for sheet: ${sheetId} side: ${side}`);
      }
    )

    .post<{ sheetId: Id }>('/api/sheets/:sheetId/images/swap', (req, res) => {
      const { sheetId } = req.params;

      const row = one(
        db,
        `
          SELECT
            front_normalized_filename as frontNormalizedFilename,
            back_normalized_filename as backNormalizedFilename,
            front_original_filename as frontOriginalFilename,
            back_original_filename as backOriginalFilename
          FROM sheets
          WHERE id = ?
        `,
        sheetId
      ) as
        | {
            frontNormalizedFilename: string;
            backNormalizedFilename: string;
            frontOriginalFilename: string;
            backOriginalFilename: string;
          }
        | undefined;

      if (!row) {
        res.status(404).send(`sheet ID not found: ${sheetId}`);
        return;
      }

      run(
        db,
        `
          UPDATE sheets
          SET
            front_normalized_filename = ?,
            back_normalized_filename = ?,
            front_original_filename = ?,
            back_original_filename = ?
          WHERE id = ?
        `,
        row.backNormalizedFilename,
        row.frontNormalizedFilename,
        row.backOriginalFilename,
        row.frontOriginalFilename,
        sheetId
      );

      res.json({ status: 'ok' });
    })

    .post<{ sheetId: Id }>(
      '/api/sheets/:sheetId/images/rotate',
      async (req, res) => {
        const { sheetId } = req.params;

        const row = one(
          db,
          `
          SELECT
            front_normalized_filename as frontNormalizedFilename,
            back_normalized_filename as backNormalizedFilename,
            front_original_filename as frontOriginalFilename,
            back_original_filename as backOriginalFilename
          FROM sheets
          WHERE id = ?
        `,
          sheetId
        ) as
          | {
              frontNormalizedFilename: string;
              backNormalizedFilename: string;
              frontOriginalFilename: string;
              backOriginalFilename: string;
            }
          | undefined;

        if (!row) {
          res.status(404).send(`sheet ID not found: ${sheetId}`);
          return;
        }

        async function rotateImageAtPath(path: string) {
          const image = await loadImage(path);
          const imageData = toImageData(image);
          rotate180(imageData);
          await writeImageData(path, imageData);
        }

        for (const imageBasename of [
          row.frontNormalizedFilename,
          row.backNormalizedFilename,
          row.frontOriginalFilename,
          row.backOriginalFilename,
        ]) {
          const imagePath = getImagePath(imageBasename);
          if (existsSync(imagePath)) {
            await rotateImageAtPath(imagePath);
          }
        }

        res.json({ status: 'ok' });
      }
    );
}
