import { expect, test } from 'vitest';
import { err } from '@votingworks/basics';
import { election as electionGeneral, electionData } from '../test/election';
import * as t from '.';
import { safeParse, safeParseJson, unsafeParse } from './generic';

test('parsing fails on an empty object', () => {
  t.safeParseVxfElection({}).unsafeUnwrapErr();
});

test('parsing JSON.parses a string', () => {
  expect(t.safeParseElection(electionData).unsafeUnwrap()).toEqual(
    electionGeneral
  );
});

test('parsing invalid JSON', () => {
  expect(t.safeParseElection('{')).toEqual(err(expect.anything()));
});

test('parsing JSON without a schema', () => {
  expect(safeParseJson('{}').unsafeUnwrap()).toEqual({});
});

test('parsing gives specific errors for nested objects', () => {
  expect(
    t
      .safeParseVxfElection({
        ...electionGeneral,
        contests: [
          ...electionGeneral.contests.slice(1),
          {
            ...electionGeneral.contests[0],
            // give title a type it shouldn't have
            title: 42,
          },
        ],
      })
      .unsafeUnwrapErr()
  ).toMatchSnapshot();
});

test('ensures election date is YYYY-MM-DD', () => {
  expect(
    t
      .safeParseVxfElection({
        ...electionGeneral,
        date: 'not ISO',
      })
      .unsafeUnwrapErr()
  ).toMatchSnapshot();
});

test('parsing a valid election object succeeds', () => {
  const parsed = t.safeParseVxfElection(electionGeneral).unsafeUnwrap();

  // This check is here to prove TS inferred that `parsed` is an `Election`.
  expect(parsed.title).toEqual(electionGeneral.title);

  // Check the whole thing
  expect(parsed).toEqual(electionGeneral);
});

test('parsing a valid election', () => {
  expect(t.safeParseVxfElection(electionGeneral).unsafeUnwrap()).toEqual(
    electionGeneral
  );
});

test('contest IDs cannot start with an underscore', () => {
  expect(
    safeParse(t.CandidateContestSchema, {
      ...electionGeneral.contests[0],
      id: '_president',
    }).unsafeUnwrapErr()
  ).toMatchSnapshot();
});

test('allows valid adjudication reasons', () => {
  t.safeParseVxfElection({
    ...electionGeneral,
    adjudicationReasons: [],
  }).unsafeUnwrap();

  t.safeParseVxfElection({
    ...electionGeneral,
    adjudicationReasons: [t.AdjudicationReason.MarginalMark],
  }).unsafeUnwrap();
});

test('supports ballot layout paper size', () => {
  expect(
    t
      .safeParseVxfElection({
        ...electionGeneral,
        ballotLayout: {
          paperSize: 'A4',
          metadataEncoding: 'qr-code',
        },
      })
      .unsafeUnwrapErr()
  ).toMatchSnapshot();

  expect(
    t
      .safeParseVxfElection({
        ...electionGeneral,
        ballotLayout: 'letter',
      })
      .unsafeUnwrapErr()
  ).toMatchSnapshot();
});

test('parsing validates district references', () => {
  expect(
    t
      .safeParseVxfElection({
        ...electionGeneral,
        districts: [{ id: 'DIS', name: 'DIS' }],
      })
      .unsafeUnwrapErr()
  ).toMatchSnapshot();
});

test('parsing validates precinct references', () => {
  expect(
    t
      .safeParseVxfElection({
        ...electionGeneral,
        precincts: [{ id: 'PRE', name: 'PRE', districtIds: ['DIS'] }],
      })
      .unsafeUnwrapErr()
  ).toMatchSnapshot();
});

test('parsing validates that ballot style districts match precinct districts', () => {
  const districts = [
    { id: 'D', name: 'District' },
    { id: 'D2', name: 'District 2' },
  ];

  function electionWithDistricts(
    ballotStyleDistricts: string[],
    precinctDistrictIds: string[]
  ): unknown {
    return {
      ...electionGeneral,
      districts,
      ballotStyles: [
        { ...electionGeneral.ballotStyles[0], districts: ballotStyleDistricts },
      ],
      precincts: [
        { ...electionGeneral.precincts[0], districtIds: precinctDistrictIds },
      ],
    };
  }

  for (const [ballotStyleDistricts, precinctDistrictIds] of [
    [['D'], ['D', 'D2']],
    [['D', 'D2'], ['D']],
    [['D2'], ['D']],
    [[], ['D']],
  ] as const) {
    const error = t
      .safeParseVxfElection(
        electionWithDistricts(
          [...ballotStyleDistricts],
          [...precinctDistrictIds]
        )
      )
      .unsafeUnwrapErr();
    expect(error.issues).toEqual([
      expect.objectContaining({
        path: ['ballotStyles', 0, 'precincts', 0],
        message:
          "Ballot style '1' districts do not match the districts of precinct 'P'.",
      }),
    ]);
  }

  // The mismatched precinct's index is reported
  const multiPrecinctError = t
    .safeParseVxfElection({
      ...electionGeneral,
      districts,
      ballotStyles: [
        { ...electionGeneral.ballotStyles[0], precincts: ['P', 'P2'] },
      ],
      precincts: [
        ...electionGeneral.precincts,
        { id: 'P2', name: 'PRECINCT 2', districtIds: ['D2'] },
      ],
    })
    .unsafeUnwrapErr();
  expect(multiPrecinctError.issues).toEqual([
    expect.objectContaining({
      path: ['ballotStyles', 0, 'precincts', 1],
      message:
        "Ballot style '1' districts do not match the districts of precinct 'P2'.",
    }),
  ]);

  // Matching districts in a different order pass
  t.safeParseVxfElection(
    electionWithDistricts(['D2', 'D'], ['D', 'D2'])
  ).unsafeUnwrap();
  t.safeParseVxfElection(
    electionWithDistricts(['D', 'D2'], ['D2', 'D'])
  ).unsafeUnwrap();

  // A precinct not assigned to any ballot style is not checked
  t.safeParseVxfElection({
    ...electionGeneral,
    districts,
    precincts: [
      ...electionGeneral.precincts,
      { id: 'P2', name: 'PRECINCT 2', districtIds: ['D2'] },
    ],
  }).unsafeUnwrap();
});

test('parsing validates that ballot style districts match a precinct split', () => {
  function electionWithSplits(ballotStyleDistricts: string[]): unknown {
    return {
      ...electionGeneral,
      districts: [
        { id: 'D', name: 'DISTRICT' },
        { id: 'D2', name: 'DISTRICT 2' },
      ],
      ballotStyles: [
        { ...electionGeneral.ballotStyles[0], districts: ballotStyleDistricts },
      ],
      precincts: [
        {
          id: 'P',
          name: 'PRECINCT',
          splits: [
            { id: 'S1', name: 'Split 1', districtIds: ['D'] },
            { id: 'S2', name: 'Split 2', districtIds: ['D2'] },
          ],
        },
      ],
    };
  }

  // Matching one of the precinct's splits passes
  t.safeParseVxfElection(electionWithSplits(['D'])).unsafeUnwrap();
  t.safeParseVxfElection(electionWithSplits(['D2'])).unsafeUnwrap();

  // Matching no split fails
  const error = t
    .safeParseVxfElection(electionWithSplits(['D', 'D2']))
    .unsafeUnwrapErr();
  expect(error.issues).toEqual([
    expect.objectContaining({
      path: ['ballotStyles', 0, 'precincts', 0],
      message:
        "Ballot style '1' districts do not match the districts of any split of precinct 'P'.",
    }),
  ]);
});

test('parsing validates contest party references', () => {
  const contest = electionGeneral.contests.find(
    ({ id }) => id === 'CC'
  ) as t.CandidateContest;
  const remainingContests = electionGeneral.contests.filter(
    (c) => contest !== c
  );

  expect(
    t
      .safeParseVxfElection({
        ...electionGeneral,
        contests: [
          {
            ...contest,
            partyId: 'not-a-party',
          },

          ...remainingContests,
        ],
      })
      .unsafeUnwrapErr()
  ).toMatchSnapshot();
});

test('parsing validates candidate party references', () => {
  const contest = electionGeneral.contests.find(
    ({ id }) => id === 'CC'
  ) as t.CandidateContest;
  const remainingContests = electionGeneral.contests.filter(
    (c) => contest !== c
  );

  expect(
    t
      .safeParseVxfElection({
        ...electionGeneral,
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
  ).toMatchSnapshot();
});

test('validates uniqueness of district ids', () => {
  expect(
    t
      .safeParseVxfElection({
        ...electionGeneral,
        districts: [...electionGeneral.districts, ...electionGeneral.districts],
      })
      .unsafeUnwrapErr()
  ).toMatchSnapshot();
});

test('validates uniqueness of ballot style ids', () => {
  expect(
    safeParse(t.BallotStylesSchema, [
      ...electionGeneral.ballotStyles,
      ...electionGeneral.ballotStyles,
    ]).unsafeUnwrapErr()
  ).toMatchSnapshot();
});

test('validates uniqueness of precinct ids', () => {
  expect(
    t
      .safeParseVxfElection({
        ...electionGeneral,
        precincts: [...electionGeneral.precincts, ...electionGeneral.precincts],
      })
      .unsafeUnwrapErr()
  ).toMatchSnapshot();
});

test('validates uniqueness of contest ids', () => {
  expect(
    t
      .safeParseVxfElection({
        ...electionGeneral,
        contests: [...electionGeneral.contests, ...electionGeneral.contests],
      })
      .unsafeUnwrapErr()
  ).toMatchSnapshot();
});

test('validates uniqueness of party ids', () => {
  expect(
    t
      .safeParseVxfElection({
        ...electionGeneral,
        parties: [...electionGeneral.parties, ...electionGeneral.parties],
      })
      .unsafeUnwrapErr()
  ).toMatchSnapshot();
});

test('validates uniqueness of candidate ids within a contest', () => {
  const contest = electionGeneral.contests[0] as t.CandidateContest;

  expect(
    safeParse(t.CandidateContestSchema, {
      ...contest,
      candidates: [...contest.candidates, ...contest.candidates],
    }).unsafeUnwrapErr()
  ).toMatchSnapshot();
});

test('safeParseVxfElectionDefinition computes the ballot hash', () => {
  expect(
    t.safeParseElectionDefinition(electionData).unsafeUnwrap().ballotHash
  ).toMatchInlineSnapshot(
    `"1d28c4614a8a80e7ae10fc2658268bc52710bd91a988947733231684c1ba2df8"`
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
      .issues[0].message
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
      .issues[0].message
  ).toEqual(`Contest 'CC' does not allow write-ins.`);
});

test('a contest must have at least one candidate option if write-ins are not allowed', () => {
  const candidateContest: t.CandidateContest = {
    id: 'CC',
    type: 'candidate',
    title: 'CC',
    districtId: unsafeParse(t.DistrictIdSchema, 'D'),
    allowWriteIns: false,
    seats: 1,
    candidates: [],
  };

  expect(
    safeParse(t.CandidateContestSchema, candidateContest).unsafeUnwrapErr()
      .issues[0].message
  ).toEqual('Contest must have at least one candidate or allow write-ins.');
});

test('a straight-party contest parses', () => {
  const straightPartyContest: t.StraightPartyContest = {
    id: 'SP',
    type: 'straight-party',
    title: 'SP',
    districtId: unsafeParse(t.DistrictIdSchema, 'D'),
    optionIds: ['party-1', 'party-2'],
  };

  expect(
    unsafeParse(t.StraightPartyContestSchema, straightPartyContest)
  ).toEqual(straightPartyContest);
  expect(unsafeParse(t.ContestSchema, straightPartyContest)).toEqual(
    straightPartyContest
  );
  safeParse(t.StraightPartyContestSchema, {
    ...straightPartyContest,
    optionIds: [],
  }).unsafeUnwrapErr();
});
