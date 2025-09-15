import { expect, test } from 'vitest';
import {
  electionFamousNames2021Fixtures,
  electionPrimaryPrecinctSplitsFixtures,
} from '@votingworks/fixtures';
import { pdfToImages, toImageBuffer } from '@votingworks/image-utils';
import { find, iter } from '@votingworks/basics';
import { readFile } from '@votingworks/fs';
import {
  renderBmdBallotFixture,
  writeFirstBallotPageToImageFile,
} from './bmd_ballot_fixtures';

const MAX_BALLOT_IMAGE_SIZE_BYTES = 250 * 1024;

test('renderBmdBallotFixture', async () => {
  const pdf = await renderBmdBallotFixture({
    electionDefinition:
      electionFamousNames2021Fixtures.readElectionDefinition(),
  });
  const pages = await iter(pdfToImages(pdf, { scale: 200 / 72 }))
    .map((page) => toImageBuffer(page.page))
    .toArray();
  expect(pages.length).toEqual(2);
  expect(pages[0]).toMatchImageSnapshot({
    failureThreshold: 0.0001,
    failureThresholdType: 'percent',
  });
  expect(pages[1]).toMatchImageSnapshot();
});

test('renderBmdBallotFixture for primary election', async () => {
  const electionDefinition =
    electionPrimaryPrecinctSplitsFixtures.readElectionDefinition();
  const pdf = await renderBmdBallotFixture({
    electionDefinition,
    ballotStyleId: find(
      electionDefinition.election.ballotStyles,
      (bs) => bs.languages?.[0] === 'en'
    ).id,
  });
  const pages = await iter(pdfToImages(pdf, { scale: 200 / 72 }))
    .map((page) => toImageBuffer(page.page))
    .toArray();
  expect(pages.length).toEqual(2);
  expect(pages[0]).toMatchImageSnapshot({
    failureThreshold: 0.0001,
    failureThresholdType: 'percent',
  });
  expect(pages[1]).toMatchImageSnapshot();
});

test('renderBmdBallotFixture rotated', async () => {
  const pdf = await renderBmdBallotFixture({
    electionDefinition:
      electionFamousNames2021Fixtures.readElectionDefinition(),
    rotateImage: true,
  });

  const pages = await iter(pdfToImages(pdf, { scale: 200 / 72 }))
    .map((page) => toImageBuffer(page.page))
    .toArray();
  expect(pages.length).toEqual(2);
  expect(pages[0]).toMatchImageSnapshot({
    failureThreshold: 0.0001,
    failureThresholdType: 'percent',
  });
  expect(pages[1]).toMatchImageSnapshot();
});

test('writeFirstBallotPageToImageFile', async () => {
  const pdf = await renderBmdBallotFixture({
    electionDefinition:
      electionFamousNames2021Fixtures.readElectionDefinition(),
  });
  const imagePath = await writeFirstBallotPageToImageFile(pdf);

  const imageData = await readFile(imagePath, {
    maxSize: MAX_BALLOT_IMAGE_SIZE_BYTES,
  });
  imageData.assertOk('Error reading image data from file');
  expect(imageData.ok()).toMatchImageSnapshot({
    failureThreshold: 0.0001,
    failureThresholdType: 'percent',
  });
});
