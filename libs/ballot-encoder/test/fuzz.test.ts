/**
 * This test file is a bit different from the others. It does fuzz testing of
 * `BitReader` and `BitWriter` by ensuring that a random sequence of
 * corresponding write and read actions yields the appropriate values.
 */

/* @typescript-eslint/no-explicit-any */

import { Random } from 'random-js'
import { inspect } from 'util'
import {
  BitReader,
  BitWriter,
  CustomEncoding,
  Uint8Index,
  Uint8Size,
} from '../src/bits'
import { SubType } from '../src/types'

// eslint-disable-next-line @typescript-eslint/ban-types
type BitWriterMethods = SubType<BitWriter, Function>
interface BitWriterAction<
  M extends keyof BitWriterMethods = keyof BitWriterMethods
> {
  method: M
  args: Parameters<BitWriterMethods[M]>
  returnValue?: ReturnType<BitWriterMethods[M]>
}

// eslint-disable-next-line @typescript-eslint/ban-types
type BitReaderMethods = SubType<BitReader, Function>
interface BitReaderAction<
  M extends keyof BitReaderMethods = keyof BitReaderMethods
> {
  method: M
  args: Parameters<BitReaderMethods[M]>
  returnValue?: ReturnType<BitReaderMethods[M]>
}

type Action<
  C extends BitWriter | BitReader = BitWriter | BitReader
> = C extends BitWriter ? BitWriterAction : BitReaderAction

interface PerformedAction<
  C extends BitWriter | BitReader = BitWriter | BitReader
> {
  receiver: C
  action: Action<C>
}

const random = new Random()

type ActionsPair = [BitWriterAction[], BitReaderAction[]]

/**
 * Test cases are a pair of lists for write and read actions that should match
 * up together. The idea is to generate random values that will better exercise
 * the range of values and order of operations possible than hardcoded tests can.
 */
const testCaseFactories = {
  'vararg booleans': (): ActionsPair => {
    const argCount = random.integer(0, 10)
    const args = new Array<boolean>(argCount)
      .fill(false)
      .map(() => random.bool())

    return [
      [{ method: 'writeBoolean', args }],
      args.map((arg) => ({
        method: 'readBoolean',
        args: [],
        returnValue: arg,
      })),
    ]
  },

  'length-prefixed utf-8 strings': (): ActionsPair => {
    const length = random.integer(0, 50)
    const maxLength = random.integer(length, length * 2)
    const string = random.string(length)

    return [
      [{ method: 'writeString', args: [string, { maxLength }] }],
      [{ method: 'readString', args: [{ maxLength }], returnValue: string }],
    ]
  },

  'length-prefixed strings with custom encoding': (): ActionsPair => {
    const chars = Array.from(
      new Set(random.string(random.integer(1, 20))).values()
    ).join('')
    const string = random.string(random.integer(0, 50), chars)
    const encoding = new CustomEncoding(chars)

    return [
      [{ method: 'writeString', args: [string, { encoding }] }],
      [{ method: 'readString', args: [{ encoding }], returnValue: string }],
    ]
  },

  'dynamic size uints': (): ActionsPair => {
    const useMax = random.bool()
    const useSize = !useMax
    const max = useMax ? random.integer(0, 1 << 30) : undefined
    const size = useSize ? random.integer(0, 30) : undefined
    const number = random.integer(0, useMax ? max! : 1 << (size! - 1))

    return [
      [
        {
          method: 'writeUint',
          args: [number, { max, size } as { size: number }] as Parameters<
            BitWriter['writeUint']
          >,
        },
      ],
      [
        {
          method: 'readUint',
          args: [{ max, size } as { size: number }] as Parameters<
            BitReader['readUint']
          >,
          returnValue: number,
        },
      ],
    ]
  },

  'vararg uint1s': (): ActionsPair => {
    const argCount = random.integer(0, 10)
    const args = new Array<0 | 1>(argCount)
      .fill(0)
      .map(() => random.integer(0, 1))

    return [
      [
        {
          method: 'writeUint1',
          args: args as Parameters<BitWriter['writeUint1']>,
        },
      ],
      args.map((arg) => ({
        method: 'readUint1',
        args: [],
        returnValue: arg,
      })),
    ]
  },

  'vararg uint8s': (): ActionsPair => {
    const argCount = random.integer(0, 10)
    const args = new Array<Uint8Index>(argCount)
      .fill(0)
      .map(() => random.integer(0, Uint8Size - 1))

    return [
      [
        {
          method: 'writeUint8',
          args: args as Parameters<BitWriter['writeUint8']>,
        },
      ],
      args.map((arg) => ({
        method: 'readUint8',
        args: [],
        returnValue: arg,
      })),
    ]
  },
}

/**
 * Runs a sequence of write operations on `BitWriter`, loads the resulting
 * buffer into a `BitReader`, and then runs a series of read operations checking
 * the return values are as expected.
 *
 * @example
 *
 * doWritesAndReads([
 *   [{ method: 'writeBoolean', args: [true] }],
 *   [{ method: 'readBoolean', args: [], returnValue: true }]
 * ])
 */
function doWritesAndReads([writes, reads]: ActionsPair): void {
  const performedActions: PerformedAction[] = []
  const writer = new BitWriter()

  for (const write of writes) {
    performAction(write, writer, performedActions)
  }

  const reader = new BitReader(writer.toUint8Array())

  for (const read of reads) {
    performAction(read, reader, performedActions)
  }
}

const testCaseNames = Object.getOwnPropertyNames(
  testCaseFactories
) as (keyof typeof testCaseFactories)[]

for (const testCase of testCaseNames) {
  test(testCase, () => {
    for (let i = 0; i < 1000; i += 1) {
      doWritesAndReads(testCaseFactories[testCase]())
    }
  })
}

/**
 * Bring together a bunch of test cases to be run together on the same
 * `BitWriter` and `BitReader`, to test interactions between them.
 */
test('all together', () => {
  for (let i = 0; i < 100; i += 1) {
    const factories = new Array(20)
      .fill(undefined)
      .map(() => testCaseFactories[random.pick(testCaseNames)])

    const [writes, reads]: ActionsPair = [[], []]

    for (const factory of factories) {
      const [w, r] = factory()

      writes.push(...w)
      reads.push(...r)
    }

    doWritesAndReads([writes, reads])
  }
})

const codeColor = '\x1b[38;5;202m'
const dimColor = '\x1b[38;5;240m'
const resetColor = '\x1b[0m'

/**
 * Formats `action` in pseudocode calling syntax.
 *
 * @example
 *
 * formatAction({ method: 'push', args: [1], receiver: array })               // Array#push(1)
 * formatAction({ method: 'pop', args: [], receiver: array, returnValue: 1 }) // Array#pop() → 1
 */
function formatAction(
  { action, receiver }: PerformedAction,
  includeReturnValue = false
): string {
  return `${codeColor}${receiver.constructor.name}#${
    action.method
  }(${resetColor}${(action.args as string[])
    .map((arg) => inspect(arg, { colors: true }))
    .join(', ')}${codeColor})${resetColor}${
    includeReturnValue && typeof action.returnValue !== 'undefined'
      ? ` → ${inspect(action.returnValue, { colors: true })}`
      : ''
  }`
}

/**
 * Formats `actions` in a list, one per line.
 *
 * @example
 *
 * // Formats lists.
 * // - Array#push(1)
 * // - Array#pop() → 1
 * formatActions([
 *   { method: 'push', args: [1], receiver: array },
 *   { method: 'pop', args: [], receiver: array, returnValue: 1 },
 * ])
 *
 * // Has a basic "null" state.
 * // - n/a
 * formatActions([])
 */
function formatActions(actions: PerformedAction[]): string {
  if (actions.length === 0) {
    return `- ${dimColor}n/a${resetColor}`
  }

  return actions.map((action) => `- ${formatAction(action, true)}`).join('\n')
}

/**
 * Performs `action` with `instance` and logs it in `performedActions`. This
 * amounts to calling a method on `instance` and optionally checking its return
 * value. If either the method call fails or the return value is not the
 * expected value, an error will be thrown with the log of performed actions
 * that led to this failure.
 */
function performAction<C extends BitWriter | BitReader>(
  action: Action<C>,
  receiver: C,
  log: PerformedAction<C>[]
): void {
  let actualValue: typeof action['returnValue']

  try {
    actualValue = (receiver as any)[action.method](...action.args)
  } catch (error) {
    error.message = `After performing these actions:\n${formatActions(
      log
    )}\n\nAction ${formatAction({ receiver, action })}${
      typeof action.returnValue === 'undefined'
        ? ''
        : ` (expected return ${inspect(action.returnValue, { colors: true })})`
    } failed with error message: ${error.message}`
    throw error
  }

  if (typeof action.returnValue !== 'undefined') {
    try {
      expect(actualValue).toEqual(action.returnValue)
    } catch (error) {
      error.message = `After performing these actions:\n${formatActions(
        log
      )}\n\nAction ${formatAction({
        receiver,
        action,
      })} did not return expected value.\n\n${error.message}`
      throw error
    }
  }

  log.push({ receiver, action })
}
