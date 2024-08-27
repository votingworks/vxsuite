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
  ).toMatchSnapshot();
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
  ).toMatchSnapshot();

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
