import { Election } from '@votingworks/ballot-encoder'
import { cpus } from 'os'
import { isAbsolute, join, resolve } from 'path'
import { dirSync } from 'tmp'
import { PageInterpretation } from '../../interpreter'
import { createWorkspace } from '../../util/workspace'
import { Input, Output } from '../../workers/interpret'
import { childProcessPool } from '../../workers/pool'
import { Options } from './options'

export function queryFromOptions(options: Options): [string, string[]] {
  const conditions: string[] = []
  const values: string[] = []

  if (options.unreadable) {
    conditions.push(
      `json_extract(front_interpretation_json, '$.type') = 'UnreadablePage' or
      json_extract(back_interpretation_json, '$.type') = 'UnreadablePage'`
    )
  } else if (options.unreadable === false) {
    conditions.push(
      `json_extract(front_interpretation_json, '$.type') != 'UnreadablePage' and
      json_extract(back_interpretation_json, '$.type') != 'UnreadablePage'`
    )
  }

  if (options.uninterpreted) {
    conditions.push(
      `json_extract(front_interpretation_json, '$.type') = 'UninterpretedHmpbPage' or
      json_extract(back_interpretation_json, '$.type') = 'UninterpretedHmpbPage'`
    )
  } else if (options.uninterpreted === false) {
    conditions.push(
      `json_extract(front_interpretation_json, '$.type') != 'UninterpretedHmpbPage' and
      json_extract(back_interpretation_json, '$.type') != 'UninterpretedHmpbPage'`
    )
  }

  if (options.sheetIds) {
    for (const sheetId of options.sheetIds) {
      conditions.push(`id = ?`)
      values.push(sheetId)
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
      front_interpretation_json as frontInterpretationJSON,
      back_interpretation_json as backInterpretationJSON
    from sheets
    ${conditions.length > 0 ? `where ${conditions.join(' or ')}` : ''}
    `,
    values,
  ]
}

export interface PageScan {
  interpretation: PageInterpretation
  originalFilename: string
  normalizedFilename: string
}

export interface RetryScanListeners {
  configured?(options: Options): void
  sheetsLoading?(): void
  sheetsLoaded?(count: number, election?: Election): void
  interpreterLoading?(): void
  interpreterLoaded?(): void
  interpreterUnloaded?(): void
  pageInterpreted?(
    sheetId: string,
    side: 'front' | 'back',
    original: PageScan,
    rescan: PageScan
  ): void
  complete?(): void
}

export async function retryScan(
  options: Options,
  listeners?: RetryScanListeners
): Promise<void> {
  const input = await createWorkspace(
    options.inputWorkspace ?? join(__dirname, '../../../dev-workspace')
  )
  const output = await createWorkspace(
    options.outputWorkspace ?? dirSync().name
  )
  const outputBatchId = await output.store.addBatch()

  listeners?.configured?.({
    ...options,
    inputWorkspace: input.path,
    outputWorkspace: output.path,
  })

  listeners?.sheetsLoading?.()
  const [sql, params] = queryFromOptions(options)
  const sheets = await input.store.dbAllAsync<
    {
      id: string
      frontOriginalFilename: string
      backOriginalFilename: string
      frontNormalizedFilename: string
      backNormalizedFilename: string
      frontInterpretationJSON: string
      backInterpretationJSON: string
    },
    typeof params
  >(sql, ...params)
  const electionDefinition = await input.store.getElectionDefinition()
  listeners?.sheetsLoaded?.(sheets.length, electionDefinition?.election)

  listeners?.interpreterLoading?.()
  const pool = childProcessPool<Input, Output>(
    join(__dirname, '../../workers/interpret.ts'),
    cpus().length - 1
  )
  pool.start()

  await pool.callAll({ action: 'configure', dbPath: input.store.dbPath })
  listeners?.interpreterLoaded?.()

  await Promise.all(
    sheets.map(
      async ({
        id,
        frontOriginalFilename,
        backOriginalFilename,
        frontNormalizedFilename,
        backNormalizedFilename,
        frontInterpretationJSON,
        backInterpretationJSON,
      }) => {
        const frontInterpretation: PageInterpretation = JSON.parse(
          frontInterpretationJSON
        )
        const backInterpretation: PageInterpretation = JSON.parse(
          backInterpretationJSON
        )
        const originalScans: PageScan[] = [
          {
            interpretation: frontInterpretation,
            originalFilename: frontOriginalFilename,
            normalizedFilename: frontNormalizedFilename,
          },
          {
            interpretation: backInterpretation,
            originalFilename: backOriginalFilename,
            normalizedFilename: backNormalizedFilename,
          },
        ]

        const [front, back] = await Promise.all(
          originalScans.map(async (scan, i) => {
            const rescan = await pool.call({
              action: 'interpret',
              sheetId: id,
              imagePath: isAbsolute(scan.originalFilename)
                ? scan.originalFilename
                : resolve(input.store.dbPath, '..', scan.originalFilename),
              ballotImagesPath: output.ballotImagesPath,
            })

            if (rescan) {
              listeners?.pageInterpreted?.(
                id,
                i === 0 ? 'front' : 'back',
                scan,
                rescan
              )
            }

            return rescan
          })
        )

        if (front && back) {
          await output.store.addSheet(id, outputBatchId, [front, back])
        }
      }
    )
  )

  pool.stop()
  listeners?.interpreterUnloaded?.()
  listeners?.complete?.()
}
