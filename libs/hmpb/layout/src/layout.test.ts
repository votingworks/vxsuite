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
  NhCustomContentByBallotStyle,
  gridForPaper,
  layOutAllBallotStyles,
  layOutInColumns,
  measurements,
  textWrap,
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

test('NH custom content', () => {
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
    title: 'Default Election Title',
    districts,
    ballotStyles: [
      {
        id: 'ballot-style-1',
        precincts: precinctIds,
        districts: ['district-1'] as DistrictId[],
      },
      {
        id: 'ballot-style-2',
        precincts: precinctIds,
        districts: ['district-2'] as DistrictId[],
      },
      {
        id: 'ballot-style-3',
        precincts: precinctIds,
        districts: ['district-1', 'district-2'] as DistrictId[],
      },
    ],
  };
  const [townBallotStyle, schoolBallotStyle, combinedBallotStyle] =
    election.ballotStyles;
  const nhCustomContent: NhCustomContentByBallotStyle = {
    [townBallotStyle.id]: {
      electionTitle: 'Annual Town Election',
      clerkSignatureImage: '<svg>town clerk signature image data</svg>',
      clerkSignatureCaption: 'Town Clerk',
    },
    [schoolBallotStyle.id]: {
      electionTitle: 'Annual School District Election',
      clerkSignatureImage:
        '<svg>school district clerk signature image data</svg>',
      clerkSignatureCaption: 'School District Clerk',
    },
  };
  const { ballots } = layOutAllBallotStyles({
    election,
    ballotMode: 'test',
    ballotType: BallotType.Precinct,
    layoutOptions: DEFAULT_LAYOUT_OPTIONS,
    nhCustomContent,
    translatedElectionStrings: {},
  }).unsafeUnwrap();

  const townBallot = JSON.stringify(
    ballots.find(
      (ballot) => ballot.gridLayout.ballotStyleId === townBallotStyle.id
    )
  );
  const townContent = nhCustomContent[townBallotStyle.id];
  expect(townBallot).toContain(townContent.electionTitle);
  expect(townBallot).toContain(townContent.clerkSignatureImage);
  expect(townBallot).toContain(townContent.clerkSignatureCaption);
  expect(townBallot).not.toContain(election.title);

  const schoolBallot = JSON.stringify(
    ballots.find(
      (ballot) => ballot.gridLayout.ballotStyleId === schoolBallotStyle.id
    )
  );
  const schoolContent = nhCustomContent[schoolBallotStyle.id];
  expect(schoolBallot).toContain(schoolContent.electionTitle);
  expect(schoolBallot).toContain(schoolContent.clerkSignatureImage);
  expect(schoolBallot).toContain(schoolContent.clerkSignatureCaption);
  expect(JSON.stringify(schoolBallot)).not.toContain(election.title);

  const combinedBallot = JSON.stringify(
    ballots.find(
      (ballot) => ballot.gridLayout.ballotStyleId === combinedBallotStyle.id
    )
  );
  expect(combinedBallot).toContain(election.title);
  expect(combinedBallot).not.toContain(townContent.electionTitle);
  expect(combinedBallot).not.toContain(townContent.clerkSignatureImage);
  expect(combinedBallot).not.toContain(townContent.clerkSignatureCaption);
  expect(combinedBallot).not.toContain(schoolContent.electionTitle);
  expect(combinedBallot).not.toContain(schoolContent.clerkSignatureImage);
  expect(combinedBallot).not.toContain(schoolContent.clerkSignatureCaption);
});

test('textWrap', () => {
  const m = measurements(BallotPaperSize.Letter, 0);
  expect(
    textWrap('This is a long line of text with no tags', m.FontStyles.BODY, 40)
  ).toEqual(['This is', 'a long', 'line of', 'text', 'with no', 'tags']);
  expect(
    textWrap(
      'This is a long line of text with no line break',
      m.FontStyles.BODY,
      60
    )
  ).toEqual(['This is a', 'long line of', 'text with no', 'line break']);
  expect(
    textWrap(
      'This is a long line\n of text with a line break',
      m.FontStyles.BODY,
      60
    )
  ).toEqual(['This is a', 'long line', 'of text with', 'a line break']);

  expect(
    textWrap(
      '<html>This is a long <b>line</b> of text</html>',
      m.FontStyles.BODY,
      20
    )
  ).toEqual([
    '<html>This</html>',
    '<html>is a</html>',
    '<html>long</html>',
    '<html><b>line</b></html>',
    '<html>of</html>',
    '<html>text</html>',
  ]);

  expect(
    textWrap(
      '<html>This line has <b>nested tags for <i>complex</i> styles</b> and is long and needs wrapping </html>',
      m.FontStyles.BODY,
      100
    )
  ).toEqual([
    '<html>This line has <b>nested</b></html>',
    '<html><b>tags for <i>complex</i></b></html>',
    '<html><b>styles</b> and is long</html>',
    '<html>and needs wrapping </html>',
  ]);

  expect(
    textWrap('<html>This line has\nline breaks</html>', m.FontStyles.BODY, 100)
  ).toEqual(['<html>This line has</html>', '<html>line breaks</html>']);

  expect(() =>
    textWrap(
      '<html>Here is a mismatched <b>tag</i></b></html>',
      m.FontStyles.BODY,
      100
    )
  ).toThrowError(
    'Unexpected closing tag </i> in word "<b>tag</i></b></html>" (expected </b>)'
  );
});
