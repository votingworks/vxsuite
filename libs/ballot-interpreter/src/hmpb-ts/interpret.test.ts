import { assertDefined, ok, unique } from '@votingworks/basics';
import {
  electionGridLayoutNewHampshireTestBallotFixtures,
  makeTemporaryFileAsync,
} from '@votingworks/fixtures';
import { vxFamousNamesFixtures } from '@votingworks/hmpb';
import { writeImageData } from '@votingworks/image-utils';
import {
  asSheet,
  Election,
  ElectionDefinition,
  mapSheet,
} from '@votingworks/types';
import { expect, test } from 'vitest';
import { pdfToPageImages } from '../../test/helpers/interpretation';
import { interpret } from './interpret';

const electionGridLayoutNewHampshireTestBallotDefinition =
  electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();

test('interpret exists', () => {
  expect(interpret).toBeDefined();
});

test('interpret with bad election data', () => {
  const electionDefinition: ElectionDefinition = {
    ...electionGridLayoutNewHampshireTestBallotDefinition,
    election: { bad: 'election' } as unknown as Election,
  };

  expect(() => interpret(electionDefinition, ['a', 'b'])).toThrowError(
    'missing field `title`'
  );
});

test('interpret with bad ballot image paths', () => {
  const electionDefinition = electionGridLayoutNewHampshireTestBallotDefinition;

  expect(() => interpret(electionDefinition, ['a', 'b'])).toThrowError(
    'failed to load ballot card images: a, b'
  );
});

test('interpret `ImageData` objects', async () => {
  const { electionDefinition } = vxFamousNamesFixtures;
  const ballotImages = asSheet(
    await pdfToPageImages(vxFamousNamesFixtures.markedBallotPath).toArray()
  );
  const result = interpret(electionDefinition, ballotImages);
  expect(result).toEqual(ok(expect.anything()));

  const { front, back } = result.unsafeUnwrap();

  expect(front.normalizedImage).toBeDefined();
  expect(back.normalizedImage).toBeDefined();
  const [frontImageData, backImageData] = ballotImages;
  // While we would usually expect a normalized image to differ from the
  // original more significantly, in this case their dimensions are identical
  // due to minimal cropping and no scaling, which makes for a basic test.
  expect(front.normalizedImage.width).toEqual(frontImageData.width);
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
        "contestId": "mayor",
        "optionId": "sherlock-holmes",
        "score": 0.5778846,
      },
      {
        "contestId": "mayor",
        "optionId": "thomas-edison",
        "score": 0,
      },
      {
        "contestId": "mayor",
        "optionId": "write-in-0",
        "score": 0.57884616,
      },
      {
        "contestId": "controller",
        "optionId": "winston-churchill",
        "score": 0,
      },
      {
        "contestId": "controller",
        "optionId": "oprah-winfrey",
        "score": 0,
      },
      {
        "contestId": "controller",
        "optionId": "louis-armstrong",
        "score": 0,
      },
      {
        "contestId": "controller",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "attorney",
        "optionId": "john-snow",
        "score": 0.5778846,
      },
      {
        "contestId": "attorney",
        "optionId": "mark-twain",
        "score": 0,
      },
      {
        "contestId": "attorney",
        "optionId": "write-in-0",
        "score": 0.5778846,
      },
      {
        "contestId": "public-works-director",
        "optionId": "benjamin-franklin",
        "score": 0,
      },
      {
        "contestId": "public-works-director",
        "optionId": "robert-downey-jr",
        "score": 0,
      },
      {
        "contestId": "public-works-director",
        "optionId": "bill-nye",
        "score": 0,
      },
      {
        "contestId": "public-works-director",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "chief-of-police",
        "optionId": "natalie-portman",
        "score": 0.5778846,
      },
      {
        "contestId": "chief-of-police",
        "optionId": "frank-sinatra",
        "score": 0,
      },
      {
        "contestId": "chief-of-police",
        "optionId": "andy-warhol",
        "score": 0,
      },
      {
        "contestId": "chief-of-police",
        "optionId": "alfred-hitchcock",
        "score": 0,
      },
      {
        "contestId": "chief-of-police",
        "optionId": "write-in-0",
        "score": 0.5778846,
      },
      {
        "contestId": "parks-and-recreation-director",
        "optionId": "charles-darwin",
        "score": 0,
      },
      {
        "contestId": "parks-and-recreation-director",
        "optionId": "stephen-hawking",
        "score": 0,
      },
      {
        "contestId": "parks-and-recreation-director",
        "optionId": "johan-sebastian-bach",
        "score": 0,
      },
      {
        "contestId": "parks-and-recreation-director",
        "optionId": "alexander-graham-bell",
        "score": 0,
      },
      {
        "contestId": "parks-and-recreation-director",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "board-of-alderman",
        "optionId": "helen-keller",
        "score": 0.5778846,
      },
      {
        "contestId": "board-of-alderman",
        "optionId": "steve-jobs",
        "score": 0.5778846,
      },
      {
        "contestId": "board-of-alderman",
        "optionId": "nikola-tesla",
        "score": 0.5778846,
      },
      {
        "contestId": "board-of-alderman",
        "optionId": "vincent-van-gogh",
        "score": 0.5778846,
      },
      {
        "contestId": "board-of-alderman",
        "optionId": "pablo-picasso",
        "score": 0,
      },
      {
        "contestId": "board-of-alderman",
        "optionId": "wolfgang-amadeus-mozart",
        "score": 0,
      },
      {
        "contestId": "board-of-alderman",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "board-of-alderman",
        "optionId": "write-in-1",
        "score": 0,
      },
      {
        "contestId": "board-of-alderman",
        "optionId": "write-in-2",
        "score": 0.5778846,
      },
      {
        "contestId": "board-of-alderman",
        "optionId": "write-in-3",
        "score": 0,
      },
      {
        "contestId": "city-council",
        "optionId": "marie-curie",
        "score": 0.5778846,
      },
      {
        "contestId": "city-council",
        "optionId": "indiana-jones",
        "score": 0,
      },
      {
        "contestId": "city-council",
        "optionId": "mona-lisa",
        "score": 0,
      },
      {
        "contestId": "city-council",
        "optionId": "jackie-chan",
        "score": 0,
      },
      {
        "contestId": "city-council",
        "optionId": "tim-allen",
        "score": 0,
      },
      {
        "contestId": "city-council",
        "optionId": "mark-antony",
        "score": 0,
      },
      {
        "contestId": "city-council",
        "optionId": "harriet-tubman",
        "score": 0,
      },
      {
        "contestId": "city-council",
        "optionId": "martin-luther-king",
        "score": 0.5778846,
      },
      {
        "contestId": "city-council",
        "optionId": "marilyn-monroe",
        "score": 0.5778846,
      },
      {
        "contestId": "city-council",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "city-council",
        "optionId": "write-in-1",
        "score": 0,
      },
      {
        "contestId": "city-council",
        "optionId": "write-in-2",
        "score": 0,
      },
      {
        "contestId": "city-council",
        "optionId": "write-in-3",
        "score": 0,
      },
    ]
  `);
});

test('interpret images from paths', async () => {
  const { electionDefinition } = vxFamousNamesFixtures;
  const ballotImages = asSheet(
    await pdfToPageImages(vxFamousNamesFixtures.markedBallotPath).toArray()
  );
  const ballotImagePaths = await mapSheet(ballotImages, async (imageData) => {
    const path = await makeTemporaryFileAsync({ postfix: '.png' });
    await writeImageData(path, imageData);
    return path;
  });

  const result = interpret(electionDefinition, ballotImagePaths);
  expect(result).toEqual(ok(expect.anything()));

  const { front, back } = result.unsafeUnwrap();

  expect(front.normalizedImage).toBeDefined();
  expect(back.normalizedImage).toBeDefined();
  const [frontImageData, backImageData] = ballotImages;
  // While we would usually expect a normalized image to differ from the
  // original more significantly, in this case their dimensions are identical
  // due to minimal cropping and no scaling, which makes for a basic test.
  expect(front.normalizedImage.width).toEqual(frontImageData.width);
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
        "contestId": "mayor",
        "optionId": "sherlock-holmes",
        "score": 0.5778846,
      },
      {
        "contestId": "mayor",
        "optionId": "thomas-edison",
        "score": 0,
      },
      {
        "contestId": "mayor",
        "optionId": "write-in-0",
        "score": 0.57884616,
      },
      {
        "contestId": "controller",
        "optionId": "winston-churchill",
        "score": 0,
      },
      {
        "contestId": "controller",
        "optionId": "oprah-winfrey",
        "score": 0,
      },
      {
        "contestId": "controller",
        "optionId": "louis-armstrong",
        "score": 0,
      },
      {
        "contestId": "controller",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "attorney",
        "optionId": "john-snow",
        "score": 0.5778846,
      },
      {
        "contestId": "attorney",
        "optionId": "mark-twain",
        "score": 0,
      },
      {
        "contestId": "attorney",
        "optionId": "write-in-0",
        "score": 0.5778846,
      },
      {
        "contestId": "public-works-director",
        "optionId": "benjamin-franklin",
        "score": 0,
      },
      {
        "contestId": "public-works-director",
        "optionId": "robert-downey-jr",
        "score": 0,
      },
      {
        "contestId": "public-works-director",
        "optionId": "bill-nye",
        "score": 0,
      },
      {
        "contestId": "public-works-director",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "chief-of-police",
        "optionId": "natalie-portman",
        "score": 0.5778846,
      },
      {
        "contestId": "chief-of-police",
        "optionId": "frank-sinatra",
        "score": 0,
      },
      {
        "contestId": "chief-of-police",
        "optionId": "andy-warhol",
        "score": 0,
      },
      {
        "contestId": "chief-of-police",
        "optionId": "alfred-hitchcock",
        "score": 0,
      },
      {
        "contestId": "chief-of-police",
        "optionId": "write-in-0",
        "score": 0.5778846,
      },
      {
        "contestId": "parks-and-recreation-director",
        "optionId": "charles-darwin",
        "score": 0,
      },
      {
        "contestId": "parks-and-recreation-director",
        "optionId": "stephen-hawking",
        "score": 0,
      },
      {
        "contestId": "parks-and-recreation-director",
        "optionId": "johan-sebastian-bach",
        "score": 0,
      },
      {
        "contestId": "parks-and-recreation-director",
        "optionId": "alexander-graham-bell",
        "score": 0,
      },
      {
        "contestId": "parks-and-recreation-director",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "board-of-alderman",
        "optionId": "helen-keller",
        "score": 0.5778846,
      },
      {
        "contestId": "board-of-alderman",
        "optionId": "steve-jobs",
        "score": 0.5778846,
      },
      {
        "contestId": "board-of-alderman",
        "optionId": "nikola-tesla",
        "score": 0.5778846,
      },
      {
        "contestId": "board-of-alderman",
        "optionId": "vincent-van-gogh",
        "score": 0.5778846,
      },
      {
        "contestId": "board-of-alderman",
        "optionId": "pablo-picasso",
        "score": 0,
      },
      {
        "contestId": "board-of-alderman",
        "optionId": "wolfgang-amadeus-mozart",
        "score": 0,
      },
      {
        "contestId": "board-of-alderman",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "board-of-alderman",
        "optionId": "write-in-1",
        "score": 0,
      },
      {
        "contestId": "board-of-alderman",
        "optionId": "write-in-2",
        "score": 0.5778846,
      },
      {
        "contestId": "board-of-alderman",
        "optionId": "write-in-3",
        "score": 0,
      },
      {
        "contestId": "city-council",
        "optionId": "marie-curie",
        "score": 0.5778846,
      },
      {
        "contestId": "city-council",
        "optionId": "indiana-jones",
        "score": 0,
      },
      {
        "contestId": "city-council",
        "optionId": "mona-lisa",
        "score": 0,
      },
      {
        "contestId": "city-council",
        "optionId": "jackie-chan",
        "score": 0,
      },
      {
        "contestId": "city-council",
        "optionId": "tim-allen",
        "score": 0,
      },
      {
        "contestId": "city-council",
        "optionId": "mark-antony",
        "score": 0,
      },
      {
        "contestId": "city-council",
        "optionId": "harriet-tubman",
        "score": 0,
      },
      {
        "contestId": "city-council",
        "optionId": "martin-luther-king",
        "score": 0.5778846,
      },
      {
        "contestId": "city-council",
        "optionId": "marilyn-monroe",
        "score": 0.5778846,
      },
      {
        "contestId": "city-council",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "city-council",
        "optionId": "write-in-1",
        "score": 0,
      },
      {
        "contestId": "city-council",
        "optionId": "write-in-2",
        "score": 0,
      },
      {
        "contestId": "city-council",
        "optionId": "write-in-3",
        "score": 0,
      },
    ]
  `);

  // no write ins scored by default
  expect(front.writeIns).toHaveLength(0);
  expect(back.writeIns).toHaveLength(0);
});

test('interpret with old timing mark algorithm', async () => {
  const { electionDefinition } = vxFamousNamesFixtures;
  const ballotImages = asSheet(
    await pdfToPageImages(vxFamousNamesFixtures.markedBallotPath).toArray()
  );
  const ballotImagePaths = await mapSheet(ballotImages, async (imageData) => {
    const path = await makeTemporaryFileAsync({ postfix: '.png' });
    await writeImageData(path, imageData);
    return path;
  });

  const contoursInterpretedCard = interpret(
    electionDefinition,
    ballotImagePaths,
    {
      timingMarkAlgorithm: 'contours',
    }
  ).unsafeUnwrap();
  const cornersInterpretedCard = interpret(
    electionDefinition,
    ballotImagePaths,
    {
      timingMarkAlgorithm: 'corners',
    }
  ).unsafeUnwrap();

  expect(contoursInterpretedCard.front.marks).not.toEqual(
    cornersInterpretedCard.front.marks
  );
  expect(contoursInterpretedCard.back.marks).not.toEqual(
    cornersInterpretedCard.back.marks
  );
});

test('score write in areas', async () => {
  const { electionDefinition } = vxFamousNamesFixtures;
  const ballotImages = asSheet(
    await pdfToPageImages(vxFamousNamesFixtures.markedBallotPath).toArray()
  );

  const result = interpret(electionDefinition, ballotImages, {
    scoreWriteIns: true,
  });
  expect(result).toEqual(ok(expect.anything()));

  const { front, back } = result.unsafeUnwrap();

  expect(front.writeIns).toMatchSnapshot();
  expect(back.writeIns).toMatchSnapshot();
});
