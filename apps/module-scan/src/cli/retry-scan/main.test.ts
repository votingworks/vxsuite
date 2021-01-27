import { BallotType, electionSample } from '@votingworks/ballot-encoder'
import { WritableStream } from 'memory-streams'
import { retryScan } from './index'
import main, { printHelp } from './main'

jest.mock('../util/spinner')
jest.mock('./index')

const retryScanMock = retryScan as jest.MockedFunction<typeof retryScan>

beforeEach(() => {
  retryScanMock.mockClear()
})

test('printHelp', () => {
  const out = new WritableStream()
  printHelp(out)
  expect(out.toString()).toMatchInlineSnapshot(`
    "retry-scan: Retry scanning already-scanned sheets.

    retry-scan --all
    retry-scan [--unreadable] [--uninterpreted]
    retry-scan SHEETID [SHEETID …]

    Combining filters is an OR, not an AND, so '--unreadable --uninterpreted'
    retries sheets with pages that are either unreadable or uninterpreted.

    Options
      -i, --input-workspace   A directory containing a database and scanned images, such as from
                              an unzipped backup. Defaults to the dev-workspace directory.
      -o, --output-workspace  A directory to put the output database and scanned images.
                              Defaults to a temporary directory.
      -d, --diff-when RULE    When to print a diff of interpretations: always, never, or same-type (default).
    "
  `)
})

test('fails given invalid options', async () => {
  const stdout = new WritableStream()
  const stderr = new WritableStream()
  expect(await main([], { stdout, stderr })).not.toEqual(0)
  expect(stderr.toString()).toContain('no filters provided')
  expect(stdout.toString()).toEqual('')
})

test('prints help to stdout', async () => {
  const stdout = new WritableStream()
  const stderr = new WritableStream()
  expect(await main(['--help'], { stdout, stderr })).toEqual(0)
  expect(stdout.toString()).toContain(
    'retry-scan: Retry scanning already-scanned sheets.'
  )
  expect(stderr.toString()).toEqual('')
})

test('successful rescan with no changes', async () => {
  const stdout = new WritableStream()
  const stderr = new WritableStream()

  retryScanMock.mockResolvedValue()
  expect(await main(['--all'], { stdout, stderr })).toEqual(0)
  expect(stdout.toString()).toContain(
    '🏁 No pages differed from their original interpretation'
  )
  expect(stderr.toString()).toEqual('')
})

test('successful rescan with one non-type change', async () => {
  const stdout = new WritableStream()
  const stderr = new WritableStream()

  let resolve: (() => void) | undefined
  retryScanMock.mockResolvedValue(new Promise((res) => (resolve = res)))

  const mainPromise = main(['--all'], { stdout, stderr })
  const [[, listeners]] = retryScanMock.mock.calls
  const frontScan = {
    interpretation: {
      type: 'InterpretedBmdPage',
      ballotId: '',
      metadata: {
        ballotStyleId: '1',
        precinctId: '2',
        ballotType: BallotType.Standard,
        electionHash: '',
        isTestMode: false,
        locales: { primary: 'en-US' },
      },
      votes: {},
    },
    originalFilename: '/tmp/abc.png',
    normalizedFilename: '/tmp/abc-normalized.png',
  } as const
  const backScan = {
    interpretation: { type: 'BlankPage' },
    originalFilename: '/tmp/def.png',
    normalizedFilename: '/tmp/def-normalized.png',
  } as const

  listeners?.sheetsLoading?.()
  listeners?.sheetsLoaded?.(1, electionSample)
  listeners?.interpreterLoading?.()
  listeners?.interpreterLoaded?.()
  listeners?.pageInterpreted?.('a-test-sheet-id', 'front', frontScan, {
    ...frontScan,
    // change the votes in the rescan
    interpretation: { ...frontScan.interpretation, votes: { 99: ['yes'] } },
  })
  listeners?.pageInterpreted?.('a-test-sheet-id', 'back', backScan, backScan)
  listeners?.interpreterUnloaded?.()

  process.nextTick(resolve!)
  await mainPromise

  expect(stdout.toString()).toMatchInlineSnapshot(`
    "🏁 1 page(s) differed from the original interpretation.

    📑 InterpretedBmdPage → InterpretedBmdPage
        Sheet ID: a-test-sheet-id
            Side: front
           Image: /tmp/abc.png
      Normalized: /tmp/abc-normalized.png
    - Original
    + Re-scanned

      Object {
        \\"ballotId\\": \\"\\",
        \\"metadata\\": Object {
          \\"ballotStyleId\\": \\"1\\",
          \\"ballotType\\": 0,
          \\"electionHash\\": \\"\\",
          \\"isTestMode\\": false,
          \\"locales\\": Object {
            \\"primary\\": \\"en-US\\",
          },
          \\"precinctId\\": \\"2\\",
        },
        \\"type\\": \\"InterpretedBmdPage\\",
    -   \\"votes\\": Object {},
    +   \\"votes\\": Object {
    +     \\"99\\": Array [
    +       \\"yes\\",
    +     ],
    +   },
      }

    "
  `)
  expect(stderr.toString()).toEqual('')
})
