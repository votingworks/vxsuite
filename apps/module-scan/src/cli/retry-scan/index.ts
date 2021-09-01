import { Election, PageInterpretation } from '@votingworks/types'
import { zip } from '@votingworks/utils'
import { cpus } from 'os'
import { isAbsolute, join, resolve } from 'path'
import { dirSync } from 'tmp'
import { createWorkspace } from '../../util/workspace'
import * as workers from '../../workers/combined'
import { InterpretOutput } from '../../workers/interpret'
import { childProcessPool } from '../../workers/pool'
import * as qrcodeWorker from '../../workers/qrcode'
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
  if (!electionDefinition) {
    throw new Error('no configured election')
  }

  listeners?.sheetsLoaded?.(sheets.length, electionDefinition.election)

  listeners?.interpreterLoading?.()
  const pool = childProcessPool<workers.Input, workers.Output>(
    workers.workerPath,
    cpus().length - 1
  )
  pool.start()

  await pool.callAll({
    action: 'configure',
    dbPath: input.store.dbPath,
  })
  listeners?.interpreterLoaded?.()

  const absolutify = (path: string): string =>
    isAbsolute(path) ? path : resolve(input.store.dbPath, '..', path)

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
        ]

        const [
          frontDetectQrcodeOutput,
          backDetectQrcodeOutput,
        ] = qrcodeWorker.normalizeSheetOutput(
          electionDefinition.election,
          await Promise.all(
            originalScans.map(
              async (scan) =>
                await pool.call({
                  action: 'detect-qrcode',
                  imagePath: scan.originalFilename,
                })
            ) as [Promise<qrcodeWorker.Output>, Promise<qrcodeWorker.Output>]
          )
        )

        const [front, back] = await Promise.all(
          Array.from(
            zip(originalScans, [
              frontDetectQrcodeOutput,
              backDetectQrcodeOutput,
            ]),
            async ([scan, qrcode], i) => {
              const imagePath = isAbsolute(scan.originalFilename)
                ? scan.originalFilename
                : resolve(input.store.dbPath, '..', scan.originalFilename)
              const rescan = (await pool.call({
                action: 'interpret',
                sheetId: id,
                imagePath,
                detectQrcodeResult: qrcode,
                ballotImagesPath: output.ballotImagesPath,
              })) as InterpretOutput

              if (rescan) {
                listeners?.pageInterpreted?.(
                  id,
                  i === 0 ? 'front' : 'back',
                  scan,
                  rescan
                )
              }

              return rescan
            }
          )
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
