import {
  BallotPaperSize,
  BallotType,
  District,
  DistrictId,
  Election,
} from '@votingworks/types';
import { electionGeneral } from '@votingworks/fixtures';
import {
  DEFAULT_LAYOUT_OPTIONS,
  gridForPaper,
  layOutAllBallotStyles,
  layOutInColumns,
} from './layout';

test('layoutInColumns', () => {
  const a1 = { id: 'a', height: 1 } as const;
  const b1 = { id: 'b', height: 1 } as const;
  const c2 = { id: 'c', height: 2 } as const;
  const d2 = { id: 'd', height: 2 } as const;

  expect(
    layOutInColumns({
      elements: [],
      numColumns: 1,
      maxColumnHeight: 1,
    })
  ).toEqual({
    columns: [[]],
    height: 0,
    leftoverElements: [],
  });

  expect(
    layOutInColumns({
      elements: [a1],
      numColumns: 1,
      maxColumnHeight: 1,
    })
  ).toEqual({
    columns: [[a1]],
    height: 1,
    leftoverElements: [],
  });

  expect(
    layOutInColumns({
      elements: [a1],
      numColumns: 2,
      maxColumnHeight: 1,
    })
  ).toEqual({
    columns: [[a1], []],
    height: 1,
    leftoverElements: [],
  });

  expect(
    layOutInColumns({
      elements: [a1, b1],
      numColumns: 1,
      maxColumnHeight: 1,
    })
  ).toEqual({
    columns: [[a1]],
    height: 1,
    leftoverElements: [b1],
  });

  expect(
    layOutInColumns({
      elements: [a1, b1],
      numColumns: 2,
      maxColumnHeight: 1,
    })
  ).toEqual({
    columns: [[a1], [b1]],
    height: 1,
    leftoverElements: [],
  });

  expect(
    layOutInColumns({
      elements: [a1, b1],
      numColumns: 1,
      maxColumnHeight: 2,
    })
  ).toEqual({
    columns: [[a1, b1]],
    height: 2,
    leftoverElements: [],
  });

  expect(
    layOutInColumns({
      elements: [a1, b1],
      numColumns: 2,
      maxColumnHeight: 2,
    })
  ).toEqual({
    columns: [[a1], [b1]],
    height: 1,
    leftoverElements: [],
  });

  expect(
    layOutInColumns({
      elements: [a1, b1],
      numColumns: 3,
      maxColumnHeight: 1,
    })
  ).toEqual({
    columns: [[a1], [b1], []],
    height: 1,
    leftoverElements: [],
  });

  expect(
    layOutInColumns({
      elements: [a1, b1, c2],
      numColumns: 1,
      maxColumnHeight: 1,
    })
  ).toEqual({
    columns: [[a1]],
    height: 1,
    leftoverElements: [b1, c2],
  });

  expect(
    layOutInColumns({
      elements: [a1, b1, c2],
      numColumns: 1,
      maxColumnHeight: 2,
    })
  ).toEqual({
    columns: [[a1, b1]],
    height: 2,
    leftoverElements: [c2],
  });

  expect(
    layOutInColumns({
      elements: [a1, b1, c2],
      numColumns: 2,
      maxColumnHeight: 1,
    })
  ).toEqual({
    columns: [[a1], [b1]],
    height: 1,
    leftoverElements: [c2],
  });

  expect(
    layOutInColumns({
      elements: [a1, b1, c2],
      numColumns: 2,
      maxColumnHeight: 2,
    })
  ).toEqual({
    columns: [[a1, b1], [c2]],
    height: 2,
    leftoverElements: [],
  });

  expect(
    layOutInColumns({
      elements: [a1, b1, c2],
      numColumns: 3,
      maxColumnHeight: 1,
    })
  ).toEqual({
    columns: [[a1], [b1], []],
    height: 1,
    leftoverElements: [c2],
  });

  expect(
    layOutInColumns({
      elements: [a1, b1, c2],
      numColumns: 3,
      maxColumnHeight: 2,
    })
  ).toEqual({
    columns: [[a1], [b1], [c2]],
    height: 2,
    leftoverElements: [],
  });

  expect(
    layOutInColumns({
      elements: [c2, a1, b1, d2],
      maxColumnHeight: 2,
      numColumns: 3,
    })
  ).toEqual({
    columns: [[c2], [a1, b1], [d2]],
    height: 2,
    leftoverElements: [],
  });
});

test('gridForPaper', () => {
  // These values are hardcoded in the interpreter, so they should not change.
  expect(gridForPaper(BallotPaperSize.Letter)).toEqual({
    rows: 41,
    columns: 34,
  });
  expect(gridForPaper(BallotPaperSize.Legal)).toEqual({
    rows: 53,
    columns: 34,
  });
});

test('NH school district election special case', () => {
  const districts: District[] = [
    {
      id: 'district-1' as DistrictId,
      name: 'A Town District',
    },
    {
      id: 'district-2' as DistrictId,
      name: 'A School District',
    },
  ];
  const precinctIds = electionGeneral.precincts
    .slice(0, 1)
    .map((precinct) => precinct.id);
  const election: Election = {
    ...electionGeneral,
    title: 'Annual Town Election',
    districts,
    ballotStyles: [
      {
        id: '1',
        precincts: precinctIds,
        districts: ['district-1'] as DistrictId[],
      },
      {
        id: '2',
        precincts: precinctIds,
        districts: ['district-2'] as DistrictId[],
      },
      {
        id: '3',
        precincts: precinctIds,
        districts: ['district-1', 'district-2'] as DistrictId[],
      },
    ],
  };
  const { ballots } = layOutAllBallotStyles({
    election,
    ballotMode: 'test',
    ballotType: BallotType.Precinct,
    layoutOptions: DEFAULT_LAYOUT_OPTIONS,
  }).unsafeUnwrap();
  const [townBallotStyle, schoolBallotStyle, combinedBallotStyle] =
    election.ballotStyles;
  const townBallot = ballots.find(
    (ballot) => ballot.gridLayout.ballotStyleId === townBallotStyle.id
  );
  const schoolBallot = ballots.find(
    (ballot) => ballot.gridLayout.ballotStyleId === schoolBallotStyle.id
  );
  const combinedBallot = ballots.find(
    (ballot) => ballot.gridLayout.ballotStyleId === combinedBallotStyle.id
  );
  const expectedSchoolElectionTitle = 'Annual School District Election';
  expect(JSON.stringify(townBallot)).toContain(election.title);
  expect(JSON.stringify(townBallot)).not.toContain(expectedSchoolElectionTitle);
  expect(JSON.stringify(schoolBallot)).toContain(expectedSchoolElectionTitle);
  expect(JSON.stringify(schoolBallot)).not.toContain(election.title);
  expect(JSON.stringify(combinedBallot)).toContain(election.title);
  expect(JSON.stringify(combinedBallot)).not.toContain(
    expectedSchoolElectionTitle
  );
});
