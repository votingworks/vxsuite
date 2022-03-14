import {
  election as electionSample,
  electionData,
  electionWithMsEitherNeither,
} from '../test/election';
import * as t from './election';
import { safeParse, safeParseJson, unsafeParse } from './generic';

test('parseElection', () => {
  expect(() => t.parseElection({})).toThrowError();
  expect(() => t.parseElection(electionSample)).not.toThrowError();
});

test('parsing fails on an empty object', () => {
  t.safeParseElection({}).unsafeUnwrapErr();
});

test('parsing JSON.parses a string', () => {
  expect(t.safeParseElection(electionData).unsafeUnwrap()).toEqual(
    electionSample
  );
});

test('parsing invalid JSON', () => {
  expect(t.safeParseElection('{').unsafeUnwrapErr().message).toEqual(
    'Unexpected end of JSON input'
  );
});

test('parsing JSON without a schema', () => {
  expect(safeParseJson('{}').unsafeUnwrap()).toEqual({});
});

test('parsing gives specific errors for nested objects', () => {
  expect(
    t
      .safeParseElection({
        ...electionSample,
        contests: [
          ...electionSample.contests.slice(1),
          {
            ...electionSample.contests[0],
            // give title a type it shouldn't have
            title: 42,
          },
        ],
      })
      .unsafeUnwrapErr()
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
  `);
});

test('ensures dates are ISO 8601-formatted', () => {
  expect(
    t
      .safeParseElection({
        ...electionSample,
        date: 'not ISO',
      })
      .unsafeUnwrapErr()
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
  `);
});

test('parsing a valid election object succeeds', () => {
  const parsed = t.safeParseElection(electionSample as unknown).unsafeUnwrap();

  // This check is here to prove TS inferred that `parsed` is an `Election`.
  expect(parsed.title).toEqual(electionSample.title);

  // Check the whole thing
  expect(parsed).toEqual(electionSample);
});

test('parsing a valid election with ms-either-neither succeeds', () => {
  const parsed = t
    .safeParseElection(electionWithMsEitherNeither as unknown)
    .unsafeUnwrap();

  // This check is here to prove TS inferred that `parsed` is an `Election`.
  expect(parsed.title).toEqual(electionWithMsEitherNeither.title);

  // Check the whole thing
  expect(parsed).toEqual(electionWithMsEitherNeither);
});

test('parsing a valid election', () => {
  expect(t.safeParseElection(electionSample).unsafeUnwrap()).toEqual(
    electionSample
  );
});

test('contest IDs cannot start with an underscore', () => {
  expect(
    safeParse(t.CandidateContestSchema, {
      ...electionSample.contests[0],
      id: '_president',
    }).unsafeUnwrapErr()
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
  `);
});

test('allows valid mark thresholds', () => {
  t.safeParseElection({
    ...electionSample,
    markThresholds: { definite: 0.2, marginal: 0.2 },
  }).unsafeUnwrap();

  t.safeParseElection({
    ...electionSample,
    markThresholds: { definite: 0.2, marginal: 0.1 },
  }).unsafeUnwrap();
});

test('disallows invalid mark thresholds', () => {
  expect(
    t
      .safeParseElection({
        ...electionSample,
        markThresholds: { definite: 0.2, marginal: 0.3 },
      })
      .unsafeUnwrapErr()
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
  `);

  expect(
    t
      .safeParseElection({
        ...electionSample,
        markThresholds: { marginal: 0.3 },
      })
      .unsafeUnwrapErr()
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
  `);

  expect(
    t
      .safeParseElection({
        ...electionSample,
        markThresholds: { definite: 1.2, marginal: 0.3 },
      })
      .unsafeUnwrapErr()
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
  `);
});

test('allows valid adjudication reasons', () => {
  t.safeParseElection({
    ...electionSample,
    adjudicationReasons: [],
  }).unsafeUnwrap();

  t.safeParseElection({
    ...electionSample,
    adjudicationReasons: [
      t.AdjudicationReason.MarginalMark,
      t.AdjudicationReason.UninterpretableBallot,
    ],
  }).unsafeUnwrap();
});

test('disallows invalid adjudication reasons', () => {
  expect(
    t
      .safeParseElection({
        ...electionSample,
        adjudicationReasons: ['abcdefg'],
      })
      .unsafeUnwrapErr()
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
          "UnmarkedWriteIn",
          "BlankBallot"
        ],
        "path": [
          "adjudicationReasons",
          0
        ],
        "message": "Invalid enum value. Expected 'UninterpretableBallot' | 'MarginalMark' | 'Overvote' | 'Undervote' | 'WriteIn' | 'UnmarkedWriteIn' | 'BlankBallot', received 'abcdefg'"
      }
    ]]
  `);

  expect(
    t
      .safeParseElection({
        ...electionSample,
        adjudicationReasons: 'foooo',
      })
      .unsafeUnwrapErr()
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
  `);
});

test('supports ballot layout paper size', () => {
  expect(
    t
      .safeParseElection({
        ...electionSample,
        ballotLayout: {
          paperSize: 'A4',
        },
      })
      .unsafeUnwrapErr()
  ).toMatchInlineSnapshot(`
    [Error: [
      {
        "code": "invalid_enum_value",
        "options": [
          "letter",
          "legal",
          "custom8.5x17"
        ],
        "path": [
          "ballotLayout",
          "paperSize"
        ],
        "message": "Invalid enum value. Expected 'letter' | 'legal' | 'custom8.5x17', received 'A4'"
      }
    ]]
  `);

  expect(
    t
      .safeParseElection({
        ...electionSample,
        ballotLayout: 'letter',
      })
      .unsafeUnwrapErr()
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
  `);
});

test('parsing validates district references', () => {
  expect(
    t
      .safeParseElection({
        ...electionSample,
        districts: [{ id: 'DIS', name: 'DIS' }],
      })
      .unsafeUnwrapErr()
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
  `);
});

test('parsing validates precinct references', () => {
  expect(
    t
      .safeParseElection({
        ...electionSample,
        precincts: [{ id: 'PRE', name: 'PRE' }],
      })
      .unsafeUnwrapErr()
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
  `);
});

test('parsing validates contest party references', () => {
  const contest = electionSample.contests.find(
    ({ id }) => id === 'CC'
  ) as t.CandidateContest;
  const remainingContests = electionSample.contests.filter(
    (c) => contest !== c
  );

  expect(
    t
      .safeParseElection({
        ...electionSample,
        contests: [
          {
            ...contest,
            partyId: 'not-a-party',
          },
          ...remainingContests,
        ],
      })
      .unsafeUnwrapErr()
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
  `);
});

test('parsing validates candidate party references', () => {
  const contest = electionSample.contests.find(
    ({ id }) => id === 'CC'
  ) as t.CandidateContest;
  const remainingContests = electionSample.contests.filter(
    (c) => contest !== c
  );

  expect(
    t
      .safeParseElection({
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
      })
      .unsafeUnwrapErr()
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
  `);
});

test('validates uniqueness of district ids', () => {
  expect(
    t
      .safeParseElection({
        ...electionSample,
        districts: [...electionSample.districts, ...electionSample.districts],
      })
      .unsafeUnwrapErr()
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
  `);
});

test('validates uniqueness of ballot style ids', () => {
  expect(
    safeParse(t.BallotStylesSchema, [
      ...electionSample.ballotStyles,
      ...electionSample.ballotStyles,
    ]).unsafeUnwrapErr()
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
  `);
});

test('validates uniqueness of precinct ids', () => {
  expect(
    t
      .safeParseElection({
        ...electionSample,
        precincts: [...electionSample.precincts, ...electionSample.precincts],
      })
      .unsafeUnwrapErr()
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
  `);
});

test('validates uniqueness of contest ids', () => {
  expect(
    t
      .safeParseElection({
        ...electionSample,
        contests: [...electionSample.contests, ...electionSample.contests],
      })
      .unsafeUnwrapErr()
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
  `);
});

test('validates uniqueness of party ids', () => {
  expect(
    t
      .safeParseElection({
        ...electionSample,
        parties: [...electionSample.parties, ...electionSample.parties],
      })
      .unsafeUnwrapErr()
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
  `);
});

test('validates uniqueness of candidate ids within a contest', () => {
  const contest = electionSample.contests[0] as t.CandidateContest;

  expect(
    safeParse(t.CandidateContestSchema, {
      ...contest,
      candidates: [...contest.candidates, ...contest.candidates],
    }).unsafeUnwrapErr()
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
  `);
});

test('validates admin cards have hex-encoded hashes', () => {
  unsafeParse(t.AdminCardDataSchema, {
    t: 'admin',
    h: 'd34db33f',
  });
  expect(
    safeParse(t.AdminCardDataSchema, {
      t: 'admin',
      h: 'not hex',
    }).unsafeUnwrapErr()
  ).toMatchInlineSnapshot(`
    [Error: [
      {
        "code": "custom",
        "message": "Election hashes must be hex strings containing only 0-9 and a-f",
        "path": [
          "h"
        ]
      }
    ]]
  `);
});

test('safeParseElectionDefinition computes the election hash', () => {
  expect(
    t.safeParseElectionDefinition(electionData).unsafeUnwrap().electionHash
  ).toMatchInlineSnapshot(
    `"d5366378eeccc2fd38953e6e34c3069dea0dca4b7a8f5c789f3d108dc1807d3c"`
  );
});

test('safeParseElectionDefinition error result', () => {
  expect(t.safeParseElectionDefinition('').err()).toBeDefined();
});

test('specifying write-in candidates', () => {
  const candidateContest: t.CandidateContest = {
    id: 'CC',
    type: 'candidate',
    title: 'CC',
    section: 'Section',
    districtId: unsafeParse(t.DistrictIdSchema, 'D'),
    allowWriteIns: true,
    seats: 1,
    candidates: [
      {
        id: 'C',
        name: 'C',
      },
      {
        id: '__write-in-0',
        name: 'W',
        isWriteIn: true,
      },
    ],
  };

  unsafeParse(t.CandidateContestSchema, candidateContest);
});

test('specifying all write-in candidates is required if any are specified', () => {
  const candidateContest: t.CandidateContest = {
    id: 'CC',
    type: 'candidate',
    title: 'CC',
    section: 'Section',
    districtId: unsafeParse(t.DistrictIdSchema, 'D'),
    allowWriteIns: true,
    seats: 2,
    candidates: [
      {
        id: 'C',
        name: 'C',
      },
      {
        id: '__write-in-0',
        name: 'W',
        isWriteIn: true,
      },
    ],
  };

  expect(
    safeParse(t.CandidateContestSchema, candidateContest).unsafeUnwrapErr()
      .errors[0].message
  ).toEqual(
    'Contest has 1 write-in candidate(s), but 2 seat(s) are available.'
  );
});

test('no write-in candidates may be specified if write-ins are not allowed', () => {
  const candidateContest: t.CandidateContest = {
    id: 'CC',
    type: 'candidate',
    title: 'CC',
    section: 'Section',
    districtId: unsafeParse(t.DistrictIdSchema, 'D'),
    allowWriteIns: false,
    seats: 1,
    candidates: [
      {
        id: 'C',
        name: 'C',
      },
      {
        id: '__write-in-0',
        name: 'W',
        isWriteIn: true,
      },
    ],
  };

  expect(
    safeParse(t.CandidateContestSchema, candidateContest).unsafeUnwrapErr()
      .errors[0].message
  ).toEqual(`Contest 'CC' does not allow write-ins.`);
});
