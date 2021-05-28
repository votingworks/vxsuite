import {
  MockScannerClient,
  PaperStatus,
  ScannerClient,
  ScannerError,
} from '@votingworks/plustek-sdk'
import {
  asyncResult,
  ok,
  Provider,
  Result,
  safeParse,
} from '@votingworks/types'
import { ScannerStatus } from '@votingworks/types/api/module-scan'
import bodyParser from 'body-parser'
import makeDebug from 'debug'
import express, { Application } from 'express'
import * as z from 'zod'
import { BatchControl, Scanner } from '.'
import { SheetOf } from '../types'

const debug = makeDebug('module-scan:scanner')

export type ScannerClientProvider = Provider<Result<ScannerClient, Error>>

export class PlustekScanner implements Scanner {
  public constructor(
    private readonly clientProvider: Provider<Result<ScannerClient, Error>>,
    private readonly alwaysHoldOnReject = false
  ) {}

  public getStatus(): Promise<ScannerStatus> {
    return asyncResult(this.clientProvider.get())
      .andThen((client) => client.getPaperStatus())
      .mapOrElse(
        (error) => {
          debug('PlustekScanner#getStatus: failed to get status: %s', error)
          return ScannerStatus.Error
        },
        (paperStatus) => {
          debug('PlustekScanner#getStatus: got paper status: %s', paperStatus)
          return paperStatus === PaperStatus.VtmDevReadyNoPaper
            ? ScannerStatus.WaitingForPaper
            : paperStatus === PaperStatus.VtmReadyToScan
            ? ScannerStatus.ReadyToScan
            : ScannerStatus.Error
        }
      )
  }

  public scanSheets(directory?: string): BatchControl {
    debug('scanSheets: ignoring directory: %s', directory)

    const waiterForStatus = (
      client: ScannerClient,
      status: PaperStatus
    ): (() => Promise<boolean>) => async (): Promise<boolean> =>
      (
        await client.waitForStatus({
          status,
          timeout: 1000,
        })
      )?.ok() === status

    const scanSheet = async (): Promise<SheetOf<string> | undefined> => {
      debug('PlustekScanner#scanSheet BEGIN')
      return asyncResult(this.clientProvider.get())
        .andThen((client) => client.scan())
        .mapOr(undefined, ({ files }) => [files[0], files[1]])
    }

    const acceptSheet = async (): Promise<boolean> => {
      debug('PlustekScanner#acceptSheet BEGIN')
      return asyncResult(this.clientProvider.get())
        .andThen(async (client) =>
          (await client.accept())
            .async()
            .map(waiterForStatus(client, PaperStatus.NoPaper))
        )
        .mapOrElse(
          (error) => {
            debug('PlustekScanner#acceptSheet failed to accept: %s', error)
            return false
          },
          (accepted) => accepted
        )
    }

    const reviewSheet = async (): Promise<boolean> => {
      debug('PlustekScanner#reviewSheet BEGIN')
      return asyncResult(this.clientProvider.get())
        .andThen(async (client) =>
          (await client.reject({ hold: true }))
            .async()
            .map(waiterForStatus(client, PaperStatus.VtmReadyToScan))
        )
        .mapOrElse(
          (error) => {
            debug('PlustekScanner#reviewSheet failed to reject: %s', error)
            return false
          },
          (rejected) => rejected
        )
    }

    const rejectSheet = async (): Promise<boolean> => {
      debug('PlustekScanner#rejectSheet BEGIN')
      return asyncResult(this.clientProvider.get())
        .andThen(async (client) =>
          (await client.reject({ hold: this.alwaysHoldOnReject }))
            .async()
            .map(
              waiterForStatus(
                client,
                this.alwaysHoldOnReject
                  ? PaperStatus.VtmReadyToScan
                  : PaperStatus.VtmDevReadyNoPaper
              )
            )
        )
        .mapOrElse(
          (error) => {
            debug('PlustekScanner#rejectSheet failed to reject: %s', error)
            return false
          },
          (rejected) => rejected
        )
    }

    const endBatch = async (): Promise<void> => {
      await asyncResult(this.clientProvider.get())
        .andThen((client) => client.reject({ hold: this.alwaysHoldOnReject }))
        .mapErr((error) => {
          debug('PlustekScanner#endBatch failed to end batch: %s', error)
        })
        .ok()
    }

    return {
      scanSheet,
      acceptSheet,
      reviewSheet,
      rejectSheet,
      endBatch,
    }
  }

  public async calibrate(): Promise<boolean> {
    return asyncResult(this.clientProvider.get())
      .andThen((client) => client.calibrate())
      .mapResult((result) => {
        debug(
          'PlustekScanner#calibrate: failed to get client: %s',
          result.err()
        )
        return result.isOk()
      })
  }
}

const PutMockRequestSchema = z.object({
  files: z.array(z.string()),
})

export function plustekMockServer(client: MockScannerClient): Application {
  return express()
    .use(bodyParser.raw())
    .use(express.json({ limit: '5mb', type: 'application/json' }))
    .use(bodyParser.urlencoded({ extended: false }))
    .put('/mock', async (request, response) => {
      safeParse(PutMockRequestSchema, request.body)
        .async()
        .andThen(({ files }) => client.simulateLoadSheet(files))
        .mapOrElse(
          (error) =>
            response.status(400).json({ status: 'error', error: `${error}` }),
          () => response.json({ status: 'ok' })
        )
    })
    .delete('/mock', async (_request, response) => {
      ;(await client.simulateRemoveSheet()).mapOrElse(
        (error) =>
          response.status(400).json({ status: 'error', error: `${error}` }),
        () => response.json({ status: 'ok' })
      )
    })
}

export function withReconnect(
  provider: ScannerClientProvider
): ScannerClientProvider {
  let clientPromise: Promise<ScannerClient> | undefined
  let client: ScannerClient | undefined

  const getClient = async (): Promise<ScannerClient> => {
    let client: ScannerClient | undefined
    while (!client) {
      debug('withReconnect: establishing new connection')
      client = (await provider.get()).ok()
      debug('withReconnect: client=%o', client)
    }
    return client
  }

  const ensureClient = async (): Promise<ScannerClient> => {
    clientPromise ??= getClient()
    client = await clientPromise
    return clientPromise
  }

  const discardClient = async (): Promise<void> => {
    debug('withReconnect: closing client')
    await (await clientPromise)?.close()
    clientPromise = undefined
  }

  const wrapper: ScannerClient = {
    accept: async () => {
      for (;;) {
        const result = await (await ensureClient()).accept()

        if (result.err() === ScannerError.SaneStatusIoError) {
          await discardClient()
          continue
        }

        return result
      }
    },

    calibrate: async () => {
      for (;;) {
        const result = await (await ensureClient()).calibrate()

        if (result.err() === ScannerError.SaneStatusIoError) {
          await discardClient()
          continue
        }

        return result
      }
    },

    close: async () => {
      return (await (await clientPromise)?.close()) ?? ok()
    },

    getPaperStatus: async () => {
      debug('withReconnect: getPaperStatus')
      for (;;) {
        const result = await (await ensureClient()).getPaperStatus()

        if (result.err() === ScannerError.SaneStatusIoError) {
          debug(
            'withReconnect: getPaperStatus: got %s, reconnecting',
            result.err()
          )
          await discardClient()
          continue
        }

        return result
      }
    },

    isConnected: () => {
      return client?.isConnected() ?? false
    },

    reject: async ({ hold }) => {
      for (;;) {
        const result = await (await ensureClient()).reject({ hold })

        if (result.err() === ScannerError.SaneStatusIoError) {
          await discardClient()
          continue
        }

        return result
      }
    },

    scan: async () => {
      for (;;) {
        const result = await (await ensureClient()).scan()

        if (
          result.isErr() &&
          result.err() === ScannerError.PaperStatusErrorFeeding
        ) {
          await discardClient()
          continue
        }

        return result
      }
    },

    waitForStatus: async (options) => {
      for (;;) {
        const result = await (await ensureClient()).waitForStatus(options)

        if (
          result?.isErr() &&
          result.err() === ScannerError.SaneStatusIoError
        ) {
          await discardClient()
          continue
        }

        return result
      }
    },
  }

  const wrapperProvider: ScannerClientProvider = {
    get: async () => ok(wrapper),
  }

  return wrapperProvider
}
