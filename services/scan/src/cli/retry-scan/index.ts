import { ElectionDefinition, PageInterpretation } from '@votingworks/types';
import { zip } from '@votingworks/utils';
import { cpus } from 'os';
import { isAbsolute, join, resolve } from 'path';
import { dirSync } from 'tmp';
import { createWorkspace } from '../../util/workspace';
import * as workers from '../../workers/combined';
import { InterpretOutput } from '../../workers/interpret';
import { childProcessPool, WorkerPool } from '../../workers/pool';
import * as qrcodeWorker from '../../workers/qrcode';
import { Options } from './options';

export function queryFromOptions(options: Options): [string, string[]] {
  const conditions: string[] = [];
  const values: string[] = [];

  if (options.unreadable) {
    conditions.push(
      `json_extract(front_interpretation_json, '$.type') = 'UnreadablePage' or
      json_extract(back_interpretation_json, '$.type') = 'UnreadablePage'`
    );
  } else if (options.unreadable === false) {
    conditions.push(
      `json_extract(front_interpretation_json, '$.type') != 'UnreadablePage' and
      json_extract(back_interpretation_json, '$.type') != 'UnreadablePage'`
    );
  }

  if (options.uninterpreted) {
    conditions.push(
      `json_extract(front_interpretation_json, '$.type') = 'UninterpretedHmpbPage' or
      json_extract(back_interpretation_json, '$.type') = 'UninterpretedHmpbPage'`
    );
  } else if (options.uninterpreted === false) {
    conditions.push(
      `json_extract(front_interpretation_json, '$.type') != 'UninterpretedHmpbPage' and
      json_extract(back_interpretation_json, '$.type') != 'UninterpretedHmpbPage'`
    );
  }

  if (options.sheetIds) {
    for (const sheetId of options.sheetIds) {
      conditions.push(`id = ?`);
      values.push(sheetId);
    }
  }

  return [
    `
    select
      id,
      front_original_filename as frontOriginalFilename,
      back_original_filename as backOriginalFilename,
      front_normalized_filename as frontNormalizedFilename,
      back_normalized_filename as backNormalizedFilename,
      front_interpretation_json as frontInterpretationJson,
      back_interpretation_json as backInterpretationJson
    from sheets
    ${conditions.length > 0 ? `where ${conditions.join(' or ')}` : ''}
    `,
    values,
  ];
}

export interface PageScan {
  interpretation: PageInterpretation;
  originalFilename: string;
  normalizedFilename: string;
}

export interface RetryScanListeners {
  configured?(options: Options): void;
  sheetsLoading?(): void;
  sheetsLoaded?(count: number, electionDefinition: ElectionDefinition): void;
  interpreterLoading?(): void;
  interpreterLoaded?(): void;
  interpreterUnloaded?(): void;
  pageInterpreted?(
    sheetId: string,
    side: 'front' | 'back',
    original: PageScan,
    rescan: PageScan
  ): void;
  complete?(): void;
}

export async function retryScan(
  options: Options,
  listeners?: RetryScanListeners
): Promise<void> {
  const input = await createWorkspace(
    options.inputWorkspace ?? join(__dirname, '../../../dev-workspace')
  );
  const output = await createWorkspace(
    options.outputWorkspace ?? dirSync().name
  );
  const outputBatchId = output.store.addBatch();

  listeners?.configured?.({
    ...options,
    inputWorkspace: input.path,
    outputWorkspace: output.path,
  });

  listeners?.sheetsLoading?.();
  const [sql, params] = queryFromOptions(options);
  const sheets = input.store.dbAll<typeof params>(sql, ...params) as Array<{
    id: string;
    frontOriginalFilename: string;
    backOriginalFilename: string;
    frontNormalizedFilename: string;
    backNormalizedFilename: string;
    frontInterpretationJson: string;
    backInterpretationJson: string;
  }>;
  const electionDefinition = input.store.getElectionDefinition();
  if (!electionDefinition) {
    throw new Error('no configured election');
  }

  listeners?.sheetsLoaded?.(sheets.length, electionDefinition);

  listeners?.interpreterLoading?.();
  const pool = childProcessPool(
    workers.workerPath,
    cpus().length - 1
  ) as WorkerPool<workers.Input, workers.Output>;
  pool.start();

  await pool.callAll({
    action: 'configure',
    dbPath: input.store.getDbPath(),
  });
  listeners?.interpreterLoaded?.();

  function absolutify(path: string): string {
    return isAbsolute(path)
      ? path
      : resolve(input.store.getDbPath(), '..', path);
  }

  await Promise.all(
    sheets.map(
      async ({
        id,
        frontOriginalFilename,
        backOriginalFilename,
        frontNormalizedFilename,
        backNormalizedFilename,
        frontInterpretationJson,
        backInterpretationJson,
      }) => {
        const frontInterpretation: PageInterpretation = JSON.parse(
          frontInterpretationJson
        );
        const backInterpretation: PageInterpretation = JSON.parse(
          backInterpretationJson
        );
        const originalScans: [PageScan, PageScan] = [
          {
            interpretation: frontInterpretation,
            originalFilename: absolutify(frontOriginalFilename),
            normalizedFilename: absolutify(frontNormalizedFilename),
          },
          {
            interpretation: backInterpretation,
            originalFilename: absolutify(backOriginalFilename),
            normalizedFilename: absolutify(backNormalizedFilename),
          },
        ];

        const [
          frontDetectQrcodeOutput,
          backDetectQrcodeOutput,
        ] = qrcodeWorker.normalizeSheetOutput(
          electionDefinition,
          await Promise.all(
            originalScans.map(
              async (scan) =>
                await pool.call({
                  action: 'detect-qrcode',
                  imagePath: scan.originalFilename,
                })
            ) as [Promise<qrcodeWorker.Output>, Promise<qrcodeWorker.Output>]
          )
        );

        const [front, back] = await Promise.all(
          [
            ...zip(originalScans, [
              frontDetectQrcodeOutput,
              backDetectQrcodeOutput,
            ]),
          ].map(async ([scan, qrcode], i) => {
            const imagePath = isAbsolute(scan.originalFilename)
              ? scan.originalFilename
              : resolve(input.store.getDbPath(), '..', scan.originalFilename);
            const rescan = (await pool.call({
              action: 'interpret',
              sheetId: id,
              imagePath,
              detectQrcodeResult: qrcode,
              ballotImagesPath: output.ballotImagesPath,
            })) as InterpretOutput;

            if (rescan) {
              listeners?.pageInterpreted?.(
                id,
                i === 0 ? 'front' : 'back',
                scan,
                rescan
              );
            }

            return rescan;
          })
        );

        if (front && back) {
          await output.store.addSheet(id, outputBatchId, [front, back]);
        }
      }
    )
  );

  pool.stop();
  listeners?.interpreterUnloaded?.();
  listeners?.complete?.();
}
