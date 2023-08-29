import { election as electionSample, electionData } from '../test/election';
import * as t from '.';
import { safeParse, safeParseJson, unsafeParse } from './generic';

test('parsing fails on an empty object', () => {
  t.safeParseVxfElection({}).unsafeUnwrapErr();
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
      .safeParseVxfElection({
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
    [ZodError: [
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
            ],
            "name": "ZodError"
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
                "code": "invalid_literal",
                "expected": "yesno",
                "path": [
                  "contests",
                  1,
                  "type"
                ],
                "message": "Invalid literal value, expected \\"yesno\\""
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
                "expected": "object",
                "received": "undefined",
                "path": [
                  "contests",
                  1,
                  "yesOption"
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
                  "noOption"
                ],
                "message": "Required"
              }
            ],
            "name": "ZodError"
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
      .safeParseVxfElection({
        ...electionSample,
        date: 'not ISO',
      })
      .unsafeUnwrapErr()
  ).toMatchInlineSnapshot(`
    [ZodError: [
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
  const parsed = t
    .safeParseVxfElection(electionSample as unknown)
    .unsafeUnwrap();

  // This check is here to prove TS inferred that `parsed` is an `Election`.
  expect(parsed.title).toEqual(electionSample.title);

  // Check the whole thing
  expect(parsed).toEqual(electionSample);
});

test('parsing a valid election', () => {
  expect(t.safeParseVxfElection(electionSample).unsafeUnwrap()).toEqual(
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
    [ZodError: [
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

test('allows valid adjudication reasons', () => {
  t.safeParseVxfElection({
    ...electionSample,
    adjudicationReasons: [],
  }).unsafeUnwrap();

  t.safeParseVxfElection({
    ...electionSample,
    adjudicationReasons: [t.AdjudicationReason.MarginalMark],
  }).unsafeUnwrap();
});

test('supports ballot layout paper size', () => {
  expect(
    t
      .safeParseVxfElection({
        ...electionSample,
        ballotLayout: {
          paperSize: 'A4',
          metadataEncoding: 'qr-code',
        },
      })
      .unsafeUnwrapErr()
  ).toMatchInlineSnapshot(`
    [ZodError: [
      {
        "code": "invalid_enum_value",
        "options": [
          "letter",
          "legal",
          "custom-8.5x17",
          "custom-8.5x18",
          "custom-8.5x21",
          "custom-8.5x22"
        ],
        "path": [
          "ballotLayout",
          "paperSize"
        ],
        "message": "Invalid enum value. Expected 'letter' | 'legal' | 'custom-8.5x17' | 'custom-8.5x18' | 'custom-8.5x21' | 'custom-8.5x22'"
      }
    ]]
  `);

  expect(
    t
      .safeParseVxfElection({
        ...electionSample,
        ballotLayout: 'letter',
      })
      .unsafeUnwrapErr()
  ).toMatchInlineSnapshot(`
    [ZodError: [
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
      .safeParseVxfElection({
        ...electionSample,
        districts: [{ id: 'DIS', name: 'DIS' }],
      })
      .unsafeUnwrapErr()
  ).toMatchInlineSnapshot(`
    [ZodError: [
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
      .safeParseVxfElection({
        ...electionSample,
        precincts: [{ id: 'PRE', name: 'PRE' }],
      })
      .unsafeUnwrapErr()
  ).toMatchInlineSnapshot(`
    [ZodError: [
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
      .safeParseVxfElection({
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
    [ZodError: [
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
      .safeParseVxfElection({
        ...electionSample,
        contests: [
          {
            ...contest,
            candidates: [
              ...contest.candidates.slice(1),
              {
                ...contest.candidates[0],
                partyIds: ['not-a-party'],
              },
            ],
          },

          ...remainingContests,
        ],
      })
      .unsafeUnwrapErr()
  ).toMatchInlineSnapshot(`
    [ZodError: [
      {
        "code": "custom",
        "path": [
          "contests",
          0,
          "candidates",
          0,
          "partyIds",
          0
        ],
        "message": "Candidate 'C' in contest 'CC' has party 'not-a-party', but no such party is defined. Parties defined: [PARTY]."
      }
    ]]
  `);
});

test('validates uniqueness of district ids', () => {
  expect(
    t
      .safeParseVxfElection({
        ...electionSample,
        districts: [...electionSample.districts, ...electionSample.districts],
      })
      .unsafeUnwrapErr()
  ).toMatchInlineSnapshot(`
    [ZodError: [
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
    [ZodError: [
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
      .safeParseVxfElection({
        ...electionSample,
        precincts: [...electionSample.precincts, ...electionSample.precincts],
      })
      .unsafeUnwrapErr()
  ).toMatchInlineSnapshot(`
    [ZodError: [
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
      .safeParseVxfElection({
        ...electionSample,
        contests: [...electionSample.contests, ...electionSample.contests],
      })
      .unsafeUnwrapErr()
  ).toMatchInlineSnapshot(`
    [ZodError: [
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
      },
      {
        "code": "custom",
        "path": [
          "contests",
          2,
          "yes/noOption",
          "id"
        ],
        "message": "Duplicate yes/no contest option 'YNC-option-yes' found."
      },
      {
        "code": "custom",
        "path": [
          "contests",
          3,
          "yes/noOption",
          "id"
        ],
        "message": "Duplicate yes/no contest option 'YNC-option-no' found."
      }
    ]]
  `);
});

test('validates uniqueness of party ids', () => {
  expect(
    t
      .safeParseVxfElection({
        ...electionSample,
        parties: [...electionSample.parties, ...electionSample.parties],
      })
      .unsafeUnwrapErr()
  ).toMatchInlineSnapshot(`
    [ZodError: [
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
    [ZodError: [
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

test('safeParseVxfElectionDefinition computes the election hash', () => {
  expect(
    t.safeParseElectionDefinition(electionData).unsafeUnwrap().electionHash
  ).toMatchInlineSnapshot(
    `"1131a54ccaae4fca12d307e72019b98f14b154d168fe8954784802256478759f"`
  );
});

test('safeParseVxfElectionDefinition error result', () => {
  expect(t.safeParseElectionDefinition('').err()).toBeDefined();
});

test('specifying write-in candidates', () => {
  const candidateContest: t.CandidateContest = {
    id: 'CC',
    type: 'candidate',
    title: 'CC',
    districtId: unsafeParse(t.DistrictIdSchema, 'D'),
    allowWriteIns: true,
    seats: 1,
    candidates: [
      {
        id: 'C',
        name: 'C',
      },
      {
        id: 'write-in-0',
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
    districtId: unsafeParse(t.DistrictIdSchema, 'D'),
    allowWriteIns: true,
    seats: 2,
    candidates: [
      {
        id: 'C',
        name: 'C',
      },
      {
        id: 'write-in-0',
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
    districtId: unsafeParse(t.DistrictIdSchema, 'D'),
    allowWriteIns: false,
    seats: 1,
    candidates: [
      {
        id: 'C',
        name: 'C',
      },
      {
        id: 'write-in-0',
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
