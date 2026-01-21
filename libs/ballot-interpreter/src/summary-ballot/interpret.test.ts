import { beforeAll, expect, test } from 'vitest';
import { sliceBallotHashForEncoding } from '@votingworks/ballot-encoder';
import { assert, err } from '@votingworks/basics';
import {
  electionFamousNames2021Fixtures,
  electionGridLayoutNewHampshireTestBallotFixtures,
  sampleBallotImages,
} from '@votingworks/fixtures';
import { SheetOf, asSheet } from '@votingworks/types';
import {
  renderBmdBallotFixture,
  DEFAULT_FAMOUS_NAMES_BALLOT_STYLE_ID,
  DEFAULT_FAMOUS_NAMES_PRECINCT_ID,
  DEFAULT_FAMOUS_NAMES_VOTES,
} from '@votingworks/bmd-ballot-fixtures';
import { ImageData, createCanvas } from 'canvas';
import { InterpretResult, interpret } from './interpret.js';
import { pdfToPageImages } from '../../test/helpers/interpretation';

let famousNamesBmdBallot: SheetOf<ImageData>;
let famousNamesBmdBallotUpsideDown: SheetOf<ImageData>;

function copyImageData(imageData: ImageData): ImageData {
  // Create a new canvas element
  const newImageData = new ImageData(imageData.width, imageData.height);
  newImageData.data.set(imageData.data.slice());
  return newImageData;
}

beforeAll(async () => {
  famousNamesBmdBallot = asSheet(
    await pdfToPageImages(
      await renderBmdBallotFixture({
        electionDefinition:
          electionFamousNames2021Fixtures.readElectionDefinition(),
        ballotStyleId: DEFAULT_FAMOUS_NAMES_BALLOT_STYLE_ID,
        precinctId: DEFAULT_FAMOUS_NAMES_PRECINCT_ID,
        votes: DEFAULT_FAMOUS_NAMES_VOTES,
      })
    ).toArray()
  );

  famousNamesBmdBallotUpsideDown = asSheet(
    await pdfToPageImages(
      await renderBmdBallotFixture({
        electionDefinition:
          electionFamousNames2021Fixtures.readElectionDefinition(),
        ballotStyleId: DEFAULT_FAMOUS_NAMES_BALLOT_STYLE_ID,
        precinctId: DEFAULT_FAMOUS_NAMES_PRECINCT_ID,
        votes: DEFAULT_FAMOUS_NAMES_VOTES,
        rotateImage: true,
      })
    ).toArray()
  );
});

test('happy path: front, back', async () => {
  const card = famousNamesBmdBallot;
  const result = await interpret(
    electionFamousNames2021Fixtures.readElectionDefinition(),
    card
  );
  const interpretation = result.unsafeUnwrap();
  assert(interpretation.type === 'single-page');
  const { ballot, summaryBallotImage, blankPageImage } = interpretation;
  expect(ballot).toMatchSnapshot();

  expect(summaryBallotImage.width).toBeLessThanOrEqual(card[0].width);
  expect(summaryBallotImage.height).toBeLessThanOrEqual(card[0].height);
  expect(blankPageImage.width).toBeLessThanOrEqual(card[1].width);
  expect(blankPageImage.height).toBeLessThanOrEqual(card[1].height);
});

test('happy path: back, front', async () => {
  const card = famousNamesBmdBallot;
  const result = await interpret(
    electionFamousNames2021Fixtures.readElectionDefinition(),
    [card[1], card[0]]
  );
  const interpretation = result.unsafeUnwrap();
  assert(interpretation.type === 'single-page');
  const { ballot, summaryBallotImage, blankPageImage } = interpretation;
  expect(ballot).toMatchSnapshot();

  expect(summaryBallotImage.width).toBeLessThanOrEqual(card[0].width);
  expect(summaryBallotImage.height).toBeLessThanOrEqual(card[0].height);
  expect(blankPageImage.width).toBeLessThanOrEqual(card[1].width);
  expect(blankPageImage.height).toBeLessThanOrEqual(card[1].height);
});

test('happy path: front upside down, back', async () => {
  const cardFlipped = famousNamesBmdBallotUpsideDown;
  const cardOriginal = famousNamesBmdBallot;
  const resultFlipped = await interpret(
    electionFamousNames2021Fixtures.readElectionDefinition(),
    [cardFlipped[0], copyImageData(cardFlipped[1])]
  );
  const resultOriginal = await interpret(
    electionFamousNames2021Fixtures.readElectionDefinition(),
    cardOriginal
  );
  const interpretationFlipped = resultFlipped.unsafeUnwrap();
  assert(interpretationFlipped.type === 'single-page');
  const {
    ballot: ballotFlipped,
    summaryBallotImage: summaryBallotImageFlipped,
    blankPageImage: blankPageImageFlipped,
  } = interpretationFlipped;
  const interpretationOriginal = resultOriginal.unsafeUnwrap();
  assert(interpretationOriginal.type === 'single-page');
  const { ballot: ballotOriginal } = interpretationOriginal;
  expect(ballotFlipped).toMatchSnapshot();
  expect(ballotFlipped).toEqual(ballotOriginal);

  // don't use `expect::toEqual` matcher because it tries to pretty print the
  // ImageData objects, which is slow and causes the test to time out
  assert(
    blankPageImageFlipped.data.every(
      (value, idx) => value === cardFlipped[1].data[idx]
    )
  );

  // Visually ensure that the snapshot represents a properly oriented ballot
  const canvas = createCanvas(
    summaryBallotImageFlipped.width,
    summaryBallotImageFlipped.height
  );
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = false;
  context.putImageData(summaryBallotImageFlipped, 0, 0);
  const ballotImage = canvas.toBuffer('image/png');
  expect(ballotImage).toMatchImageSnapshot({
    failureThresholdType: 'percent',
    failureThreshold: 0.001,
  });
});

test('happy path: back, front upside down', async () => {
  const cardFlipped = famousNamesBmdBallotUpsideDown;
  const cardOriginal = famousNamesBmdBallot;
  const resultFlipped = await interpret(
    electionFamousNames2021Fixtures.readElectionDefinition(),
    [cardFlipped[1], copyImageData(cardFlipped[0])]
  );
  const resultOriginal = await interpret(
    electionFamousNames2021Fixtures.readElectionDefinition(),
    cardOriginal
  );
  const interpretationFlipped = resultFlipped.unsafeUnwrap();
  assert(interpretationFlipped.type === 'single-page');
  const {
    ballot: ballotFlipped,
    summaryBallotImage: summaryBallotImageFlipped,
    blankPageImage: blankPageImageFlipped,
  } = interpretationFlipped;
  const interpretationOriginal = resultOriginal.unsafeUnwrap();
  assert(interpretationOriginal.type === 'single-page');
  const { ballot: ballotOriginal } = interpretationOriginal;
  expect(ballotFlipped).toMatchSnapshot();
  expect(ballotFlipped).toEqual(ballotOriginal);

  // don't use `expect::toEqual` matcher because it tries to pretty print the
  // ImageData objects, which is slow and causes the test to time out
  assert(
    blankPageImageFlipped.data.every(
      (value, idx) => value === cardFlipped[1].data[idx]
    )
  );

  const canvas = createCanvas(
    summaryBallotImageFlipped.width,
    summaryBallotImageFlipped.height
  );

  // Visually ensure that the snapshot represents a properly oriented ballot
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = false;
  context.putImageData(summaryBallotImageFlipped, 0, 0);
  const ballotImage = canvas.toBuffer('image/png');
  expect(ballotImage).toMatchImageSnapshot({
    failureThresholdType: 'percent',
    failureThreshold: 0.001,
  });
});

test('votes not found', async () => {
  const card: SheetOf<ImageData> = [
    await sampleBallotImages.blankPage.asImageData(),
    await sampleBallotImages.blankPage.asImageData(),
  ];
  const result = await interpret(
    electionFamousNames2021Fixtures.readElectionDefinition(),
    card
  );
  expect(result).toEqual<InterpretResult>(
    err({
      type: 'votes-not-found',
      source: [{ type: 'blank-page' }, { type: 'blank-page' }],
    })
  );
});

test('multiple QR codes', async () => {
  const [page1] = famousNamesBmdBallot;
  const card: SheetOf<ImageData> = [page1, page1];
  const result = await interpret(
    electionFamousNames2021Fixtures.readElectionDefinition(),
    card
  );
  expect(result).toEqual<InterpretResult>(
    err({
      type: 'multiple-qr-codes',
      source: expect.anything(),
    })
  );
});

test('mismatched election', async () => {
  const card = famousNamesBmdBallot;
  const result = await interpret(
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition(),
    card
  );
  expect(result).toEqual<InterpretResult>(
    err({
      type: 'mismatched-election',
      expectedBallotHash: sliceBallotHashForEncoding(
        electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition()
          .ballotHash
      ),
      actualBallotHash: sliceBallotHashForEncoding(
        electionFamousNames2021Fixtures.readElectionDefinition().ballotHash
      ),
    })
  );
});
