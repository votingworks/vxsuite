import {
  election as electionSample,
  electionData,
  electionWithMsEitherNeither,
} from '../test/election'
import * as t from './election'
import {
  AdminCardData,
  BallotStyles,
  CandidateContest,
  parseElection,
  safeParse,
  safeParseElection,
  safeParseElectionDefinition,
  safeParseJSON,
} from './schema'

test('parseElection throws on error', () => {
  expect(() => parseElection({})).toThrowError()
})

test('parsing fails on an empty object', () => {
  safeParseElection({}).expectErr('empty object should fail')
})

test('parsing JSON.parses a string', () => {
  expect(
    safeParseElection(electionData).expect('expected parsing to succeed')
  ).toEqual(electionSample)
})

test('parsing invalid JSON', () => {
  expect(safeParseElection('{').unwrapErr().message).toEqual(
    'Unexpected end of JSON input'
  )
})

test('parsing JSON without a schema', () => {
  expect(safeParseJSON('{}').unwrap()).toEqual({})
})

test('parsing gives specific errors for nested objects', () => {
  expect(
    safeParseElection({
      ...electionSample,
      contests: [
        ...electionSample.contests.slice(1),
        {
          ...electionSample.contests[0],
          // give title a type it shouldn't have
          title: 42,
        },
      ],
    }).unwrapErr()
  ).toMatchInlineSnapshot(`
    [Error: [
      {
        "code": "invalid_union",
        "unionErrors": [
          {
            "issues": [
              {
                "code": "invalid_type",
                "expected": "string",
                "received": "number",
                "path": [
                  "contests",
                  1,
                  "title"
                ],
                "message": "Expected string, received number"
              }
            ]
          },
          {
            "issues": [
              {
                "code": "invalid_type",
                "expected": "string",
                "received": "number",
                "path": [
                  "contests",
                  1,
                  "title"
                ],
                "message": "Expected string, received number"
              },
              {
                "code": "invalid_type",
                "expected": "yesno",
                "received": "candidate",
                "path": [
                  "contests",
                  1,
                  "type"
                ],
                "message": "Expected yesno, received candidate"
              },
              {
                "code": "invalid_type",
                "expected": "string",
                "received": "undefined",
                "path": [
                  "contests",
                  1,
                  "description"
                ],
                "message": "Required"
              }
            ]
          },
          {
            "issues": [
              {
                "code": "invalid_type",
                "expected": "string",
                "received": "number",
                "path": [
                  "contests",
                  1,
                  "title"
                ],
                "message": "Expected string, received number"
              },
              {
                "code": "invalid_type",
                "expected": "ms-either-neither",
                "received": "candidate",
                "path": [
                  "contests",
                  1,
                  "type"
                ],
                "message": "Expected ms-either-neither, received candidate"
              },
              {
                "code": "invalid_type",
                "expected": "string",
                "received": "undefined",
                "path": [
                  "contests",
                  1,
                  "eitherNeitherContestId"
                ],
                "message": "Required"
              },
              {
                "code": "invalid_type",
                "expected": "string",
                "received": "undefined",
                "path": [
                  "contests",
                  1,
                  "pickOneContestId"
                ],
                "message": "Required"
              },
              {
                "code": "invalid_type",
                "expected": "string",
                "received": "undefined",
                "path": [
                  "contests",
                  1,
                  "description"
                ],
                "message": "Required"
              },
              {
                "code": "invalid_type",
                "expected": "string",
                "received": "undefined",
                "path": [
                  "contests",
                  1,
                  "eitherNeitherLabel"
                ],
                "message": "Required"
              },
              {
                "code": "invalid_type",
                "expected": "string",
                "received": "undefined",
                "path": [
                  "contests",
                  1,
                  "pickOneLabel"
                ],
                "message": "Required"
              },
              {
                "code": "invalid_type",
                "expected": "object",
                "received": "undefined",
                "path": [
                  "contests",
                  1,
                  "eitherOption"
                ],
                "message": "Required"
              },
              {
                "code": "invalid_type",
                "expected": "object",
                "received": "undefined",
                "path": [
                  "contests",
                  1,
                  "neitherOption"
                ],
                "message": "Required"
              },
              {
                "code": "invalid_type",
                "expected": "object",
                "received": "undefined",
                "path": [
                  "contests",
                  1,
                  "firstOption"
                ],
                "message": "Required"
              },
              {
                "code": "invalid_type",
                "expected": "object",
                "received": "undefined",
                "path": [
                  "contests",
                  1,
                  "secondOption"
                ],
                "message": "Required"
              }
            ]
          }
        ],
        "path": [
          "contests",
          1
        ],
        "message": "Invalid input"
      }
    ]]
  `)
})

test('ensures dates are ISO 8601-formatted', () => {
  expect(
    safeParseElection({
      ...electionSample,
      date: 'not ISO',
    }).unwrapErr()
  ).toMatchInlineSnapshot(`
    [Error: [
      {
        "code": "custom",
        "message": "dates must be in ISO8601 format",
        "path": [
          "date"
        ]
      }
    ]]
  `)
})

test('parsing a valid election object succeeds', () => {
  const parsed = safeParseElection(electionSample as unknown).unwrap()

  // This check is here to prove TS inferred that `parsed` is an `Election`.
  expect(parsed.title).toEqual(electionSample.title)

  // Check the whole thing
  expect(parsed).toEqual(electionSample)
})

test('parsing a valid election with ms-either-neither succeeds', () => {
  const parsed = safeParseElection(
    electionWithMsEitherNeither as unknown
  ).unwrap()

  // This check is here to prove TS inferred that `parsed` is an `Election`.
  expect(parsed.title).toEqual(electionWithMsEitherNeither.title)

  // Check the whole thing
  expect(parsed).toEqual(electionWithMsEitherNeither)
})

test('parsing a valid election', () => {
  expect(safeParseElection(electionSample).unwrap()).toEqual(electionSample)
})

test('contest IDs cannot start with an underscore', () => {
  expect(
    safeParse(CandidateContest, {
      ...electionSample.contests[0],
      id: '_president',
    }).unwrapErr()
  ).toMatchInlineSnapshot(`
    [Error: [
      {
        "code": "custom",
        "message": "IDs may not start with an underscore",
        "path": [
          "id"
        ]
      }
    ]]
  `)
})

test('allows valid mark thresholds', () => {
  safeParseElection({
    ...electionSample,
    markThresholds: { definite: 0.2, marginal: 0.2 },
  }).unwrap()

  safeParseElection({
    ...electionSample,
    markThresholds: { definite: 0.2, marginal: 0.1 },
  }).unwrap()
})

test('disallows invalid mark thresholds', () => {
  expect(
    safeParseElection({
      ...electionSample,
      markThresholds: { definite: 0.2, marginal: 0.3 },
    }).unwrapErr()
  ).toMatchInlineSnapshot(`
    [Error: [
      {
        "code": "custom",
        "message": "marginal mark threshold must be less than or equal to definite mark threshold",
        "path": [
          "markThresholds"
        ]
      }
    ]]
  `)

  expect(
    safeParseElection({
      ...electionSample,
      markThresholds: { marginal: 0.3 },
    }).unwrapErr()
  ).toMatchInlineSnapshot(`
    [Error: [
      {
        "code": "invalid_type",
        "expected": "number",
        "received": "undefined",
        "path": [
          "markThresholds",
          "definite"
        ],
        "message": "Required"
      }
    ]]
  `)

  expect(
    safeParseElection({
      ...electionSample,
      markThresholds: { definite: 1.2, marginal: 0.3 },
    }).unwrapErr()
  ).toMatchInlineSnapshot(`
    [Error: [
      {
        "code": "too_big",
        "maximum": 1,
        "type": "number",
        "inclusive": true,
        "message": "Value should be less than or equal to 1",
        "path": [
          "markThresholds",
          "definite"
        ]
      }
    ]]
  `)
})

test('allows valid adjudication reasons', () => {
  safeParseElection({
    ...electionSample,
    adjudicationReasons: [],
  }).unwrap()

  safeParseElection({
    ...electionSample,
    adjudicationReasons: [
      t.AdjudicationReason.MarginalMark,
      t.AdjudicationReason.UninterpretableBallot,
    ],
  }).unwrap()
})

test('disallows invalid adjudication reasons', () => {
  expect(
    safeParseElection({
      ...electionSample,
      adjudicationReasons: ['abcdefg'],
    }).unwrapErr()
  ).toMatchInlineSnapshot(`
    [Error: [
      {
        "code": "invalid_enum_value",
        "options": [
          "UninterpretableBallot",
          "MarginalMark",
          "Overvote",
          "Undervote",
          "WriteIn",
          "BlankBallot"
        ],
        "path": [
          "adjudicationReasons",
          0
        ],
        "message": "Invalid enum value. Expected 'UninterpretableBallot' | 'MarginalMark' | 'Overvote' | 'Undervote' | 'WriteIn' | 'BlankBallot', received 'abcdefg'"
      }
    ]]
  `)

  expect(
    safeParseElection({
      ...electionSample,
      adjudicationReasons: 'foooo',
    }).unwrapErr()
  ).toMatchInlineSnapshot(`
    [Error: [
      {
        "code": "invalid_type",
        "expected": "array",
        "received": "string",
        "path": [
          "adjudicationReasons"
        ],
        "message": "Expected array, received string"
      }
    ]]
  `)
})

test('supports ballot layout paper size', () => {
  expect(
    safeParseElection({
      ...electionSample,
      ballotLayout: {
        paperSize: 'A4',
      },
    }).unwrapErr()
  ).toMatchInlineSnapshot(`
    [Error: [
      {
        "code": "invalid_enum_value",
        "options": [
          "letter",
          "legal"
        ],
        "path": [
          "ballotLayout",
          "paperSize"
        ],
        "message": "Invalid enum value. Expected 'letter' | 'legal', received 'A4'"
      }
    ]]
  `)

  expect(
    safeParseElection({
      ...electionSample,
      ballotLayout: 'letter',
    }).unwrapErr()
  ).toMatchInlineSnapshot(`
    [Error: [
      {
        "code": "invalid_type",
        "expected": "object",
        "received": "string",
        "path": [
          "ballotLayout"
        ],
        "message": "Expected object, received string"
      }
    ]]
  `)
})

test('parsing validates district references', () => {
  expect(
    safeParseElection({
      ...electionSample,
      districts: [{ id: 'DIS', name: 'DIS' }],
    }).unwrapErr()
  ).toMatchInlineSnapshot(`
    [Error: [
      {
        "code": "custom",
        "path": [
          "ballotStyles",
          0,
          "districts",
          0
        ],
        "message": "Ballot style '1' has district 'D', but no such district is defined. Districts defined: [DIS]."
      }
    ]]
  `)
})

test('parsing validates precinct references', () => {
  expect(
    safeParseElection({
      ...electionSample,
      precincts: [{ id: 'PRE', name: 'PRE' }],
    }).unwrapErr()
  ).toMatchInlineSnapshot(`
    [Error: [
      {
        "code": "custom",
        "path": [
          "ballotStyles",
          0,
          "precincts",
          0
        ],
        "message": "Ballot style '1' has precinct 'P', but no such precinct is defined. Precincts defined: [PRE]."
      }
    ]]
  `)
})

test('parsing validates contest party references', () => {
  const contest = electionSample.contests.find(
    ({ id }) => id === 'CC'
  ) as t.CandidateContest
  const remainingContests = electionSample.contests.filter((c) => contest !== c)

  expect(
    safeParseElection({
      ...electionSample,
      contests: [
        {
          ...contest,
          partyId: 'not-a-party',
        },
        ...remainingContests,
      ],
    }).unwrapErr()
  ).toMatchInlineSnapshot(`
    [Error: [
      {
        "code": "custom",
        "path": [
          "contests",
          0,
          "partyId"
        ],
        "message": "Contest 'CC' has party 'not-a-party', but no such party is defined. Parties defined: [PARTY]."
      }
    ]]
  `)
})

test('parsing validates candidate party references', () => {
  const contest = electionSample.contests.find(
    ({ id }) => id === 'CC'
  ) as t.CandidateContest
  const remainingContests = electionSample.contests.filter((c) => contest !== c)

  expect(
    safeParseElection({
      ...electionSample,
      contests: [
        {
          ...contest,
          candidates: [
            ...contest.candidates.slice(1),
            {
              ...contest.candidates[0],
              partyId: 'not-a-party',
            },
          ],
        },
        ...remainingContests,
      ],
    }).unwrapErr()
  ).toMatchInlineSnapshot(`
    [Error: [
      {
        "code": "custom",
        "path": [
          "contests",
          0,
          "candidates",
          0,
          "partyId"
        ],
        "message": "Candidate 'C' in contest 'CC' has party 'not-a-party', but no such party is defined. Parties defined: [PARTY]."
      }
    ]]
  `)
})

test('validates uniqueness of district ids', () => {
  expect(
    safeParseElection({
      ...electionSample,
      districts: [...electionSample.districts, ...electionSample.districts],
    }).unwrapErr()
  ).toMatchInlineSnapshot(`
    [Error: [
      {
        "code": "custom",
        "path": [
          "districts",
          1,
          "id"
        ],
        "message": "Duplicate district 'D' found."
      }
    ]]
  `)
})

test('validates uniqueness of ballot style ids', () => {
  expect(
    safeParse(BallotStyles, [
      ...electionSample.ballotStyles,
      ...electionSample.ballotStyles,
    ]).unwrapErr()
  ).toMatchInlineSnapshot(`
    [Error: [
      {
        "code": "custom",
        "path": [
          1,
          "id"
        ],
        "message": "Duplicate ballot style '1' found."
      }
    ]]
  `)
})

test('validates uniqueness of precinct ids', () => {
  expect(
    safeParseElection({
      ...electionSample,
      precincts: [...electionSample.precincts, ...electionSample.precincts],
    }).unwrapErr()
  ).toMatchInlineSnapshot(`
    [Error: [
      {
        "code": "custom",
        "path": [
          "precincts",
          1,
          "id"
        ],
        "message": "Duplicate precinct 'P' found."
      }
    ]]
  `)
})

test('validates uniqueness of contest ids', () => {
  expect(
    safeParseElection({
      ...electionSample,
      contests: [...electionSample.contests, ...electionSample.contests],
    }).unwrapErr()
  ).toMatchInlineSnapshot(`
    [Error: [
      {
        "code": "custom",
        "path": [
          "contests",
          2,
          "id"
        ],
        "message": "Duplicate contest 'CC' found."
      },
      {
        "code": "custom",
        "path": [
          "contests",
          3,
          "id"
        ],
        "message": "Duplicate contest 'YNC' found."
      }
    ]]
  `)
})

test('validates uniqueness of party ids', () => {
  expect(
    safeParseElection({
      ...electionSample,
      parties: [...electionSample.parties, ...electionSample.parties],
    }).unwrapErr()
  ).toMatchInlineSnapshot(`
    [Error: [
      {
        "code": "custom",
        "path": [
          "parties",
          1,
          "id"
        ],
        "message": "Duplicate party 'PARTY' found."
      }
    ]]
  `)
})

test('validates uniqueness of candidate ids within a contest', () => {
  const contest = electionSample.contests[0] as t.CandidateContest

  expect(
    safeParse(CandidateContest, {
      ...contest,
      candidates: [...contest.candidates, ...contest.candidates],
    }).unwrapErr()
  ).toMatchInlineSnapshot(`
    [Error: [
      {
        "code": "custom",
        "path": [
          "candidates",
          1,
          "id"
        ],
        "message": "Duplicate candidate 'C' found."
      }
    ]]
  `)
})

test('validates admin cards have hex-encoded hashes', () => {
  safeParse(AdminCardData, { t: 'admin', h: 'd34db33f' }).unwrap()
  expect(safeParse(AdminCardData, { t: 'admin', h: 'not hex' }).unwrapErr())
    .toMatchInlineSnapshot(`
    [Error: [
      {
        "code": "custom",
        "message": "hex strings must contain only 0-9 and a-f",
        "path": [
          "h"
        ]
      }
    ]]
  `)
})

test('safeParseElectionDefinition computes the election hash for election JSON', () => {
  expect(
    safeParseElectionDefinition(electionData).unwrap().electionHash
  ).toMatchInlineSnapshot(
    `"d5366378eeccc2fd38953e6e34c3069dea0dca4b7a8f5c789f3d108dc1807d3c"`
  )
})

test('safeParseElectionDefinition accepts valid election definition object', () => {
  safeParseElectionDefinition({
    election: electionSample,
    electionData,
    electionHash:
      'd5366378eeccc2fd38953e6e34c3069dea0dca4b7a8f5c789f3d108dc1807d3c',
  }).unwrap()
})

test('safeParseElectionDefinition accepts valid election definition JSON', () => {
  safeParseElectionDefinition(
    JSON.stringify({
      election: electionSample,
      electionData,
      electionHash:
        'd5366378eeccc2fd38953e6e34c3069dea0dca4b7a8f5c789f3d108dc1807d3c',
    })
  ).unwrap()
})

test('safeParseElectionDefinition checks the election hash for election definition', () => {
  expect(
    safeParseElectionDefinition({
      election: electionSample,
      electionData,
      electionHash: 'BAD HASH',
    }).unwrapErr()
  ).toMatchInlineSnapshot(`
    [Error: [
      {
        "code": "custom",
        "path": [
          "electionHash"
        ],
        "message": "Invalid election hash; expected d5366378eeccc2fd38953e6e34c3069dea0dca4b7a8f5c789f3d108dc1807d3c but got BAD HASH"
      }
    ]]
  `)
})

test('safeParseElectionDefinition cannot parse election object', () => {
  safeParseElectionDefinition(electionSample).unwrapErr()
})
