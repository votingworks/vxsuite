import {
  MockScannerClient,
  PaperStatus,
  ScannerClient,
  ScannerError,
} from '@votingworks/plustek-sdk'
import { ok, Provider, Result, safeParse } from '@votingworks/types'
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

  public async getStatus(): Promise<ScannerStatus> {
    const clientResult = await this.clientProvider.get()

    if (clientResult.isErr()) {
      debug(
        'PlustekScanner#getStatus: failed to get client: %s',
        clientResult.err()
      )
      return ScannerStatus.Error
    }

    const client = clientResult.unwrap()
    return (await client.getPaperStatus()).mapOrElse(
      () => ScannerStatus.Error,
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

    const scanSheet = async (): Promise<SheetOf<string> | undefined> => {
      debug('PlustekScanner#scanSheet BEGIN')
      const clientResult = await this.clientProvider.get()

      if (clientResult.isErr()) {
        return undefined
      }

      const client = clientResult.unwrap()
      const scanResult = await client.scan()

      if (scanResult.isErr()) {
        return undefined
      }

      const { files } = scanResult.unwrap()
      return [files[0], files[1]]
    }

    const acceptSheet = async (): Promise<boolean> => {
      debug('PlustekScanner#acceptSheet BEGIN')
      const clientResult = await this.clientProvider.get()

      if (clientResult.isErr()) {
        debug(
          'PlustekScanner#acceptSheet failed to get client: %s',
          clientResult.err()
        )
        return false
      }

      const client = clientResult.unwrap()
      const acceptResult = await client.accept()

      if (acceptResult.isErr()) {
        debug('PlustekScanner#acceptSheet failed: %s', acceptResult.err())
        return false
      }

      return (
        (
          await client.waitForStatus({
            status: PaperStatus.NoPaper,
            timeout: 1000,
          })
        )?.ok() === PaperStatus.NoPaper
      )
    }

    const reviewSheet = async (): Promise<boolean> => {
      try {
        debug('PlustekScanner#reviewSheet BEGIN')
        const clientResult = await this.clientProvider.get()

        if (clientResult.isErr()) {
          debug(
            'PlustekScanner#reviewSheet failed to get client: %s',
            clientResult.err()
          )
          return false
        }

        const client = clientResult.unwrap()
        const rejectResult = await client.reject({ hold: true })

        if (rejectResult.isErr()) {
          debug('PlustekScanner#reviewSheet failed: %s', rejectResult.err())
          return false
        }

        return (
          (
            await client.waitForStatus({
              status: PaperStatus.VtmReadyToScan,
              timeout: 1000,
            })
          )?.ok() === PaperStatus.VtmReadyToScan
        )
      } finally {
        debug('PlustekScanner#reviewSheet END')
      }
    }

    const rejectSheet = async (): Promise<boolean> => {
      debug('PlustekScanner#rejectSheet BEGIN')

      if (this.alwaysHoldOnReject) {
        debug('alwaysHoldOnReject is true, forwarding to reviewSheet')
        return await reviewSheet()
      }

      const clientResult = await this.clientProvider.get()

      if (clientResult.isErr()) {
        debug(
          'PlustekScanner#reviewSheet failed to get client: %s',
          clientResult.err()
        )
        return false
      }

      const client = clientResult.unwrap()
      const rejectResult = await client.reject({ hold: false })

      if (rejectResult.isErr()) {
        debug('PlustekScanner#rejectSheet failed: %s', rejectResult.err())
        return false
      }

      return (
        (
          await client.waitForStatus({
            status: PaperStatus.VtmDevReadyNoPaper,
            timeout: 1000,
          })
        )?.ok() === PaperStatus.VtmDevReadyNoPaper
      )
    }

    const endBatch = async (): Promise<void> => {
      const clientResult = await this.clientProvider.get()

      if (clientResult.isErr()) {
        debug(
          'PlustekScanner#endBatch failed to get client: %s',
          clientResult.err()
        )
        return
      }

      const client = clientResult.unwrap()
      await client.reject({ hold: false })
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
    const clientResult = await this.clientProvider.get()

    if (clientResult.isErr()) {
      debug(
        'PlustekScanner#calibrate: failed to get client: %s',
        clientResult.err()
      )
      return false
    }

    const client = clientResult.unwrap()
    const result = await client.calibrate()

    debug('PlustekScanner#calibrate: success=%s', result.isOk())
    return result.isOk()
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
      safeParse(PutMockRequestSchema, request.body).mapOrElse(
        async (error) =>
          response.status(400).json({ status: 'error', error: `${error}` }),
        async ({ files }) =>
          (await client.simulateLoadSheet(files)).mapOrElse(
            (error) =>
              response.status(400).json({ status: 'error', error: `${error}` }),
            () => response.json({ status: 'ok' })
          )
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
      return (await (await clientPromise)?.close()) ?? ok(undefined)
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
