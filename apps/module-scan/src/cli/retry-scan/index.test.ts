import { dirSync } from 'tmp'
import * as fixtures from '../../../test/fixtures/choctaw-2020-09-22-f30480cc99'
import { createWorkspace } from '../../util/workspace'
import { queryFromOptions, retryScan } from './'
import { parseOptions } from './options'

jest.setTimeout(20000)

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
  const inputWorkspace = await createWorkspace(dirSync().name)
  const store = inputWorkspace.store

  await store.setElection({
    election: fixtures.election,
    electionData: JSON.stringify(fixtures.election),
    electionHash: '02f807b005e006da160b',
  })

  const batchId = await store.addBatch()
  await store.addSheet('a-test-sheet-id', batchId, [
    {
      interpretation: {
        type: 'UnreadablePage',
        reason: 'just because, okay?',
      },
      originalFilename: fixtures.blankPage1,
      normalizedFilename: fixtures.blankPage1,
    },
    {
      interpretation: {
        type: 'UnreadablePage',
        reason: 'just because, okay?',
      },
      originalFilename: fixtures.blankPage2,
      normalizedFilename: fixtures.blankPage2,
    },
  ])

  const sheetsLoading = jest.fn()
  const sheetsLoaded = jest.fn()
  const interpreterLoading = jest.fn()
  const interpreterLoaded = jest.fn()
  const pageInterpreted = jest.fn()
  const interpreterUnloaded = jest.fn()
  await retryScan(
    parseOptions(['--input-workspace', inputWorkspace.path, '--all']),
    {
      sheetsLoading,
      sheetsLoaded,
      interpreterLoading,
      interpreterLoaded,
      pageInterpreted,
      interpreterUnloaded,
    }
  )

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
})

test('writing output to another database', async () => {
  const inputWorkspace = await createWorkspace(dirSync().name)
  const outputWorkspace = await createWorkspace(dirSync().name)
  const inputDb = inputWorkspace.store

  await inputDb.setElection({
    election: fixtures.election,
    electionData: JSON.stringify(fixtures.election),
    electionHash: '02f807b005e006da160b',
  })

  const batchId = await inputDb.addBatch()
  await inputDb.addSheet('a-test-sheet-id', batchId, [
    {
      interpretation: {
        type: 'UnreadablePage',
        reason: 'just because, okay?',
      },
      originalFilename: fixtures.blankPage1,
      normalizedFilename: fixtures.blankPage1,
    },
    {
      interpretation: {
        type: 'UnreadablePage',
        reason: 'just because, okay?',
      },
      originalFilename: fixtures.blankPage2,
      normalizedFilename: fixtures.blankPage2,
    },
  ])

  const pageInterpreted = jest.fn()
  await retryScan(
    parseOptions([
      '--input-workspace',
      inputWorkspace.path,
      '--output-workspace',
      outputWorkspace.path,
      '--all',
    ]),
    { pageInterpreted }
  )

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

  const outputDb = outputWorkspace.store
  expect(
    await outputDb.dbAllAsync(
      'select id, front_interpretation_json, back_interpretation_json from sheets'
    )
  ).toMatchInlineSnapshot(`
    Array [
      Object {
        "back_interpretation_json": "{\\"type\\":\\"UninterpretedHmpbPage\\",\\"metadata\\":{\\"electionHash\\":\\"02f807b005e006da160b\\",\\"precinctId\\":\\"6538\\",\\"ballotStyleId\\":\\"1\\",\\"locales\\":{\\"primary\\":\\"en-US\\"},\\"pageNumber\\":2,\\"isTestMode\\":false,\\"ballotType\\":0}}",
        "front_interpretation_json": "{\\"type\\":\\"UninterpretedHmpbPage\\",\\"metadata\\":{\\"electionHash\\":\\"02f807b005e006da160b\\",\\"precinctId\\":\\"6538\\",\\"ballotStyleId\\":\\"1\\",\\"locales\\":{\\"primary\\":\\"en-US\\"},\\"pageNumber\\":1,\\"isTestMode\\":false,\\"ballotType\\":0}}",
        "id": "a-test-sheet-id",
      },
    ]
  `)
})
