import {
  ClientDisconnectedError,
  MockScannerClient,
  PaperStatus,
  ScannerClient,
  ScannerError,
  ScanRetryPredicate,
} from '@votingworks/plustek-sdk'
import { ok, Provider, Result, safeParse } from '@votingworks/types'
import { ScannerStatus } from '@votingworks/types/api/module-scan'
import bodyParser from 'body-parser'
import makeDebug from 'debug'
import express, { Application } from 'express'
import * as z from 'zod'
import { BatchControl, Scanner, ScanOptions } from '.'
import { SheetOf } from '../types'

const debug = makeDebug('module-scan:scanner')

export type ScannerClientProvider = Provider<Result<ScannerClient, Error>>

const SCANNER_RETRY_DURATION_SECONDS = 5
const NANOSECONDS_PER_SECOND = BigInt(1_000_000_000)

const retryFor = ({ seconds }: { seconds: number }): ScanRetryPredicate => {
  const start = process.hrtime.bigint()
  const end = start + BigInt(seconds) * NANOSECONDS_PER_SECOND
  return (result) => {
    if (result.err() instanceof ClientDisconnectedError) {
      return false
    }
    const now = process.hrtime.bigint()
    return now < end
  }
}

export class PlustekScanner implements Scanner {
  private statusOverride?: ScannerStatus

  constructor(
    private readonly clientProvider: ScannerClientProvider,
    private readonly alwaysHoldOnReject = false
  ) {}

  private async getHardwareStatus(): Promise<ScannerStatus> {
    const clientResult = await this.clientProvider.get()

    if (clientResult.isErr()) {
      debug(
        'PlustekScanner#getHardwareStatus: failed to get client: %s',
        clientResult.err()
      )
      return ScannerStatus.Error
    }

    const client = clientResult.ok()
    const getPaperStatusResult = await client.getPaperStatus()

    if (getPaperStatusResult.isErr()) {
      debug(
        'PlustekScanner#getHardwareStatus: failed to get status: %s',
        getPaperStatusResult.err()
      )
      return ScannerStatus.Error
    }

    const paperStatus = getPaperStatusResult.ok()
    debug('PlustekScanner#getHardwareStatus: got paper status: %s', paperStatus)
    return paperStatus === PaperStatus.VtmDevReadyNoPaper ||
      paperStatus === PaperStatus.NoPaper
      ? ScannerStatus.WaitingForPaper
      : paperStatus === PaperStatus.VtmReadyToScan
      ? ScannerStatus.ReadyToScan
      : paperStatus === PaperStatus.VtmReadyToEject
      ? ScannerStatus.ReadyToAccept
      : ScannerStatus.Error
  }

  async getStatus(): Promise<ScannerStatus> {
    if (this.statusOverride) {
      debug(
        'PlustekScanner#getStatus: using override status: %s',
        this.statusOverride
      )
      return this.statusOverride
    }

    debug('PlustekScanner#getStatus: requesting status from hardware')
    return await this.getHardwareStatus()
  }

  scanSheets({ directory, pageSize }: ScanOptions = {}): BatchControl {
    debug('scanSheets: ignoring directory: %s', directory)
    debug('scanSheets: ignoring pageSize: %s', pageSize)

    const waitForStatus = async (
      client: ScannerClient,
      status: PaperStatus
    ): Promise<boolean> => {
      debug('PlustekScanner waitForStatus: %s', status)
      const awaitedStatus = (
        await client.waitForStatus({
          status,
          timeout: 1000,
        })
      )?.ok()

      return awaitedStatus === status
    }

    const scanSheet = async (): Promise<SheetOf<string> | undefined> => {
      try {
        debug('PlustekScanner#scanSheet BEGIN')
        const clientResult = await this.clientProvider.get()

        if (clientResult.isErr()) {
          debug(
            'PlustekScanner#scanSheet: failed to get client: %s',
            clientResult.err()
          )
          return undefined
        }

        const status = await this.getStatus()
        if (status === ScannerStatus.ReadyToScan) {
          this.statusOverride = ScannerStatus.Scanning
          const client = clientResult.ok()
          const scanResult = await client.scan({
            shouldRetry: retryFor({
              seconds: SCANNER_RETRY_DURATION_SECONDS,
            }),
          })

          if (scanResult.isErr()) {
            debug(
              'PlustekScanner#scanSheet: failed to scan: %s',
              scanResult.err()
            )
            return undefined
          }

          const {
            files: [front, back],
          } = scanResult.ok()
          return [front, back]
        }
      } finally {
        delete this.statusOverride
      }
    }

    const acceptSheet = async (): Promise<boolean> => {
      debug('PlustekScanner#acceptSheet BEGIN')
      const clientResult = await this.clientProvider.get()

      if (clientResult.isErr()) {
        debug(
          'PlustekScanner#acceptSheet: failed to get client: %s',
          clientResult.err()
        )
        return false
      }

      try {
        const client = clientResult.ok()
        this.statusOverride = ScannerStatus.Accepting
        const acceptResult = await client.accept()

        if (acceptResult.isErr()) {
          debug(
            'PlustekScanner#acceptSheet failed to accept: %s',
            acceptResult.err()
          )
          return false
        }

        return await waitForStatus(client, PaperStatus.VtmDevReadyNoPaper)
      } finally {
        delete this.statusOverride
      }
    }

    const reviewSheet = async (): Promise<boolean> => {
      debug('PlustekScanner#reviewSheet BEGIN')
      const clientResult = await this.clientProvider.get()

      if (clientResult.isErr()) {
        debug(
          'PlustekScanner#reviewSheet: failed to get client: %s',
          clientResult.err()
        )
        return false
      }

      try {
        const client = clientResult.ok()
        this.statusOverride = ScannerStatus.Rejecting
        const rejectResult = await client.reject({ hold: true })

        if (rejectResult.isErr()) {
          debug(
            'PlustekScanner#reviewSheet failed to reject: %s',
            rejectResult.err()
          )
          return false
        }

        return await waitForStatus(client, PaperStatus.VtmReadyToScan)
      } finally {
        delete this.statusOverride
      }
    }

    const rejectSheet = async (): Promise<boolean> => {
      debug('PlustekScanner#rejectSheet BEGIN')
      const clientResult = await this.clientProvider.get()

      if (clientResult.isErr()) {
        debug(
          'PlustekScanner#rejectSheet: failed to get client: %s',
          clientResult.err()
        )
        return false
      }

      try {
        const client = clientResult.ok()
        this.statusOverride = ScannerStatus.Rejecting
        const rejectResult = await client.reject({
          hold: this.alwaysHoldOnReject,
        })

        if (rejectResult.isErr()) {
          debug(
            'PlustekScanner#rejectSheet failed to reject: %s',
            rejectResult.err()
          )
          return false
        }

        return await waitForStatus(
          client,
          this.alwaysHoldOnReject
            ? PaperStatus.VtmReadyToScan
            : PaperStatus.VtmDevReadyNoPaper
        )
      } finally {
        delete this.statusOverride
      }
    }

    const endBatch = async (): Promise<void> => {
      debug('PlustekScanner#endBatch BEGIN')
      const clientResult = await this.clientProvider.get()

      if (clientResult.isErr()) {
        debug(
          'PlustekScanner#endBatch: failed to get client: %s',
          clientResult.err()
        )
        return
      }

      if ((await this.getStatus()) !== ScannerStatus.WaitingForPaper) {
        const client = clientResult.ok()
        const rejectResult = await client.reject({
          hold: this.alwaysHoldOnReject,
        })

        if (rejectResult.isErr()) {
          debug(
            'PlustekScanner#endBatch failed to end batch: %s',
            rejectResult.err()
          )
        }
      }
    }

    return {
      scanSheet,
      acceptSheet,
      reviewSheet,
      rejectSheet,
      endBatch,
    }
  }

  async calibrate(): Promise<boolean> {
    debug('PlustekScanner#calibrate BEGIN')
    const clientResult = await this.clientProvider.get()

    if (clientResult.isErr()) {
      debug(
        'PlustekScanner#calibrate: failed to get client: %s',
        clientResult.err()
      )
      return false
    }

    try {
      const client = clientResult.ok()
      this.statusOverride = ScannerStatus.Calibrating
      const calibrateResult = await client.calibrate()

      if (calibrateResult.isErr()) {
        debug(
          'PlustekScanner#calibrate: failed to calibrate: %s',
          calibrateResult.err()
        )
        return false
      }

      return true
    } finally {
      delete this.statusOverride
    }
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
      const bodyParseResult = safeParse(PutMockRequestSchema, request.body)

      if (bodyParseResult.isErr()) {
        response
          .status(400)
          .json({ status: 'error', error: `${bodyParseResult.err()}` })
        return
      }

      const simulateResult = await client.simulateLoadSheet(
        bodyParseResult.ok().files
      )

      if (simulateResult.isErr()) {
        response
          .status(400)
          .json({ status: 'error', error: `${simulateResult.err()}` })
        return
      }

      response.json({ status: 'ok' })
    })
    .delete('/mock', async (_request, response) => {
      const simulateResult = await client.simulateRemoveSheet()

      if (simulateResult.isErr()) {
        response
          .status(400)
          .json({ status: 'error', error: `${simulateResult.err()}` })
        return
      }

      response.json({ status: 'ok' })
    })
}

export function withReconnect(
  provider: ScannerClientProvider
): ScannerClientProvider {
  let clientPromise: Promise<ScannerClient> | undefined
  let client: ScannerClient | undefined

  const getClient = async (): Promise<ScannerClient> => {
    let result: ScannerClient | undefined
    while (!result) {
      debug('withReconnect: establishing new connection')
      result = (await provider.get()).ok()
      debug('withReconnect: client=%o', result)
    }
    return result
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

  const shouldDiscardAndRetry = (result: Result<unknown, unknown>) =>
    result.err() === ScannerError.SaneStatusIoError ||
    result.err() instanceof ClientDisconnectedError

  const wrapper: ScannerClient = {
    accept: async () => {
      for (;;) {
        const result = await (await ensureClient()).accept()

        if (shouldDiscardAndRetry(result)) {
          await discardClient()
          continue
        }

        return result
      }
    },

    calibrate: async () => {
      for (;;) {
        const result = await (await ensureClient()).calibrate()

        if (shouldDiscardAndRetry(result)) {
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

        if (shouldDiscardAndRetry(result)) {
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

        if (shouldDiscardAndRetry(result)) {
          await discardClient()
          continue
        }

        return result
      }
    },

    scan: async (options) => {
      for (;;) {
        const result = await (await ensureClient()).scan(options)

        if (result.err() === ScannerError.PaperStatusErrorFeeding) {
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
