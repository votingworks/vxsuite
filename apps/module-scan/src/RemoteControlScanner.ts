/* istanbul ignore file */

import { Result, safeParse, safeParseJSON } from '@votingworks/types'
import bodyParser from 'body-parser'
import express from 'express'
import { basename, extname, join } from 'path'
import { dirSync, tmpNameSync } from 'tmp'
import { copyFile } from 'fs-extra'
import * as z from 'zod'
import { BatchControl, Scanner } from './scanner'
import { SheetOf } from './types'
import got from 'got'

export type SheetFiles = SheetOf<string>
export type Batch = SheetFiles[]
export type Batches = Batch[]
export const SheetFilesSchema: z.ZodSchema<SheetFiles> = z.tuple([
  z.string(),
  z.string(),
])
export const BatchSchema: z.ZodSchema<Batch> = z.array(SheetFilesSchema)
export const BatchesSchema: z.ZodSchema<Batches> = z.array(BatchSchema)

const DEFAULT_PORT = 8888

export class RemoteControlScannerClient {
  public constructor(private readonly port = DEFAULT_PORT) {}

  public async getBatches(): Promise<
    Result<Batches, SyntaxError | z.ZodError>
  > {
    return safeParseJSON(
      (await got.get(`http://localhost:${this.port}/batches`)).body,
      BatchesSchema
    )
  }

  public async getCurrentBatch(): Promise<
    Result<Batch | undefined, SyntaxError | z.ZodError>
  > {
    return safeParseJSON(
      (await got.get(`http://localhost:${this.port}/batches/current`)).body,
      BatchSchema
    )
  }

  public async addBatch(
    batch: Batch
  ): Promise<Result<Batches, SyntaxError | z.ZodError>> {
    return safeParseJSON(
      (await got.post(`http://localhost:${this.port}/batches`, { json: batch }))
        .body,
      BatchesSchema
    )
  }

  public async addSheetsToNextBatch(
    ...sheets: readonly SheetFiles[]
  ): Promise<Result<Batch, SyntaxError | z.ZodError>> {
    return safeParseJSON(
      (
        await got.post(`http://localhost:${this.port}/batches/next`, {
          json: sheets,
        })
      ).body,
      BatchSchema
    )
  }

  public async addSheetsToLastBatch(
    ...sheets: readonly SheetFiles[]
  ): Promise<Result<Batch, SyntaxError | z.ZodError>> {
    return safeParseJSON(
      (
        await got.post(`http://localhost:${this.port}/batches/last`, {
          json: sheets,
        })
      ).body,
      BatchSchema
    )
  }

  public async getNextBatch(): Promise<
    Result<Batch, SyntaxError | z.ZodError>
  > {
    return safeParseJSON(
      (await got.get(`http://localhost:${this.port}/batches/next`)).body,
      BatchSchema
    )
  }

  public async getLastBatch(): Promise<
    Result<Batch, SyntaxError | z.ZodError>
  > {
    return safeParseJSON(
      (await got.get(`http://localhost:${this.port}/batches/last`)).body,
      BatchSchema
    )
  }
}

export default class RemoteControlScanner implements Scanner {
  private currentBatch?: Batch
  private batches: Batch[] = []

  public constructor(port = DEFAULT_PORT) {
    const app = express()

    app.use(express.json({ limit: '5mb', type: 'application/json' }))
    app.use(bodyParser.urlencoded({ extended: false }))

    app.get('/', (_request, response) => {
      response.redirect('/batches')
    })

    app.get('/batches', (_request, response) => {
      response.json(this.batches)
    })

    app.post('/batches', (request, response) => {
      safeParse(BatchSchema, request.body).mapOrElse(
        (error) => {
          response.status(400).json({ error: error.toString() })
        },
        (batch) => {
          this.batches.push(batch)
          response.status(201).json(this.batches)
        }
      )
    })

    app.get('/batches/current', (_request, response) => {
      response.json(this.currentBatch ?? [])
    })

    app.get('/batches/next', (_request, response) => {
      if (this.batches.length === 0) {
        this.batches.push([])
      }

      const batch = this.batches[0]
      response.json(batch)
    })

    app.post('/batches/next', (request, response) => {
      safeParse(BatchSchema, request.body).mapOrElse(
        (error) => {
          response.status(400).json({ error: error.toString() })
        },
        (sheets) => {
          if (this.batches.length === 0) {
            this.batches.push([])
          }

          const batch = this.batches[0]
          batch.push(...sheets)
          response.json(batch)
        }
      )
    })

    app.get('/batches/last', (_request, response) => {
      if (this.batches.length === 0) {
        this.batches.push([])
      }

      const batch = this.batches[this.batches.length - 1]
      response.json(batch)
    })

    app.post('/batches/last', (request, response) => {
      safeParse(BatchSchema, request.body).mapOrElse(
        (error) => {
          response.status(400).json({ error: error.toString() })
        },
        (sheets) => {
          if (this.batches.length === 0) {
            this.batches.push([])
          }

          const batch = this.batches[this.batches.length - 1]
          batch.push(...sheets)
          response.json(batch)
        }
      )
    })

    app.listen(port, () => {
      console.log(
        `Remote control scanner listening at http://localhost:${port}/`
      )
    })
  }

  public scanSheets(directory = dirSync().name): BatchControl {
    if (this.currentBatch) {
      throw new Error('cannot start a batch when one is already processing')
    }

    const batch = this.batches.shift()
    this.currentBatch = batch

    return {
      scanSheet: async (): Promise<SheetOf<string> | undefined> => {
        const sheet = batch?.shift()

        if (sheet) {
          return (await Promise.all(
            sheet.map(async (path) => {
              const dest = join(
                directory,
                basename(tmpNameSync({ postfix: extname(path) }))
              )
              await copyFile(path, dest)
              return dest
            })
          )) as SheetOf<string>
        }
      },

      endBatch: async (): Promise<void> => {
        if (this.currentBatch === batch) {
          delete this.currentBatch
        }
      },
    }
  }
}
