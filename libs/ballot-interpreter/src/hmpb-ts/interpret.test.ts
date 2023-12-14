import { assertDefined, iter, ok, unique } from '@votingworks/basics';
import { electionGridLayoutNewHampshireTestBallotFixtures } from '@votingworks/fixtures';
import { Election, ElectionDefinition, SheetOf } from '@votingworks/types';
import { interpret } from './interpret';

test('interpret exists', () => {
  expect(interpret).toBeDefined();
});

test('interpret with bad election data', () => {
  const electionDefinition: ElectionDefinition = {
    ...electionGridLayoutNewHampshireTestBallotFixtures.electionDefinition,
    election: { bad: 'election' } as unknown as Election,
  };

  expect(() => interpret(electionDefinition, ['a', 'b'])).toThrowError(
    'missing field `title`'
  );
});

test('interpret with bad ballot image paths', () => {
  const { electionDefinition } =
    electionGridLayoutNewHampshireTestBallotFixtures;

  expect(() => interpret(electionDefinition, ['a', 'b'])).toThrowError(
    'failed to load ballot card images: a, b'
  );
});

test('interpret `ImageData` objects', async () => {
  const { electionDefinition } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  const ballotImages: SheetOf<ImageData> = [
    await electionGridLayoutNewHampshireTestBallotFixtures.scanMarkedFront.asImageData(),
    await electionGridLayoutNewHampshireTestBallotFixtures.scanMarkedBack.asImageData(),
  ];

  const result = interpret(electionDefinition, ballotImages);
  expect(result).toEqual(ok(expect.anything()));

  const { front, back } = result.unsafeUnwrap();

  expect(front.normalizedImage).toBeDefined();
  expect(back.normalizedImage).toBeDefined();
  const frontImageData =
    await electionGridLayoutNewHampshireTestBallotFixtures.scanMarkedFront.asImageData();
  const backImageData =
    await electionGridLayoutNewHampshireTestBallotFixtures.scanMarkedBack.asImageData();
  // While we would usually expect a normalized image to differ from the
  // original more significantly, in this case their dimensions are basically
  // identical due to minimal cropping and no scaling, which makes for a basic test.
  expect(front.normalizedImage.width).toEqual(frontImageData.width - 1);
  expect(front.normalizedImage.height).toEqual(frontImageData.height);
  expect(back.normalizedImage.width).toEqual(backImageData.width);
  expect(back.normalizedImage.height).toEqual(backImageData.height);
  expect(front.normalizedImage.data.length).toBeGreaterThan(0);
  expect(back.normalizedImage.data.length).toBeGreaterThan(0);

  const gridPositions = assertDefined(
    electionDefinition.election.gridLayouts?.[0]?.gridPositions
  );

  // Layout should contain all the contests in order
  expect(
    [...front.contestLayouts, ...back.contestLayouts].map(
      (layout) => layout.contestId
    )
  ).toEqual(unique(gridPositions.map((position) => position.contestId)));

  // Each contest should contain all the options in order
  for (const contestLayout of [
    ...front.contestLayouts,
    ...back.contestLayouts,
  ]) {
    expect(contestLayout.options.map((option) => option.optionId)).toEqual(
      gridPositions
        .filter((position) => position.contestId === contestLayout.contestId)
        .map((position) =>
          position.type === 'option'
            ? position.optionId
            : `write-in-${position.writeInIndex}`
        )
    );
  }

  expect(front.contestLayouts).toMatchSnapshot();
  expect(back.contestLayouts).toMatchSnapshot();

  expect(
    [...front.marks, ...back.marks].map(([position, mark]) => ({
      contestId: position.contestId,
      optionId:
        position.type === 'option'
          ? position.optionId
          : `write-in-${position.writeInIndex}`,
      score: mark?.fillScore,
    }))
  ).toMatchInlineSnapshot(`
    [
      {
        "contestId": "Governor-061a401b",
        "optionId": "Josiah-Bartlett-1bb99985",
        "score": 0.38557693,
      },
      {
        "contestId": "United-States-Senator-d3f1c75b",
        "optionId": "John-Langdon-5951c8e1",
        "score": 0,
      },
      {
        "contestId": "Representative-in-Congress-24683b44",
        "optionId": "Jeremiah-Smith-469560c9",
        "score": 0,
      },
      {
        "contestId": "Executive-Councilor-bb22557f",
        "optionId": "Anne-Waldron-ee0cbc85",
        "score": 0,
      },
      {
        "contestId": "State-Senator-391381f8",
        "optionId": "James-Poole-db5ef4bd",
        "score": 0.2875,
      },
      {
        "contestId": "State-Representatives-Hillsborough-District-34-b1012d38",
        "optionId": "Obadiah-Carrigan-5c95145a",
        "score": 0,
      },
      {
        "contestId": "State-Representatives-Hillsborough-District-34-b1012d38",
        "optionId": "Mary-Baker-Eddy-350785d5",
        "score": 0,
      },
      {
        "contestId": "State-Representatives-Hillsborough-District-34-b1012d38",
        "optionId": "Samuel-Bell-17973275",
        "score": 0.3201923,
      },
      {
        "contestId": "State-Representative-Hillsborough-District-37-f3bde894",
        "optionId": "Abeil-Foster-ded38e36",
        "score": 0,
      },
      {
        "contestId": "Governor-061a401b",
        "optionId": "Hannah-Dustin-ab4ef7c8",
        "score": 0,
      },
      {
        "contestId": "United-States-Senator-d3f1c75b",
        "optionId": "William-Preston-3778fcd5",
        "score": 0.37980768,
      },
      {
        "contestId": "Representative-in-Congress-24683b44",
        "optionId": "Nicholas-Gilman-1791aed7",
        "score": 0,
      },
      {
        "contestId": "Executive-Councilor-bb22557f",
        "optionId": "Daniel-Webster-13f77b2d",
        "score": 0,
      },
      {
        "contestId": "State-Senator-391381f8",
        "optionId": "Matthew-Thornton-f66fec5e",
        "score": 0,
      },
      {
        "contestId": "State-Representatives-Hillsborough-District-34-b1012d38",
        "optionId": "Samuel-Livermore-f927fef1",
        "score": 0.3221154,
      },
      {
        "contestId": "State-Representatives-Hillsborough-District-34-b1012d38",
        "optionId": "Elijah-Miller-a52e6988",
        "score": 0,
      },
      {
        "contestId": "State-Representatives-Hillsborough-District-34-b1012d38",
        "optionId": "Isaac-Hill-d6c9deeb",
        "score": 0,
      },
      {
        "contestId": "State-Representative-Hillsborough-District-37-f3bde894",
        "optionId": "Charles-H-Hersey-096286a4",
        "score": 0.2778846,
      },
      {
        "contestId": "Governor-061a401b",
        "optionId": "John-Spencer-9ffb5970",
        "score": 0,
      },
      {
        "contestId": "Representative-in-Congress-24683b44",
        "optionId": "Richard-Coote-b9095636",
        "score": 0.32307693,
      },
      {
        "contestId": "State-Representatives-Hillsborough-District-34-b1012d38",
        "optionId": "Abigail-Bartlett-4e46c9d4",
        "score": 0,
      },
      {
        "contestId": "State-Representatives-Hillsborough-District-34-b1012d38",
        "optionId": "Jacob-Freese-b5146505",
        "score": 0.3326923,
      },
      {
        "contestId": "State-Representative-Hillsborough-District-37-f3bde894",
        "optionId": "William-Lovejoy-fde3c2df",
        "score": 0,
      },
      {
        "contestId": "Governor-061a401b",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "United-States-Senator-d3f1c75b",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "Representative-in-Congress-24683b44",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "Executive-Councilor-bb22557f",
        "optionId": "write-in-0",
        "score": 0.24903846,
      },
      {
        "contestId": "State-Senator-391381f8",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "State-Representatives-Hillsborough-District-34-b1012d38",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "State-Representatives-Hillsborough-District-34-b1012d38",
        "optionId": "write-in-1",
        "score": 0,
      },
      {
        "contestId": "State-Representatives-Hillsborough-District-34-b1012d38",
        "optionId": "write-in-2",
        "score": 0,
      },
      {
        "contestId": "State-Representative-Hillsborough-District-37-f3bde894",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "Sheriff-4243fe0b",
        "optionId": "Edward-Randolph-bf4c848a",
        "score": 0.30192307,
      },
      {
        "contestId": "County-Attorney-133f910f",
        "optionId": "Ezra-Bartlett-8f95223c",
        "score": 0,
      },
      {
        "contestId": "County-Treasurer-87d25a31",
        "optionId": "John-Smith-ef61a579",
        "score": 0,
      },
      {
        "contestId": "Register-of-Deeds-a1278df2",
        "optionId": "John-Mann-b56bbdd3",
        "score": 0.35192308,
      },
      {
        "contestId": "Register-of-Probate-a4117da8",
        "optionId": "Nathaniel-Parker-56a06c29",
        "score": 0,
      },
      {
        "contestId": "County-Commissioner-d6feed25",
        "optionId": "Ichabod-Goodwin-55e8de1f",
        "score": 0,
      },
      {
        "contestId": "Sheriff-4243fe0b",
        "optionId": "Edward-Randolph-bf4c848a",
        "score": 0,
      },
      {
        "contestId": "County-Attorney-133f910f",
        "optionId": "Mary-Woolson-dc0b854a",
        "score": 0.31923077,
      },
      {
        "contestId": "County-Treasurer-87d25a31",
        "optionId": "Jane-Jones-9caa141f",
        "score": 0,
      },
      {
        "contestId": "Register-of-Deeds-a1278df2",
        "optionId": "Ellen-A-Stileman-14408737",
        "score": 0,
      },
      {
        "contestId": "Register-of-Probate-a4117da8",
        "optionId": "Claire-Cutts-07a436e7",
        "score": 0.2971154,
      },
      {
        "contestId": "County-Commissioner-d6feed25",
        "optionId": "Valbe-Cady-ba3af3af",
        "score": 0,
      },
      {
        "contestId": "Sheriff-4243fe0b",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "County-Attorney-133f910f",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "County-Treasurer-87d25a31",
        "optionId": "write-in-0",
        "score": 0.37115383,
      },
      {
        "contestId": "Register-of-Deeds-a1278df2",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "Register-of-Probate-a4117da8",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "County-Commissioner-d6feed25",
        "optionId": "write-in-0",
        "score": 0.30865383,
      },
      {
        "contestId": "Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc",
        "optionId": "Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc-option-yes",
        "score": 0.32596153,
      },
      {
        "contestId": "Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc",
        "optionId": "Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc-option-no",
        "score": 0,
      },
    ]
  `);
});

test('interpret images from paths', async () => {
  const { electionDefinition } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  const ballotImagePaths: SheetOf<string> = [
    electionGridLayoutNewHampshireTestBallotFixtures.scanMarkedFront.asFilePath(),
    electionGridLayoutNewHampshireTestBallotFixtures.scanMarkedBack.asFilePath(),
  ];

  const result = interpret(electionDefinition, ballotImagePaths);
  expect(result).toEqual(ok(expect.anything()));

  const { front, back } = result.unsafeUnwrap();

  expect(front.normalizedImage).toBeDefined();
  expect(back.normalizedImage).toBeDefined();
  const frontImageData =
    await electionGridLayoutNewHampshireTestBallotFixtures.scanMarkedFront.asImageData();
  const backImageData =
    await electionGridLayoutNewHampshireTestBallotFixtures.scanMarkedBack.asImageData();
  // While we would usually expect a normalized image to differ from the
  // original more significantly, in this case their dimensions are basically
  // identical due to minimal cropping and no scaling, which makes for a basic test.
  expect(front.normalizedImage.width).toEqual(frontImageData.width - 1);
  expect(front.normalizedImage.height).toEqual(frontImageData.height);
  expect(back.normalizedImage.width).toEqual(backImageData.width);
  expect(back.normalizedImage.height).toEqual(backImageData.height);
  expect(front.normalizedImage.data.length).toBeGreaterThan(0);
  expect(back.normalizedImage.data.length).toBeGreaterThan(0);

  const gridPositions = assertDefined(
    electionDefinition.election.gridLayouts?.[0]?.gridPositions
  );

  // Layout should contain all the contests in order
  expect(
    [...front.contestLayouts, ...back.contestLayouts].map(
      (layout) => layout.contestId
    )
  ).toEqual(unique(gridPositions.map((position) => position.contestId)));

  // Each contest should contain all the options in order
  for (const contestLayout of [
    ...front.contestLayouts,
    ...back.contestLayouts,
  ]) {
    expect(contestLayout.options.map((option) => option.optionId)).toEqual(
      gridPositions
        .filter((position) => position.contestId === contestLayout.contestId)
        .map((position) =>
          position.type === 'option'
            ? position.optionId
            : `write-in-${position.writeInIndex}`
        )
    );
  }

  expect(front.contestLayouts).toMatchSnapshot();
  expect(back.contestLayouts).toMatchSnapshot();

  expect(
    [...front.marks, ...back.marks].map(([position, mark]) => ({
      contestId: position.contestId,
      optionId:
        position.type === 'option'
          ? position.optionId
          : `write-in-${position.writeInIndex}`,
      score: mark?.fillScore,
    }))
  ).toMatchInlineSnapshot(`
    [
      {
        "contestId": "Governor-061a401b",
        "optionId": "Josiah-Bartlett-1bb99985",
        "score": 0.38557693,
      },
      {
        "contestId": "United-States-Senator-d3f1c75b",
        "optionId": "John-Langdon-5951c8e1",
        "score": 0,
      },
      {
        "contestId": "Representative-in-Congress-24683b44",
        "optionId": "Jeremiah-Smith-469560c9",
        "score": 0,
      },
      {
        "contestId": "Executive-Councilor-bb22557f",
        "optionId": "Anne-Waldron-ee0cbc85",
        "score": 0,
      },
      {
        "contestId": "State-Senator-391381f8",
        "optionId": "James-Poole-db5ef4bd",
        "score": 0.2875,
      },
      {
        "contestId": "State-Representatives-Hillsborough-District-34-b1012d38",
        "optionId": "Obadiah-Carrigan-5c95145a",
        "score": 0,
      },
      {
        "contestId": "State-Representatives-Hillsborough-District-34-b1012d38",
        "optionId": "Mary-Baker-Eddy-350785d5",
        "score": 0,
      },
      {
        "contestId": "State-Representatives-Hillsborough-District-34-b1012d38",
        "optionId": "Samuel-Bell-17973275",
        "score": 0.3201923,
      },
      {
        "contestId": "State-Representative-Hillsborough-District-37-f3bde894",
        "optionId": "Abeil-Foster-ded38e36",
        "score": 0,
      },
      {
        "contestId": "Governor-061a401b",
        "optionId": "Hannah-Dustin-ab4ef7c8",
        "score": 0,
      },
      {
        "contestId": "United-States-Senator-d3f1c75b",
        "optionId": "William-Preston-3778fcd5",
        "score": 0.37980768,
      },
      {
        "contestId": "Representative-in-Congress-24683b44",
        "optionId": "Nicholas-Gilman-1791aed7",
        "score": 0,
      },
      {
        "contestId": "Executive-Councilor-bb22557f",
        "optionId": "Daniel-Webster-13f77b2d",
        "score": 0,
      },
      {
        "contestId": "State-Senator-391381f8",
        "optionId": "Matthew-Thornton-f66fec5e",
        "score": 0,
      },
      {
        "contestId": "State-Representatives-Hillsborough-District-34-b1012d38",
        "optionId": "Samuel-Livermore-f927fef1",
        "score": 0.3221154,
      },
      {
        "contestId": "State-Representatives-Hillsborough-District-34-b1012d38",
        "optionId": "Elijah-Miller-a52e6988",
        "score": 0,
      },
      {
        "contestId": "State-Representatives-Hillsborough-District-34-b1012d38",
        "optionId": "Isaac-Hill-d6c9deeb",
        "score": 0,
      },
      {
        "contestId": "State-Representative-Hillsborough-District-37-f3bde894",
        "optionId": "Charles-H-Hersey-096286a4",
        "score": 0.2778846,
      },
      {
        "contestId": "Governor-061a401b",
        "optionId": "John-Spencer-9ffb5970",
        "score": 0,
      },
      {
        "contestId": "Representative-in-Congress-24683b44",
        "optionId": "Richard-Coote-b9095636",
        "score": 0.32307693,
      },
      {
        "contestId": "State-Representatives-Hillsborough-District-34-b1012d38",
        "optionId": "Abigail-Bartlett-4e46c9d4",
        "score": 0,
      },
      {
        "contestId": "State-Representatives-Hillsborough-District-34-b1012d38",
        "optionId": "Jacob-Freese-b5146505",
        "score": 0.3326923,
      },
      {
        "contestId": "State-Representative-Hillsborough-District-37-f3bde894",
        "optionId": "William-Lovejoy-fde3c2df",
        "score": 0,
      },
      {
        "contestId": "Governor-061a401b",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "United-States-Senator-d3f1c75b",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "Representative-in-Congress-24683b44",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "Executive-Councilor-bb22557f",
        "optionId": "write-in-0",
        "score": 0.24903846,
      },
      {
        "contestId": "State-Senator-391381f8",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "State-Representatives-Hillsborough-District-34-b1012d38",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "State-Representatives-Hillsborough-District-34-b1012d38",
        "optionId": "write-in-1",
        "score": 0,
      },
      {
        "contestId": "State-Representatives-Hillsborough-District-34-b1012d38",
        "optionId": "write-in-2",
        "score": 0,
      },
      {
        "contestId": "State-Representative-Hillsborough-District-37-f3bde894",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "Sheriff-4243fe0b",
        "optionId": "Edward-Randolph-bf4c848a",
        "score": 0.30192307,
      },
      {
        "contestId": "County-Attorney-133f910f",
        "optionId": "Ezra-Bartlett-8f95223c",
        "score": 0,
      },
      {
        "contestId": "County-Treasurer-87d25a31",
        "optionId": "John-Smith-ef61a579",
        "score": 0,
      },
      {
        "contestId": "Register-of-Deeds-a1278df2",
        "optionId": "John-Mann-b56bbdd3",
        "score": 0.35192308,
      },
      {
        "contestId": "Register-of-Probate-a4117da8",
        "optionId": "Nathaniel-Parker-56a06c29",
        "score": 0,
      },
      {
        "contestId": "County-Commissioner-d6feed25",
        "optionId": "Ichabod-Goodwin-55e8de1f",
        "score": 0,
      },
      {
        "contestId": "Sheriff-4243fe0b",
        "optionId": "Edward-Randolph-bf4c848a",
        "score": 0,
      },
      {
        "contestId": "County-Attorney-133f910f",
        "optionId": "Mary-Woolson-dc0b854a",
        "score": 0.31923077,
      },
      {
        "contestId": "County-Treasurer-87d25a31",
        "optionId": "Jane-Jones-9caa141f",
        "score": 0,
      },
      {
        "contestId": "Register-of-Deeds-a1278df2",
        "optionId": "Ellen-A-Stileman-14408737",
        "score": 0,
      },
      {
        "contestId": "Register-of-Probate-a4117da8",
        "optionId": "Claire-Cutts-07a436e7",
        "score": 0.2971154,
      },
      {
        "contestId": "County-Commissioner-d6feed25",
        "optionId": "Valbe-Cady-ba3af3af",
        "score": 0,
      },
      {
        "contestId": "Sheriff-4243fe0b",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "County-Attorney-133f910f",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "County-Treasurer-87d25a31",
        "optionId": "write-in-0",
        "score": 0.37115383,
      },
      {
        "contestId": "Register-of-Deeds-a1278df2",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "Register-of-Probate-a4117da8",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "County-Commissioner-d6feed25",
        "optionId": "write-in-0",
        "score": 0.30865383,
      },
      {
        "contestId": "Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc",
        "optionId": "Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc-option-yes",
        "score": 0.32596153,
      },
      {
        "contestId": "Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc",
        "optionId": "Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc-option-no",
        "score": 0,
      },
    ]
  `);

  // no write ins scored by default
  expect(front.writeIns).toHaveLength(0);
  expect(back.writeIns).toHaveLength(0);
});

test('score write in areas', async () => {
  const { electionDefinition } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  const ballotImages: SheetOf<ImageData> = [
    await electionGridLayoutNewHampshireTestBallotFixtures.scanMarkedFront.asImageData(),
    await electionGridLayoutNewHampshireTestBallotFixtures.scanMarkedBack.asImageData(),
  ];

  const result = interpret(electionDefinition, ballotImages, {
    scoreWriteIns: true,
  });
  expect(result).toEqual(ok(expect.anything()));

  const { front, back } = result.unsafeUnwrap();

  expect(front.writeIns).toMatchSnapshot();
  expect(back.writeIns).toMatchSnapshot();
});

test('interpret with grainy timing marks', async () => {
  const { electionDefinition } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  const ballotImages: SheetOf<ImageData> = [
    await electionGridLayoutNewHampshireTestBallotFixtures.scanMarkedGrainyTimingMarksFront.asImageData(),
    await electionGridLayoutNewHampshireTestBallotFixtures.scanMarkedGrainyTimingMarksBack.asImageData(),
  ];

  const result = interpret(electionDefinition, ballotImages);
  expect(result).toEqual(ok(expect.anything()));

  const { front, back } = result.unsafeUnwrap();
  const gridLayout = assertDefined(
    electionDefinition.election.gridLayouts?.[0]
  );
  const [frontPositions, backPositions] = iter(
    gridLayout.gridPositions
  ).partition((position) => position.side === 'front');
  expect(front.marks.map(([, mark]) => mark?.fillScore)).toEqual(
    frontPositions.map(() => 0)
  );
  expect(back.marks.map(([, mark]) => mark?.fillScore)).toEqual(
    backPositions.map(() => 0)
  );
});
