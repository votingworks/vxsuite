import {
  int,
  loadImage,
  rotate180,
  toImageData,
  writeImageData,
} from '@votingworks/image-utils';
import { Workspace } from '@votingworks/scan';
import {
  Id,
  PageInterpretationSchema,
  PageInterpretationWithFiles,
  safeParseInt,
  safeParseJson,
} from '@votingworks/types';
import express from 'express';
import { existsSync } from 'fs';
import { isAbsolute, join } from 'path';

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
export function buildApp(workspace: Workspace): express.Express {
  const { store } = workspace;
  const db = workspace.store['client'];

  function getImagePath(imageBasename: string): string {
    return joinPaths(process.cwd(), workspace.path, imageBasename);
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
    const sheets = db.all(
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
      const electionDefinition = store.getElectionDefinition();

      if (!electionDefinition) {
        res.status(404).send('Election definition not found');
        return;
      }

      res
        .setHeader('Content-Type', 'application/json')
        .send(electionDefinition.electionData);
    })

    .get('/api/mark-thresholds', (req, res) => {
      const markThresholdOverrides = store.getMarkThresholdOverrides();

      if (markThresholdOverrides) {
        res.json(markThresholdOverrides);
        return;
      }

      const electionDefinition = store.getElectionDefinition();

      if (!electionDefinition) {
        res.status(404).send('Election definition not found');
        return;
      }

      res.json(electionDefinition.election.markThresholds);
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
        const filenames = store.getBallotFilenames(sheetId, side);

        if (!filenames) {
          res.status(404).send(`sheet ID not found: ${sheetId}`);
          return;
        }

        for (const imageBasename of [
          filenames.normalized,
          filenames.original,
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
      const frontFilenames = store.getBallotFilenames(sheetId, 'front');
      const backFilenames = store.getBallotFilenames(sheetId, 'back');

      if (!frontFilenames || !backFilenames) {
        res.status(404).send(`sheet ID not found: ${sheetId}`);
        return;
      }

      db.run(
        `
          UPDATE sheets
          SET
            front_normalized_filename = ?,
            back_normalized_filename = ?,
            front_original_filename = ?,
            back_original_filename = ?
          WHERE id = ?
        `,
        backFilenames.normalized,
        frontFilenames.normalized,
        backFilenames.original,
        frontFilenames.original,
        sheetId
      );

      res.json({ status: 'ok' });
    })

    .post<{ sheetId: Id }>(
      '/api/sheets/:sheetId/images/rotate',
      async (req, res) => {
        const { sheetId } = req.params;
        const frontFilenames = store.getBallotFilenames(sheetId, 'front');
        const backFilenames = store.getBallotFilenames(sheetId, 'back');

        if (!frontFilenames || !backFilenames) {
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
          frontFilenames.original,
          frontFilenames.normalized,
          backFilenames.original,
          backFilenames.normalized,
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
