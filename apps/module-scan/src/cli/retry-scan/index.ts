import { Election } from '@votingworks/types'
import { cpus } from 'os'
import { isAbsolute, join, resolve } from 'path'
import { dirSync } from 'tmp'
import { PageInterpretation } from '../../interpreter'
import { createWorkspace } from '../../util/workspace'
import * as workers from '../../workers/combined'
import { InterpretOutput } from '../../workers/interpret'
import * as qrcodeWorker from '../../workers/qrcode'
import { childProcessPool } from '../../workers/pool'
import { Options } from './options'
import { zip } from '@votingworks/hmpb-interpreter/src/utils/iterators'
import { normalizeSheetMetadata } from '../../util/metadata'

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
  pageInterpretStart?(sheetId: string, side: 'front' | 'back'): void
  pageQrcodeRead?(
    sheetId: string,
    side: 'front' | 'back',
    data?: Uint8Array
  ): void
  pageInterpretEnd?(
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
    options.jobs ?? cpus().length - 1
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
        const originalScans: PageScan[] = [
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
        ] = await Promise.all(
          originalScans.map(async (scan, i) => {
            const result = (await pool.call({
              action: 'detect-qrcode',
              imagePath: scan.originalFilename,
            })) as qrcodeWorker.Output
            listeners?.pageQrcodeRead?.(
              id,
              i === 0 ? 'front' : 'back',
              result.blank ? undefined : result.qrcode?.data
            )
            return result
          })
        )
        const [
          frontQrcode,
          backQrcode,
        ] = normalizeSheetMetadata(electionDefinition.election, [
          !frontDetectQrcodeOutput.blank
            ? frontDetectQrcodeOutput.qrcode
            : undefined,
          !backDetectQrcodeOutput.blank
            ? backDetectQrcodeOutput.qrcode
            : undefined,
        ])

        const [front, back] = await Promise.all(
          [...zip(originalScans, [frontQrcode, backQrcode])].map(
            async ([scan, qrcode], i) => {
              const imagePath = isAbsolute(scan.originalFilename)
                ? scan.originalFilename
                : resolve(input.store.dbPath, '..', scan.originalFilename)
              const rescan = (await pool.call({
                action: 'interpret',
                sheetId: id,
                imagePath,
                qrcode,
                ballotImagesPath: output.ballotImagesPath,
              })) as InterpretOutput

              if (rescan) {
                listeners?.pageInterpretEnd?.(
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
