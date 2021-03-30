import MemoryStream from 'memorystream'
import { relative } from 'path'
import { fileSync } from 'tmp'
import * as fs from 'fs'
import { parseGlobalOptions } from '..'
import { adjacentMetadataFile } from '../../../test/fixtures'
import {
  blankPage1,
  blankPage2,
  election,
  electionDefinition,
  filledInPage1,
  filledInPage2,
} from '../../../test/fixtures/election-4e31cb17d8-ballot-style-77-precinct-oaklawn-branch-library'
import { OutputFormat, parseOptions, printHelp, run } from './interpret'

const electionPath = fileSync().name
fs.writeFileSync(electionPath, electionDefinition.electionData, 'utf-8')

test('parse options: --election', async () => {
  for (const electionFlag of ['--election', '-e']) {
    expect(
      await parseOptions(
        parseGlobalOptions([
          'node',
          'hmpb-interpreter',
          'interpret',
          electionFlag,
          electionPath,
        ])
      )
    ).toEqual(
      expect.objectContaining({
        election,
      })
    )
  }
})

test('parse options: --min-mark-score', async () => {
  for (const minMarkScoreFlag of ['--min-mark-score', '-m']) {
    expect(
      await parseOptions(
        parseGlobalOptions([
          'node',
          'hmpb-interpreter',
          'interpret',
          '--election',
          electionPath,
          minMarkScoreFlag,
          '0.9',
        ])
      )
    ).toEqual(
      expect.objectContaining({
        markScoreVoteThreshold: 0.9,
      })
    )

    expect(
      await parseOptions(
        parseGlobalOptions([
          'node',
          'hmpb-interpreter',
          'interpret',
          '--election',
          electionPath,
          minMarkScoreFlag,
          '42%',
        ])
      )
    ).toEqual(
      expect.objectContaining({
        markScoreVoteThreshold: 0.42,
      })
    )
  }

  await expect(
    parseOptions(
      parseGlobalOptions([
        'node',
        'hmpb-interpreter',
        'interpret',
        '--election',
        electionPath,
        '-m',
        'I am not a number',
      ])
    )
  ).rejects.toThrowError('Invalid minimum mark score: I am not a number')
})

test('parse options: --test-mode', async () => {
  for (const testModeFlag of ['--test-mode', '-T', '--no-test-mode']) {
    expect(
      await parseOptions(
        parseGlobalOptions([
          'node',
          'hmpb-interpreter',
          'interpret',
          '--election',
          electionPath,
          testModeFlag,
        ])
      )
    ).toEqual(
      expect.objectContaining({
        testMode: testModeFlag !== '--no-test-mode',
      })
    )
  }
})

test('parse options: --format', async () => {
  expect(
    await parseOptions(
      parseGlobalOptions([
        'node',
        'hmpb-interpreter',
        'interpret',
        '--election',
        electionPath,
      ])
    )
  ).toEqual(
    expect.objectContaining({
      format: OutputFormat.Table,
    })
  )

  for (const formatFlag of ['--format', '-f']) {
    expect(
      await parseOptions(
        parseGlobalOptions([
          'node',
          'hmpb-interpreter',
          'interpret',
          '--election',
          electionPath,
          formatFlag,
          'JSON',
        ])
      )
    ).toEqual(
      expect.objectContaining({
        format: OutputFormat.JSON,
      })
    )
  }

  await expect(
    parseOptions(
      parseGlobalOptions([
        'node',
        'hmpb-interpreter',
        'interpret',
        '--election',
        electionPath,
        '-f',
        'yaml',
      ])
    )
  ).rejects.toThrowError('Unknown output format: yaml')
})

test('parse options requires election', async () => {
  await expect(
    parseOptions(parseGlobalOptions(['node', 'hmpb-interpreter', 'interpret']))
  ).rejects.toThrowError(`Required option 'election' is missing.`)

  await expect(
    parseOptions(
      parseGlobalOptions(['node', 'hmpb-interpreter', 'interpret', '-e'])
    )
  ).rejects.toThrowError(
    `Expected election definition file after -e, but got nothing.`
  )

  await expect(
    parseOptions(
      parseGlobalOptions(['node', 'hmpb-interpreter', 'interpret', '-e', '-t'])
    )
  ).rejects.toThrowError(
    `Expected election definition file after -e, but got -t.`
  )
})

test('invalid options', async () => {
  await expect(
    parseOptions(
      parseGlobalOptions(['node', 'hmpb-interpreter', 'interpret', '--wrong'])
    )
  ).rejects.toThrowError('Unknown option: --wrong')
})

test('template and ballot flags', async () => {
  const options = await parseOptions(
    parseGlobalOptions([
      'node',
      'hmpb-interpreter',
      'interpret',
      '-e',
      electionPath,
      '-t',
      'template.png',
      '-b',
      'ballot.png',
    ])
  )
  expect(options.ballotInputs.map((bi) => bi.id())).toEqual(['ballot.png'])
  expect(options.templateInputs.map((ti) => ti.id())).toEqual(['template.png'])

  await expect(
    parseOptions(
      parseGlobalOptions([
        'node',
        'hmpb-interpreter',
        'interpret',
        '-e',
        electionPath,
        '-t',
        '-b',
        'ballot.png',
      ])
    )
  ).rejects.toThrowError('Expected template file after -t, but got -b')

  await expect(
    parseOptions(
      parseGlobalOptions([
        'node',
        'hmpb-interpreter',
        'interpret',
        '-e',
        electionPath,
        '-t',
      ])
    )
  ).rejects.toThrowError('Expected template file after -t, but got nothing')

  await expect(
    parseOptions(
      parseGlobalOptions([
        'node',
        'hmpb-interpreter',
        'interpret',
        '-e',
        electionPath,
        '-t',
        'template.png',
        '-b',
      ])
    )
  ).rejects.toThrowError('Expected ballot file after -b, but got nothing')
})

test('file paths without explicit template/ballot flags', async () => {
  const parsed = await parseOptions(
    parseGlobalOptions([
      'node',
      'hmpb-interpreter',
      'interpret',
      '-e',
      electionPath,
      'img01.png',
      'img02.png',
    ])
  )
  expect(parsed.autoInputs.map((ai) => ai.id())).toEqual([
    'img01.png',
    'img02.png',
  ])
})

test('help', async () => {
  const stdout = new MemoryStream()

  printHelp('hmpb-interpreter', stdout)
  expect(Buffer.from(stdout.read()).toString('utf-8')).toMatchInlineSnapshot(`
    "hmpb-interpreter interpret -e JSON IMG1 [IMG2 …]

    Examples

    # Interpret ballots based on a single template.
    hmpb-interpreter interpret -e election.json -t template.png ballot*.png

    # Interpret test mode ballots.
    hmpb-interpreter interpret -e election.json -T -t template.png ballot*.png

    # Interpret ballots to JSON.
    hmpb-interpreter interpret -e election.json -f json template*.png ballot*.png

    # Specify image metadata (file:metdata-file).
    hmpb-interpreter interpret -e election.json template1.png:template1-metadata.json template2.png:template2-metdata.json ballot1.png:ballot1-metadata.json

    # Set an explicit minimum mark score (0-1).
    hmpb-interpreter interpret -e election.json -m 0.5 template*.png ballot*.png

    # Automatically process images as templates until all pages are found.
    hmpb-interpreter interpret -e election.json image*.png
    "
  `)
})

test('run interpret', async () => {
  const stdin = new MemoryStream()
  const stdout = new MemoryStream()

  expect(
    await run(
      await parseOptions(
        parseGlobalOptions([
          'node',
          'hmpb-interpreter',
          'interpret',
          '-e',
          electionPath,
          '-t',
          blankPage1.filePath(),
          '-t',
          blankPage2.filePath(),
          '-b',
          relative(process.cwd(), filledInPage1.filePath()),
          '-b',
          relative(process.cwd(), filledInPage2.filePath()),
        ])
      ),
      stdin,
      stdout
    )
  ).toEqual(0)

  expect(Buffer.from(stdout.read()).toString('utf-8')).toMatchInlineSnapshot(`
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
  `)
})

test('run interpret with auto inputs', async () => {
  const stdin = new MemoryStream()
  const stdout = new MemoryStream()

  const templatePath = blankPage1.filePath()
  const ballotPath = relative(process.cwd(), filledInPage1.filePath())

  expect(
    await run(
      await parseOptions(
        parseGlobalOptions([
          'node',
          'hmpb-interpreter',
          'interpret',
          '-e',
          electionPath,
          `${templatePath}:${adjacentMetadataFile(templatePath)}`,
          `${ballotPath}:${adjacentMetadataFile(ballotPath)}`,
        ])
      ),
      stdin,
      stdout
    )
  ).toEqual(0)

  expect(Buffer.from(stdout.read()).toString('utf-8')).toMatchInlineSnapshot(`
    "╔═══════════════════════════════════════════════════════╤════════════════════════════════════════════════════════════════════════════════════════════════════╗
    ║ Contest                                               │ test/fixtures/election-4e31cb17d8-ballot-style-77-precinct-oaklawn-branch-library/filled-in-p1.jpg ║
    ╟───────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────╢
    ║ Member, U.S. Senate                                   │ Tim Smith                                                                                          ║
    ╟───────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────╢
    ║ Member, U.S. House, District 30                       │ Eddie Bernice Johnson                                                                              ║
    ╟───────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────╢
    ║ Judge, Texas Supreme Court, Place 6                   │ Jane Bland                                                                                         ║
    ╟───────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────╢
    ║ Member, Texas House of Representatives, District 111  │ Write-In                                                                                           ║
    ╟───────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────╢
    ║ Dallas County Tax Assessor-Collector                  │ John Ames                                                                                          ║
    ╟───────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────╢
    ║ Dallas County Sheriff                                 │ Chad Prda                                                                                          ║
    ╟───────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────╢
    ║ Member, Dallas County Commissioners Court, Precinct 3 │                                                                                                    ║
    ╟───────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────╢
    ║ Retain Robert Demergue as Chief Justice?              │                                                                                                    ║
    ╟───────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────╢
    ║ Proposition R: Countywide Recycling Program           │                                                                                                    ║
    ╟───────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────╢
    ║ City Council                                          │                                                                                                    ║
    ╟───────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────╢
    ║ Mayor                                                 │                                                                                                    ║
    ╚═══════════════════════════════════════════════════════╧════════════════════════════════════════════════════════════════════════════════════════════════════╝
    "
  `)
})

test('run interpret with JSON output', async () => {
  const stdin = new MemoryStream()
  const stdout = new MemoryStream()

  expect(
    await run(
      await parseOptions(
        parseGlobalOptions([
          'node',
          'hmpb-interpreter',
          'interpret',
          '-e',
          electionPath,
          '-t',
          blankPage1.filePath(),
          '-b',
          relative(process.cwd(), filledInPage1.filePath()),
          '-f',
          'JSON',
        ])
      ),
      stdin,
      stdout
    )
  ).toEqual(0)

  expect(Buffer.from(stdout.read()).toString('utf-8')).toMatchInlineSnapshot(`
    "[
      {
        \\"input\\": \\"test/fixtures/election-4e31cb17d8-ballot-style-77-precinct-oaklawn-branch-library/filled-in-p1.jpg\\",
        \\"interpreted\\": {
          \\"metadata\\": {
            \\"electionHash\\": \\"\\",
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
                \\"partyId\\": \\"6\\"
              }
            ],
            \\"us-house-district-30\\": [
              {
                \\"id\\": \\"eddie-bernice-johnson\\",
                \\"name\\": \\"Eddie Bernice Johnson\\",
                \\"partyId\\": \\"2\\"
              }
            ],
            \\"texas-sc-judge-place-6\\": [
              {
                \\"id\\": \\"jane-bland\\",
                \\"name\\": \\"Jane Bland\\",
                \\"partyId\\": \\"3\\"
              }
            ],
            \\"texas-house-district-111\\": [
              {
                \\"id\\": \\"__write-in-0\\",
                \\"name\\": \\"Write-In\\",
                \\"isWriteIn\\": true
              }
            ],
            \\"dallas-county-tax-assessor\\": [
              {
                \\"id\\": \\"john-ames\\",
                \\"name\\": \\"John Ames\\",
                \\"partyId\\": \\"2\\"
              }
            ],
            \\"dallas-county-sheriff\\": [
              {
                \\"id\\": \\"chad-prda\\",
                \\"name\\": \\"Chad Prda\\",
                \\"partyId\\": \\"3\\"
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
              \\"option\\": \\"__write-in-0\\",
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
  `)
})
