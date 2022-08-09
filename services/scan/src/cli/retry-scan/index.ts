import { ElectionDefinition, PageInterpretation } from '@votingworks/types';
import { isAbsolute, join, resolve } from 'path';
import { dirSync } from 'tmp';
import { createWorkspace } from '../../util/workspace';
import { Options } from './options';
import { loadLayouts, createInterpreter } from '../../simple_interpreter';

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
  const layouts = await loadLayouts(input.store);
  if (!layouts) {
    throw new Error('no layouts');
  }
  const interpreter = createInterpreter({
    electionDefinition,
    layouts,
    ballotImagesPath: output.ballotImagesPath,
    testMode: input.store.getTestMode(),
  });

  listeners?.interpreterLoaded?.();

  function absolutify(path: string): string {
    return isAbsolute(path)
      ? path
      : resolve(input.store.getDbPath(), '..', path);
  }

  // stupid for loop because `inGroupsOf` is not doing what I expect it to wrt types
  for (let start = 0; start < sheets.length; start += 20) {
    const smallArrayOfSheets = sheets.slice(start, start + 20);
    await Promise.all(
      smallArrayOfSheets.map(
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

          const interpretationResult = (
            await interpreter.interpret(id, [
              originalScans[0].originalFilename,
              originalScans[1].originalFilename,
            ])
          ).unsafeUnwrap();

          const [front, back] = interpretationResult.pages;

          listeners?.pageInterpreted?.(id, 'front', originalScans[0], front);

          listeners?.pageInterpreted?.(id, 'back', originalScans[1], back);

          if (front && back) {
            output.store.addSheet(id, outputBatchId, [front, back]);
          }
        }
      )
    );
  }

  listeners?.interpreterUnloaded?.();
  listeners?.complete?.();
}
