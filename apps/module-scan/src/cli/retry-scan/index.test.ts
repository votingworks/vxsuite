import { tmpNameSync } from 'tmp'
import Store from '../../store'
import { retryScan, queryFromOptions } from './'
import { parseOptions } from './options'
import * as fixtures from '../../../test/fixtures/state-of-hamilton'

test('--all query', () => {
  expect(queryFromOptions(parseOptions(['--all']))).toMatchInlineSnapshot(`
    Array [
      "
        select
          id,
          front_original_filename as frontOriginalFilename,
          back_original_filename as backOriginalFilename,
          front_normalized_filename as frontNormalizedFilename,
          back_normalized_filename as backNormalizedFilename,
          front_interpretation_json as frontInterpretationJSON,
          back_interpretation_json as backInterpretationJSON
        from sheets
        
        ",
      Array [],
    ]
  `)
})

test('--unreadable query', () => {
  expect(queryFromOptions(parseOptions(['--unreadable'])))
    .toMatchInlineSnapshot(`
    Array [
      "
        select
          id,
          front_original_filename as frontOriginalFilename,
          back_original_filename as backOriginalFilename,
          front_normalized_filename as frontNormalizedFilename,
          back_normalized_filename as backNormalizedFilename,
          front_interpretation_json as frontInterpretationJSON,
          back_interpretation_json as backInterpretationJSON
        from sheets
        where json_extract(front_interpretation_json, '$.type') = 'UnreadablePage' or
          json_extract(back_interpretation_json, '$.type') = 'UnreadablePage'
        ",
      Array [],
    ]
  `)
})

test('--uninterpreted query', () => {
  expect(queryFromOptions(parseOptions(['--uninterpreted'])))
    .toMatchInlineSnapshot(`
    Array [
      "
        select
          id,
          front_original_filename as frontOriginalFilename,
          back_original_filename as backOriginalFilename,
          front_normalized_filename as frontNormalizedFilename,
          back_normalized_filename as backNormalizedFilename,
          front_interpretation_json as frontInterpretationJSON,
          back_interpretation_json as backInterpretationJSON
        from sheets
        where json_extract(front_interpretation_json, '$.type') = 'UninterpretedHmpbPage' or
          json_extract(back_interpretation_json, '$.type') = 'UninterpretedHmpbPage'
        ",
      Array [],
    ]
  `)
})

test('--uninterpreted & --unreadable query', () => {
  expect(queryFromOptions(parseOptions(['--uninterpreted', '--unreadable'])))
    .toMatchInlineSnapshot(`
    Array [
      "
        select
          id,
          front_original_filename as frontOriginalFilename,
          back_original_filename as backOriginalFilename,
          front_normalized_filename as frontNormalizedFilename,
          back_normalized_filename as backNormalizedFilename,
          front_interpretation_json as frontInterpretationJSON,
          back_interpretation_json as backInterpretationJSON
        from sheets
        where json_extract(front_interpretation_json, '$.type') = 'UnreadablePage' or
          json_extract(back_interpretation_json, '$.type') = 'UnreadablePage' or json_extract(front_interpretation_json, '$.type') = 'UninterpretedHmpbPage' or
          json_extract(back_interpretation_json, '$.type') = 'UninterpretedHmpbPage'
        ",
      Array [],
    ]
  `)
})

test('--no-unreadable query', () => {
  expect(queryFromOptions(parseOptions(['--no-unreadable'])))
    .toMatchInlineSnapshot(`
    Array [
      "
        select
          id,
          front_original_filename as frontOriginalFilename,
          back_original_filename as backOriginalFilename,
          front_normalized_filename as frontNormalizedFilename,
          back_normalized_filename as backNormalizedFilename,
          front_interpretation_json as frontInterpretationJSON,
          back_interpretation_json as backInterpretationJSON
        from sheets
        where json_extract(front_interpretation_json, '$.type') != 'UnreadablePage' and
          json_extract(back_interpretation_json, '$.type') != 'UnreadablePage'
        ",
      Array [],
    ]
  `)
})

test('query with sheet ids', () => {
  expect(queryFromOptions(parseOptions(['abcdefg', 'hijklm'])))
    .toMatchInlineSnapshot(`
    Array [
      "
        select
          id,
          front_original_filename as frontOriginalFilename,
          back_original_filename as backOriginalFilename,
          front_normalized_filename as frontNormalizedFilename,
          back_normalized_filename as backNormalizedFilename,
          front_interpretation_json as frontInterpretationJSON,
          back_interpretation_json as backInterpretationJSON
        from sheets
        where id = ? or id = ?
        ",
      Array [
        "abcdefg",
        "hijklm",
      ],
    ]
  `)
})

test('full rescan', async () => {
  const dbPath = tmpNameSync()
  const store = await Store.fileStore(dbPath)

  await store.setElection({
    election: fixtures.election,
    electionData: JSON.stringify(fixtures.election),
    electionHash: 'not-a-hash',
  })

  const batchId = await store.addBatch()
  await store.addSheet('a-test-sheet-id', batchId, [
    {
      interpretation: {
        type: 'UnreadablePage',
        reason: 'just because, okay?',
      },
      originalFilename: fixtures.filledInPage1,
      normalizedFilename: fixtures.filledInPage1,
    },
    {
      interpretation: {
        type: 'UnreadablePage',
        reason: 'just because, okay?',
      },
      originalFilename: fixtures.filledInPage2,
      normalizedFilename: fixtures.filledInPage2,
    },
  ])

  const sheetsLoading = jest.fn()
  const sheetsLoaded = jest.fn()
  const interpreterLoading = jest.fn()
  const interpreterLoaded = jest.fn()
  const pageInterpreted = jest.fn()
  const interpreterUnloaded = jest.fn()
  await retryScan(parseOptions(['--db', dbPath, '--all']), {
    sheetsLoading,
    sheetsLoaded,
    interpreterLoading,
    interpreterLoaded,
    pageInterpreted,
    interpreterUnloaded,
  })

  expect(sheetsLoading).toHaveBeenCalledTimes(1)
  expect(sheetsLoaded).toHaveBeenNthCalledWith(1, 1, fixtures.election)
  expect(interpreterLoading).toHaveBeenCalledTimes(1)
  expect(interpreterLoaded).toHaveBeenCalledTimes(1)
  expect(pageInterpreted).toHaveBeenCalledTimes(2)
  expect(pageInterpreted).toHaveBeenNthCalledWith(
    1,
    'a-test-sheet-id',
    expect.any(String), // 'front' | 'back'
    expect.objectContaining({
      interpretation: { type: 'UnreadablePage', reason: 'just because, okay?' },
    }),
    expect.objectContaining({
      interpretation: expect.objectContaining({
        type: 'UninterpretedHmpbPage',
      }),
    })
  )
  expect(pageInterpreted).toHaveBeenNthCalledWith(
    2,
    'a-test-sheet-id',
    expect.any(String), // 'front' | 'back'
    expect.objectContaining({
      interpretation: { type: 'UnreadablePage', reason: 'just because, okay?' },
    }),
    expect.objectContaining({
      interpretation: expect.objectContaining({
        type: 'UninterpretedHmpbPage',
      }),
    })
  )

  expect(1).toEqual(1)
})
