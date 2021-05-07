/* istanbul ignore file */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { err, ok, Result } from '@votingworks/types'
import { resolve } from 'path'
import {
  Batch,
  Batches,
  RemoteControlScannerClient,
} from '../RemoteControlScanner'

/**
 * @param {readonly string[]} args
 * @returns {Promise<number>}
 */
export default async function main(args: readonly string[]): Promise<number> {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg === 'help' || arg === '--help' || arg === '-h') {
      return help(args.slice(i + 1))
    } else if (arg === 'show') {
      return show(args.slice(i + 1))
    } else if (arg === 'new-batch') {
      return newBatch(args.slice(i + 1))
    } else if (arg === 'add-to-batch') {
      return addToBatch(args.slice(i + 1))
    } else {
      usage(process.stderr)
      return 1
    }
  }

  return help([])
}

function help(_args: readonly string[]): number {
  usage(process.stdout)
  return 0
}

function printBatches(batches: Batches): void {
  if (batches.length === 0) {
    process.stdout.write('# no batches\n')
  }

  for (const [i, batch] of batches.entries()) {
    if (i === 0 && i === batches.length - 1) {
      process.stdout.write('# next & last batch\n')
    } else if (i === 0) {
      process.stdout.write('# next batch\n')
    } else if (i === batches.length - 1) {
      process.stdout.write('# last batch\n')
    }
    printBatch(batch)
    process.stdout.write('\n')
  }
}

function printBatch(batch: Batch): void {
  if (batch.length === 0) {
    process.stdout.write('# → empty batch\n')
  }

  for (const sheet of batch) {
    process.stdout.write(sheet[0])
    process.stdout.write('\n')
    process.stdout.write(sheet[1])
    process.stdout.write('\n')
  }
  process.stdout.write('\n')
}

/**
 * @param {readonly string[]} _args
 * @returns {Promise<number>}
 */
async function show(_args: readonly string[]): Promise<number> {
  const client = new RemoteControlScannerClient()
  const [currentResult, batchesResult] = await Promise.all([
    client.getCurrentBatch(),
    client.getBatches(),
  ])

  if (currentResult.isErr() || batchesResult.isErr()) {
    process.stderr.write(
      `error: ${currentResult.err() ?? batchesResult.err()}\n`
    )
    return 1
  }

  const currentBatch = currentResult.unwrap()
  if (currentBatch) {
    process.stdout.write('# current batch\n')
    printBatch(currentBatch)
  }

  printBatches(batchesResult.unwrap())
  return 0
}

function parseBatchFromArgs(args: readonly string[]): Result<Batch, Error> {
  const batch: Batch = []

  for (let i = 0; i < args.length; i += 2) {
    const front = args[i]
    const back = args[i + 1]

    if (front.startsWith('-')) {
      return err(new Error(`error: unexpected option: ${front}\n`))
    } else if (back.startsWith('-')) {
      return err(new Error(`error: unexpected option: ${back}\n`))
    } else if (!back) {
      return err(new Error(`error: missing back page for front: ${front}\n`))
    } else {
      batch.push([resolve(process.cwd(), front), resolve(process.cwd(), back)])
    }
  }

  return ok(batch)
}

async function newBatch(args: readonly string[]): Promise<number> {
  const parseBatchResult = parseBatchFromArgs(args)

  if (parseBatchResult.isErr()) {
    process.stderr.write(`error: ${parseBatchResult.err().message}\n`)
    return 1
  }

  const client = new RemoteControlScannerClient()
  return (await client.addBatch(parseBatchResult.unwrap())).mapOrElse(
    (error) => {
      process.stderr.write(`error: ${error.message}\n`)
      return 1
    },
    (batches) => {
      printBatches(batches)
      return 0
    }
  )
}

async function addToBatch(args: readonly string[]): Promise<number> {
  let parseBatchResult: Result<Batch, Error>
  let target: 'next' | 'last' = 'next'

  if (args[0] === '--next') {
    target = 'next'
    parseBatchResult = parseBatchFromArgs(args.slice(1))
  } else if (args[0] === '--last') {
    target = 'last'
    parseBatchResult = parseBatchFromArgs(args.slice(1))
  } else {
    parseBatchResult = parseBatchFromArgs(args)
  }

  if (parseBatchResult.isErr()) {
    process.stderr.write(`error: ${parseBatchResult.err().message}\n`)
    return 1
  }

  const client = new RemoteControlScannerClient()
  const sheets = parseBatchResult.unwrap()
  return (target === 'next'
    ? await client.addSheetsToNextBatch(...sheets)
    : await client.addSheetsToLastBatch(...sheets)
  ).mapOrElse(
    (error) => {
      process.stderr.write(`error: ${error.message}\n`)
      return 1
    },
    (batch) => {
      process.stdout.write(`# ${target} batch\n`)
      printBatch(batch)
      return 0
    }
  )
}

function usage(out: NodeJS.WritableStream): void {
  out.write(`bin/mock-scanner show\n`)
  out.write(
    `bin/mock-scanner new-batch [--next|--last] IMGFRONT IMGBACK [IMGFRONT IMGBACK …]\n`
  )
  out.write(
    `bin/mock-scanner add-to-batch [--next|--last] IMGFRONT IMGBACK [IMGFRONT IMGBACK …]\n`
  )
}

if (require.main === module) {
  main(process.argv.slice(2))
    .catch((error) => {
      console.error(error.stack)
      return 1
    })
    .then((code) => {
      process.exitCode = code
    })
}
