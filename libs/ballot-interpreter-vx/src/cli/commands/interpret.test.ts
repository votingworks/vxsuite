import { assert } from '@votingworks/utils';
import { writeFileSync } from 'fs';
import { relative } from 'path';
import { tmpNameSync } from 'tmp';
import { parseGlobalOptions } from '..';
import {
  blankPage1,
  blankPage2,
  electionDefinition,
  electionPath,
  filledInPage1,
  filledInPage2,
} from '../../../test/fixtures/election-4e31cb17d8-ballot-style-77-precinct-oaklawn-branch-library';
import { runCli } from '../../../test/utils';
import { OutputFormat, parseOptions } from './interpret';

jest.setTimeout(10000);

test('parse options: --election', async () => {
  for (const electionFlag of ['--election', '-e']) {
    expect(
      (
        await parseOptions(
          parseGlobalOptions([
            'node',
            'ballot-interpreter-vx',
            'interpret',
            electionFlag,
            electionPath,
          ]).unsafeUnwrap()
        )
      ).unsafeUnwrap()
    ).toEqual(
      expect.objectContaining({
        electionDefinition,
      })
    );
  }
});

test('parse options: --min-mark-score', async () => {
  for (const minMarkScoreFlag of ['--min-mark-score', '-m']) {
    expect(
      (
        await parseOptions(
          parseGlobalOptions([
            'node',
            'ballot-interpreter-vx',
            'interpret',
            '--election',
            electionPath,
            minMarkScoreFlag,
            '0.9',
          ]).unsafeUnwrap()
        )
      ).unsafeUnwrap()
    ).toEqual(
      expect.objectContaining({
        markScoreVoteThreshold: 0.9,
      })
    );

    expect(
      (
        await parseOptions(
          parseGlobalOptions([
            'node',
            'ballot-interpreter-vx',
            'interpret',
            '--election',
            electionPath,
            minMarkScoreFlag,
            '42%',
          ]).unsafeUnwrap()
        )
      ).unsafeUnwrap()
    ).toEqual(
      expect.objectContaining({
        markScoreVoteThreshold: 0.42,
      })
    );
  }

  expect(
    (
      await parseOptions(
        parseGlobalOptions([
          'node',
          'ballot-interpreter-vx',
          'interpret',
          '--election',
          electionPath,
          '-m',
          'I am not a number',
        ]).unsafeUnwrap()
      )
    ).unsafeUnwrapErr().message
  ).toEqual('Invalid minimum mark score: I am not a number');
});

test('parse options: --test-mode', async () => {
  for (const testModeFlag of ['--test-mode', '-T', '--no-test-mode']) {
    expect(
      (
        await parseOptions(
          parseGlobalOptions([
            'node',
            'ballot-interpreter-vx',
            'interpret',
            '--election',
            electionPath,
            testModeFlag,
          ]).unsafeUnwrap()
        )
      ).unsafeUnwrap()
    ).toEqual(
      expect.objectContaining({
        testMode: testModeFlag !== '--no-test-mode',
      })
    );
  }
});

test('parse options: --format', async () => {
  expect(
    (
      await parseOptions(
        parseGlobalOptions([
          'node',
          'ballot-interpreter-vx',
          'interpret',
          '--election',
          electionPath,
        ]).unsafeUnwrap()
      )
    ).unsafeUnwrap()
  ).toEqual(
    expect.objectContaining({
      format: OutputFormat.Table,
    })
  );

  for (const formatFlag of ['--format', '-f']) {
    expect(
      (
        await parseOptions(
          parseGlobalOptions([
            'node',
            'ballot-interpreter-vx',
            'interpret',
            '--election',
            electionPath,
            formatFlag,
            'JSON',
          ]).unsafeUnwrap()
        )
      ).unsafeUnwrap()
    ).toEqual(
      expect.objectContaining({
        format: OutputFormat.JSON,
      })
    );
  }

  expect(
    (
      await parseOptions(
        parseGlobalOptions([
          'node',
          'ballot-interpreter-vx',
          'interpret',
          '--election',
          electionPath,
          '-f',
          'yaml',
        ]).unsafeUnwrap()
      )
    ).unsafeUnwrapErr().message
  ).toEqual('Unknown output format: yaml');
});

test('parse option: --debug', async () => {
  expect(
    (
      await parseOptions(
        parseGlobalOptions([
          'node',
          'ballot-interpreter-vx',
          'interpret',
          '--election',
          electionPath,
          '--debug',
        ]).unsafeUnwrap()
      )
    ).unsafeUnwrap()
  ).toEqual(
    expect.objectContaining({
      debug: true,
    })
  );
});

test('parse options requires election', async () => {
  expect(
    (
      await parseOptions(
        parseGlobalOptions([
          'node',
          'ballot-interpreter-vx',
          'interpret',
        ]).unsafeUnwrap()
      )
    ).unsafeUnwrapErr().message
  ).toContain(`Required option 'election' is missing.`);

  expect(
    (
      await parseOptions(
        parseGlobalOptions([
          'node',
          'ballot-interpreter-vx',
          'interpret',
          '-e',
        ]).unsafeUnwrap()
      )
    ).unsafeUnwrapErr().message
  ).toEqual(`Expected election definition file after -e, but got nothing.`);

  expect(
    (
      await parseOptions(
        parseGlobalOptions([
          'node',
          'ballot-interpreter-vx',
          'interpret',
          '-e',
          '-t',
        ]).unsafeUnwrap()
      )
    ).unsafeUnwrapErr().message
  ).toEqual(`Expected election definition file after -e, but got -t.`);
});

test('invalid options', async () => {
  expect(await runCli(['interpret', '--wrong'])).toEqual({
    code: 1,
    stdout: '',
    stderr: expect.stringContaining('Unknown option: --wrong'),
  });
});

test('template and ballot flags', async () => {
  const options = (
    await parseOptions(
      parseGlobalOptions([
        'node',
        'ballot-interpreter-vx',
        'interpret',
        '-e',
        electionPath,
        '-t',
        'template.png',
        '-b',
        'ballot.png',
      ]).unsafeUnwrap()
    )
  ).unsafeUnwrap();
  assert(!options.help);
  expect(options.ballotInputs.map((bi) => bi.id())).toEqual(['ballot.png']);
  expect(options.templateInputs.map((ti) => ti.id())).toEqual(['template.png']);

  expect(
    (
      await parseOptions(
        parseGlobalOptions([
          'node',
          'ballot-interpreter-vx',
          'interpret',
          '-e',
          electionPath,
          '-t',
          '-b',
          'ballot.png',
        ]).unsafeUnwrap()
      )
    ).unsafeUnwrapErr().message
  ).toEqual('Expected template file after -t, but got -b');

  expect(
    (
      await parseOptions(
        parseGlobalOptions([
          'node',
          'ballot-interpreter-vx',
          'interpret',
          '-e',
          electionPath,
          '-t',
        ]).unsafeUnwrap()
      )
    ).unsafeUnwrapErr().message
  ).toEqual('Expected template file after -t, but got nothing');

  expect(
    (
      await parseOptions(
        parseGlobalOptions([
          'node',
          'ballot-interpreter-vx',
          'interpret',
          '-e',
          electionPath,
          '-t',
          'template.png',
          '-b',
        ]).unsafeUnwrap()
      )
    ).unsafeUnwrapErr().message
  ).toEqual('Expected ballot file after -b, but got nothing');
});

test('explicit metadata for templates and ballots', async () => {
  const metadataPath = tmpNameSync();
  writeFileSync(metadataPath, '{}');

  const options = (
    await parseOptions(
      parseGlobalOptions([
        'node',
        'ballot-interpreter-vx',
        'interpret',
        '-e',
        electionPath,
        '-t',
        `template.png:${metadataPath}`,
        '-b',
        `ballot.png:${metadataPath}`,
      ]).unsafeUnwrap()
    )
  ).unsafeUnwrap();
  assert(!options.help);
  expect(
    await Promise.all(
      options.ballotInputs.map(async (bi) => ({
        id: bi.id(),
        metadata: await bi.metadata?.(),
      }))
    )
  ).toEqual([{ id: 'ballot.png', metadata: {} }]);
  expect(
    await Promise.all(
      options.templateInputs.map(async (bi) => ({
        id: bi.id(),
        metadata: await bi.metadata?.(),
      }))
    )
  ).toEqual([{ id: 'template.png', metadata: {} }]);
});

test('file paths without explicit template/ballot flags', async () => {
  expect(
    (
      await parseOptions(
        parseGlobalOptions([
          'node',
          'ballot-interpreter-vx',
          'interpret',
          '-e',
          electionPath,
          'img01.png',
          'img02.png',
        ]).unsafeUnwrap()
      )
    ).unsafeUnwrapErr().message
  ).toEqual(`Unknown argument: img01.png`);
});

test('help', async () => {
  const { stdout } = await runCli(['interpret', '-h']);

  expect(stdout).toMatchInlineSnapshot(`
    "ballot-interpreter-vx interpret -e JSON IMG1 [IMG2 …]

    Examples

    # Interpret ballots based on a single template.
    ballot-interpreter-vx interpret -e election.json -t template.png ballot*.png

    # Interpret test mode ballots.
    ballot-interpreter-vx interpret -e election.json -T -t template.png ballot*.png

    # Interpret ballots to JSON.
    ballot-interpreter-vx interpret -e election.json -f json template*.png ballot*.png

    # Specify image metadata (file:metadata-file).
    ballot-interpreter-vx interpret -e election.json template1.png:template1-metadata.json template2.png:template2-metadata.json ballot1.png:ballot1-metadata.json

    # Set an explicit minimum mark score (0-1).
    ballot-interpreter-vx interpret -e election.json -m 0.5 template*.png ballot*.png
    "
  `);
});

test('run interpret', async () => {
  const { code, stdout, stderr } = await runCli([
    'interpret',
    '-e',
    electionPath,
    '-t',
    `${blankPage1.filePath()}:${blankPage1.metadataPath()}`,
    '-t',
    blankPage2.filePath(),
    '-b',
    `${relative(
      process.cwd(),
      filledInPage1.filePath()
    )}:${filledInPage1.metadataPath()}`,
    '-b',
    relative(process.cwd(), filledInPage2.filePath()),
  ]);

  expect({ code, stderr }).toEqual({ code: 0, stderr: '' });
  expect(stdout).toMatchInlineSnapshot(`
    "╔═══════════════════════════════════════════════════════╤════════════════════════════════════════════════════════════════════════════════════════════════════╤════════════════════════════════════════════════════════════════════════════════════════════════════╗
    ║ Contest                                               │ test/fixtures/election-4e31cb17d8-ballot-style-77-precinct-oaklawn-branch-library/filled-in-p1.jpg │ test/fixtures/election-4e31cb17d8-ballot-style-77-precinct-oaklawn-branch-library/filled-in-p2.jpg ║
    ╟───────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────╢
    ║ Member, U.S. Senate                                   │ Tim Smith                                                                                          │                                                                                                    ║
    ╟───────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────╢
    ║ Member, U.S. House, District 30                       │ Eddie Bernice Johnson                                                                              │                                                                                                    ║
    ╟───────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────╢
    ║ Judge, Texas Supreme Court, Place 6                   │ Jane Bland                                                                                         │                                                                                                    ║
    ╟───────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────╢
    ║ Member, Texas House of Representatives, District 111  │ Write-In                                                                                           │                                                                                                    ║
    ╟───────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────╢
    ║ Dallas County Tax Assessor-Collector                  │ John Ames                                                                                          │                                                                                                    ║
    ╟───────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────╢
    ║ Dallas County Sheriff                                 │ Chad Prda                                                                                          │                                                                                                    ║
    ╟───────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────╢
    ║ Member, Dallas County Commissioners Court, Precinct 3 │                                                                                                    │ Andrew Jewell                                                                                      ║
    ╟───────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────╢
    ║ Retain Robert Demergue as Chief Justice?              │                                                                                                    │ yes                                                                                                ║
    ╟───────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────╢
    ║ Proposition R: Countywide Recycling Program           │                                                                                                    │ no                                                                                                 ║
    ╟───────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────╢
    ║ City Council                                          │                                                                                                    │ Randall Rupp, Donald Davis, Write-In                                                               ║
    ╟───────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────╢
    ║ Mayor                                                 │                                                                                                    │                                                                                                    ║
    ╚═══════════════════════════════════════════════════════╧════════════════════════════════════════════════════════════════════════════════════════════════════╧════════════════════════════════════════════════════════════════════════════════════════════════════╝
    "
  `);
});

test('run interpret with JSON output', async () => {
  const { code, stdout, stderr } = await runCli([
    'interpret',
    '-e',
    electionPath,
    '-t',
    blankPage1.filePath(),
    '-b',
    relative(process.cwd(), filledInPage1.filePath()),
    '-f',
    'JSON',
  ]);

  expect({ code, stderr }).toEqual({ code: 0, stderr: '' });
  expect(stdout).toMatchInlineSnapshot(`
    "[
      {
        \\"input\\": \\"test/fixtures/election-4e31cb17d8-ballot-style-77-precinct-oaklawn-branch-library/filled-in-p1.jpg\\",
        \\"interpreted\\": {
          \\"metadata\\": {
            \\"electionHash\\": \\"81dd1469d19d1be870c459760a3a9f2e51c1871280d3de44be1aaff354b2e82c\\",
            \\"ballotType\\": 0,
            \\"locales\\": {
              \\"primary\\": \\"en-US\\"
            },
            \\"ballotStyleId\\": \\"77\\",
            \\"precinctId\\": \\"42\\",
            \\"isTestMode\\": false,
            \\"pageNumber\\": 1
          },
          \\"votes\\": {
            \\"us-senate\\": [
              {
                \\"id\\": \\"tim-smith\\",
                \\"name\\": \\"Tim Smith\\",
                \\"partyIds\\": [
                  \\"6\\"
                ]
              }
            ],
            \\"us-house-district-30\\": [
              {
                \\"id\\": \\"eddie-bernice-johnson\\",
                \\"name\\": \\"Eddie Bernice Johnson\\",
                \\"partyIds\\": [
                  \\"2\\"
                ]
              }
            ],
            \\"texas-sc-judge-place-6\\": [
              {
                \\"id\\": \\"jane-bland\\",
                \\"name\\": \\"Jane Bland\\",
                \\"partyIds\\": [
                  \\"3\\"
                ]
              }
            ],
            \\"texas-house-district-111\\": [
              {
                \\"id\\": \\"write-in-0\\",
                \\"name\\": \\"Write-In\\",
                \\"isWriteIn\\": true
              }
            ],
            \\"dallas-county-tax-assessor\\": [
              {
                \\"id\\": \\"john-ames\\",
                \\"name\\": \\"John Ames\\",
                \\"partyIds\\": [
                  \\"2\\"
                ]
              }
            ],
            \\"dallas-county-sheriff\\": [
              {
                \\"id\\": \\"chad-prda\\",
                \\"name\\": \\"Chad Prda\\",
                \\"partyIds\\": [
                  \\"3\\"
                ]
              }
            ]
          },
          \\"marks\\": [
            {
              \\"type\\": \\"candidate\\",
              \\"contest\\": \\"us-senate\\",
              \\"option\\": \\"tim-smith\\",
              \\"score\\": 0.8765432098765432,
              \\"bounds\\": {
                \\"x\\": 470,
                \\"y\\": 411,
                \\"width\\": 33,
                \\"height\\": 22
              },
              \\"target\\": {
                \\"bounds\\": {
                  \\"x\\": 470,
                  \\"y\\": 411,
                  \\"width\\": 33,
                  \\"height\\": 22
                },
                \\"inner\\": {
                  \\"x\\": 472,
                  \\"y\\": 413,
                  \\"width\\": 29,
                  \\"height\\": 18
                }
              }
            },
            {
              \\"type\\": \\"candidate\\",
              \\"contest\\": \\"us-senate\\",
              \\"option\\": \\"arjun-srinivasan\\",
              \\"score\\": 0.0024630541871921183,
              \\"bounds\\": {
                \\"x\\": 470,
                \\"y\\": 489,
                \\"width\\": 33,
                \\"height\\": 22
              },
              \\"target\\": {
                \\"bounds\\": {
                  \\"x\\": 470,
                  \\"y\\": 489,
                  \\"width\\": 33,
                  \\"height\\": 22
                },
                \\"inner\\": {
                  \\"x\\": 472,
                  \\"y\\": 491,
                  \\"width\\": 29,
                  \\"height\\": 18
                }
              }
            },
            {
              \\"type\\": \\"candidate\\",
              \\"contest\\": \\"us-senate\\",
              \\"option\\": \\"ricardo-turullols-bonilla\\",
              \\"score\\": 0.007407407407407408,
              \\"bounds\\": {
                \\"x\\": 470,
                \\"y\\": 567,
                \\"width\\": 33,
                \\"height\\": 22
              },
              \\"target\\": {
                \\"bounds\\": {
                  \\"x\\": 470,
                  \\"y\\": 567,
                  \\"width\\": 33,
                  \\"height\\": 22
                },
                \\"inner\\": {
                  \\"x\\": 472,
                  \\"y\\": 569,
                  \\"width\\": 29,
                  \\"height\\": 18
                }
              }
            },
            {
              \\"type\\": \\"candidate\\",
              \\"contest\\": \\"us-house-district-30\\",
              \\"option\\": \\"eddie-bernice-johnson\\",
              \\"score\\": 0.7832512315270936,
              \\"bounds\\": {
                \\"x\\": 470,
                \\"y\\": 831,
                \\"width\\": 33,
                \\"height\\": 22
              },
              \\"target\\": {
                \\"bounds\\": {
                  \\"x\\": 470,
                  \\"y\\": 831,
                  \\"width\\": 33,
                  \\"height\\": 22
                },
                \\"inner\\": {
                  \\"x\\": 472,
                  \\"y\\": 833,
                  \\"width\\": 29,
                  \\"height\\": 18
                }
              }
            },
            {
              \\"type\\": \\"candidate\\",
              \\"contest\\": \\"us-house-district-30\\",
              \\"option\\": \\"tre-pennie\\",
              \\"score\\": 0.0024449877750611247,
              \\"bounds\\": {
                \\"x\\": 470,
                \\"y\\": 909,
                \\"width\\": 33,
                \\"height\\": 22
              },
              \\"target\\": {
                \\"bounds\\": {
                  \\"x\\": 470,
                  \\"y\\": 909,
                  \\"width\\": 33,
                  \\"height\\": 22
                },
                \\"inner\\": {
                  \\"x\\": 472,
                  \\"y\\": 911,
                  \\"width\\": 29,
                  \\"height\\": 19
                }
              }
            },
            {
              \\"type\\": \\"candidate\\",
              \\"contest\\": \\"texas-sc-judge-place-6\\",
              \\"option\\": \\"jane-bland\\",
              \\"score\\": 0.7524509803921569,
              \\"bounds\\": {
                \\"x\\": 470,
                \\"y\\": 1173,
                \\"width\\": 33,
                \\"height\\": 22
              },
              \\"target\\": {
                \\"bounds\\": {
                  \\"x\\": 470,
                  \\"y\\": 1173,
                  \\"width\\": 33,
                  \\"height\\": 22
                },
                \\"inner\\": {
                  \\"x\\": 472,
                  \\"y\\": 1175,
                  \\"width\\": 29,
                  \\"height\\": 19
                }
              }
            },
            {
              \\"type\\": \\"candidate\\",
              \\"contest\\": \\"texas-sc-judge-place-6\\",
              \\"option\\": \\"kathy-cheng\\",
              \\"score\\": 0.004889975550122249,
              \\"bounds\\": {
                \\"x\\": 470,
                \\"y\\": 1251,
                \\"width\\": 33,
                \\"height\\": 23
              },
              \\"target\\": {
                \\"bounds\\": {
                  \\"x\\": 470,
                  \\"y\\": 1251,
                  \\"width\\": 33,
                  \\"height\\": 23
                },
                \\"inner\\": {
                  \\"x\\": 472,
                  \\"y\\": 1253,
                  \\"width\\": 29,
                  \\"height\\": 19
                }
              }
            },
            {
              \\"type\\": \\"candidate\\",
              \\"contest\\": \\"texas-house-district-111\\",
              \\"option\\": \\"write-in-0\\",
              \\"score\\": 0.8029556650246306,
              \\"bounds\\": {
                \\"x\\": 872,
                \\"y\\": 320,
                \\"width\\": 33,
                \\"height\\": 22
              },
              \\"target\\": {
                \\"bounds\\": {
                  \\"x\\": 872,
                  \\"y\\": 320,
                  \\"width\\": 33,
                  \\"height\\": 22
                },
                \\"inner\\": {
                  \\"x\\": 874,
                  \\"y\\": 322,
                  \\"width\\": 29,
                  \\"height\\": 19
                }
              }
            },
            {
              \\"type\\": \\"candidate\\",
              \\"contest\\": \\"dallas-county-tax-assessor\\",
              \\"option\\": \\"john-ames\\",
              \\"score\\": 0.8866995073891626,
              \\"bounds\\": {
                \\"x\\": 872,
                \\"y\\": 556,
                \\"width\\": 33,
                \\"height\\": 22
              },
              \\"target\\": {
                \\"bounds\\": {
                  \\"x\\": 872,
                  \\"y\\": 556,
                  \\"width\\": 33,
                  \\"height\\": 22
                },
                \\"inner\\": {
                  \\"x\\": 874,
                  \\"y\\": 558,
                  \\"width\\": 29,
                  \\"height\\": 18
                }
              }
            },
            {
              \\"type\\": \\"candidate\\",
              \\"contest\\": \\"dallas-county-sheriff\\",
              \\"option\\": \\"chad-prda\\",
              \\"score\\": 0.7,
              \\"bounds\\": {
                \\"x\\": 872,
                \\"y\\": 916,
                \\"width\\": 33,
                \\"height\\": 22
              },
              \\"target\\": {
                \\"bounds\\": {
                  \\"x\\": 872,
                  \\"y\\": 916,
                  \\"width\\": 33,
                  \\"height\\": 22
                },
                \\"inner\\": {
                  \\"x\\": 874,
                  \\"y\\": 917,
                  \\"width\\": 29,
                  \\"height\\": 19
                }
              }
            }
          ]
        }
      }
    ]"
  `);
});
