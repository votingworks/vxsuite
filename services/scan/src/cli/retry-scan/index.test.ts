import { dirSync } from 'tmp';
import { ALL_PRECINCTS_SELECTION, typedAs } from '@votingworks/utils';
import { electionGridLayoutNewHampshireHudsonFixtures } from '@votingworks/fixtures';
import {
  PageInterpretation,
  PageInterpretationWithFiles,
} from '@votingworks/types';
import * as fixtures from '../../../test/fixtures/choctaw-2020-09-22-f30480cc99';
import { createWorkspace } from '../../util/workspace';
import { queryFromOptions, retryScan } from '.';
import { parseOptions } from './options';
import {
  createInterpreter,
  SheetInterpretation,
} from '../../precinct_scanner_interpreter';

jest.setTimeout(20000);

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
          front_interpretation_json as frontInterpretationJson,
          back_interpretation_json as backInterpretationJson
        from sheets
        
        ",
      Array [],
    ]
  `);
});

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
          front_interpretation_json as frontInterpretationJson,
          back_interpretation_json as backInterpretationJson
        from sheets
        where json_extract(front_interpretation_json, '$.type') = 'UnreadablePage' or
          json_extract(back_interpretation_json, '$.type') = 'UnreadablePage'
        ",
      Array [],
    ]
  `);
});

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
          front_interpretation_json as frontInterpretationJson,
          back_interpretation_json as backInterpretationJson
        from sheets
        where json_extract(front_interpretation_json, '$.type') = 'UninterpretedHmpbPage' or
          json_extract(back_interpretation_json, '$.type') = 'UninterpretedHmpbPage'
        ",
      Array [],
    ]
  `);
});

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
          front_interpretation_json as frontInterpretationJson,
          back_interpretation_json as backInterpretationJson
        from sheets
        where json_extract(front_interpretation_json, '$.type') = 'UnreadablePage' or
          json_extract(back_interpretation_json, '$.type') = 'UnreadablePage' or json_extract(front_interpretation_json, '$.type') = 'UninterpretedHmpbPage' or
          json_extract(back_interpretation_json, '$.type') = 'UninterpretedHmpbPage'
        ",
      Array [],
    ]
  `);
});

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
          front_interpretation_json as frontInterpretationJson,
          back_interpretation_json as backInterpretationJson
        from sheets
        where json_extract(front_interpretation_json, '$.type') != 'UnreadablePage' and
          json_extract(back_interpretation_json, '$.type') != 'UnreadablePage'
        ",
      Array [],
    ]
  `);
});

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
          front_interpretation_json as frontInterpretationJson,
          back_interpretation_json as backInterpretationJson
        from sheets
        where id = ? or id = ?
        ",
      Array [
        "abcdefg",
        "hijklm",
      ],
    ]
  `);
});

(process.env.CI ? test.skip : test)('full rescan', async () => {
  const inputWorkspace = createWorkspace(dirSync().name);
  const { store } = inputWorkspace;

  store.setElection(fixtures.electionDefinition);
  store.setPrecinctSelection(ALL_PRECINCTS_SELECTION);
  store.setTestMode(false);
  store.setSkipElectionHashCheck(true);

  const batchId = store.addBatch();
  store.addSheet('a-test-sheet-id', batchId, [
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
  ]);

  const sheetsLoading = jest.fn();
  const sheetsLoaded = jest.fn();
  const interpreterLoading = jest.fn();
  const interpreterLoaded = jest.fn();
  const pageInterpreted = jest.fn();
  const interpreterUnloaded = jest.fn();
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
  );

  expect(sheetsLoading).toHaveBeenCalledTimes(1);
  expect(sheetsLoaded).toHaveBeenNthCalledWith(
    1,
    1,
    fixtures.electionDefinition
  );
  expect(interpreterLoading).toHaveBeenCalledTimes(1);
  expect(interpreterLoaded).toHaveBeenCalledTimes(1);
  expect(pageInterpreted).toHaveBeenCalledTimes(2);
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
  );
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
  );
});

(process.env.CI ? test.skip : test)(
  'writing output to another database',
  async () => {
    const inputWorkspace = createWorkspace(dirSync().name);
    const outputWorkspace = createWorkspace(dirSync().name);
    const inputDb = inputWorkspace.store;

    inputDb.setElection(fixtures.electionDefinition);
    inputDb.setPrecinctSelection(ALL_PRECINCTS_SELECTION);
    inputDb.setTestMode(false);
    inputDb.setSkipElectionHashCheck(true);

    const batchId = inputDb.addBatch();
    inputDb.addSheet('a-test-sheet-id', batchId, [
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
    ]);

    const pageInterpreted = jest.fn();
    await retryScan(
      parseOptions([
        '--input-workspace',
        inputWorkspace.path,
        '--output-workspace',
        outputWorkspace.path,
        '--all',
      ]),
      { pageInterpreted }
    );

    expect(pageInterpreted).toHaveBeenCalledTimes(2);
    expect(pageInterpreted).toHaveBeenNthCalledWith(
      1,
      'a-test-sheet-id',
      expect.any(String), // 'front' | 'back'
      expect.objectContaining({
        interpretation: {
          type: 'UnreadablePage',
          reason: 'just because, okay?',
        },
      }),
      expect.objectContaining({
        interpretation: expect.objectContaining({
          type: 'UninterpretedHmpbPage',
        }),
      })
    );
    expect(pageInterpreted).toHaveBeenNthCalledWith(
      2,
      'a-test-sheet-id',
      expect.any(String), // 'front' | 'back'
      expect.objectContaining({
        interpretation: {
          type: 'UnreadablePage',
          reason: 'just because, okay?',
        },
      }),
      expect.objectContaining({
        interpretation: expect.objectContaining({
          type: 'UninterpretedHmpbPage',
        }),
      })
    );

    const outputDb = outputWorkspace.store;
    expect(
      outputDb.dbAll(
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
  `);
  }
);

(process.env.CI ? test.skip : test)('NH interpreter', async () => {
  const inputWorkspace = createWorkspace(dirSync().name);
  const outputWorkspace = createWorkspace(dirSync().name);
  const { store } = inputWorkspace;

  store.setElection(
    electionGridLayoutNewHampshireHudsonFixtures.electionDefinition
  );
  store.setPrecinctSelection(ALL_PRECINCTS_SELECTION);
  store.setTestMode(false);

  const interpreter = createInterpreter();
  interpreter.configure({
    electionDefinition:
      electionGridLayoutNewHampshireHudsonFixtures.electionDefinition,
    ballotImagesPath: inputWorkspace.ballotImagesPath,
    precinctSelection: ALL_PRECINCTS_SELECTION,
    layouts: [],
    testMode: false,
  });

  const result = await interpreter.interpret('a-test-sheet-id', [
    electionGridLayoutNewHampshireHudsonFixtures.scanMarkedFront.asFilePath(),
    electionGridLayoutNewHampshireHudsonFixtures.scanMarkedBack.asFilePath(),
  ]);

  const interpretation = result.unsafeUnwrap();

  expect(interpretation).toEqual(
    expect.objectContaining(
      typedAs<Partial<SheetInterpretation>>({
        type: 'NeedsReviewSheet',
      })
    )
  );

  const batchId = store.addBatch();
  store.addSheet('a-test-sheet-id', batchId, interpretation.pages);

  const pageInterpreted = jest.fn();
  await retryScan(
    parseOptions([
      '--input-workspace',
      inputWorkspace.path,
      '--output-workspace',
      outputWorkspace.path,
      '--all',
    ]),
    { pageInterpreted }
  );

  expect(pageInterpreted).toHaveBeenCalledTimes(2);
  expect(pageInterpreted).toHaveBeenNthCalledWith(
    1,
    'a-test-sheet-id',
    'front',
    expect.objectContaining(
      typedAs<Partial<PageInterpretationWithFiles>>({
        interpretation: expect.objectContaining(
          typedAs<Partial<PageInterpretation>>({
            type: 'InterpretedHmpbPage',
          })
        ),
      })
    ),
    expect.objectContaining(
      typedAs<Partial<PageInterpretationWithFiles>>({
        interpretation: expect.objectContaining(
          typedAs<Partial<PageInterpretation>>({
            type: 'InterpretedHmpbPage',
          })
        ),
      })
    )
  );
  expect(pageInterpreted).toHaveBeenNthCalledWith(
    2,
    'a-test-sheet-id',
    'back',
    expect.objectContaining(
      typedAs<Partial<PageInterpretationWithFiles>>({
        interpretation: expect.objectContaining(
          typedAs<Partial<PageInterpretation>>({
            type: 'InterpretedHmpbPage',
          })
        ),
      })
    ),
    expect.objectContaining(
      typedAs<Partial<PageInterpretationWithFiles>>({
        interpretation: expect.objectContaining(
          typedAs<Partial<PageInterpretation>>({
            type: 'InterpretedHmpbPage',
          })
        ),
      })
    )
  );
});
