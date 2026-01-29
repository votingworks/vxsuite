import { expect, test, describe } from 'vitest';
import {
  electionFamousNames2021Fixtures,
  electionPrimaryPrecinctSplitsFixtures,
} from '@votingworks/fixtures';
import { pdfToImages, toImageBuffer } from '@votingworks/image-utils';
import { find, iter } from '@votingworks/basics';
import { readFile } from '@votingworks/fs';
import {
  createTestElection,
  createElectionDefinition,
  createMockVotes,
} from '@votingworks/test-utils';
import { BallotStyleId } from '@votingworks/types';
import {
  renderBmdBallotFixture,
  renderMultiPageBmdBallotFixture,
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

describe('renderMultiPageBmdBallotFixture', () => {
  test('renders multi-page ballot pages correctly', async () => {
    // Create a large election that would require multiple pages
    const election = createTestElection({
      numCandidateContests: 35,
      numYesNoContests: 15,
      candidatesPerContest: 5,
      longCandidateNames: true,
      longContestTitles: true,
    });
    const electionDefinition = createElectionDefinition(election);
    const votes = createMockVotes([...election.contests]);

    // Split contests into two pages for testing
    const allContestIds = election.contests.map((c) => c.id);
    const page1ContestIds = allContestIds.slice(0, 25);
    const page2ContestIds = allContestIds.slice(25);

    // Render page 1
    const page1Pdf = await renderMultiPageBmdBallotFixture({
      electionDefinition,
      ballotStyleId: 'ballot-style-1' as BallotStyleId,
      precinctId: 'precinct-1',
      votes,
      pageNumber: 1,
      totalPages: 2,
      ballotAuditId: 'test-audit-id-123',
      contestIdsForPage: page1ContestIds,
    });

    const page1Images = await iter(pdfToImages(page1Pdf, { scale: 200 / 72 }))
      .map((page) => toImageBuffer(page.page))
      .toArray();
    expect(page1Images.length).toEqual(2);
    expect(page1Images[0]).toMatchImageSnapshot({
      failureThreshold: 0.0001,
      failureThresholdType: 'percent',
    });

    // Render page 2
    const page2Pdf = await renderMultiPageBmdBallotFixture({
      electionDefinition,
      ballotStyleId: 'ballot-style-1' as BallotStyleId,
      precinctId: 'precinct-1',
      votes,
      pageNumber: 2,
      totalPages: 2,
      ballotAuditId: 'test-audit-id-123',
      contestIdsForPage: page2ContestIds,
    });

    const page2Images = await iter(pdfToImages(page2Pdf, { scale: 200 / 72 }))
      .map((page) => toImageBuffer(page.page))
      .toArray();
    expect(page2Images.length).toEqual(2);
    expect(page2Images[0]).toMatchImageSnapshot({
      failureThreshold: 0.0001,
      failureThresholdType: 'percent',
    });
  });

  test('renders rotated multi-page ballot', async () => {
    const election = createTestElection({
      numCandidateContests: 5,
      numYesNoContests: 3,
      candidatesPerContest: 3,
    });
    const electionDefinition = createElectionDefinition(election);
    const votes = createMockVotes([...election.contests]);
    const contestIds = election.contests.map((c) => c.id);

    const pdf = await renderMultiPageBmdBallotFixture({
      electionDefinition,
      ballotStyleId: 'ballot-style-1' as BallotStyleId,
      precinctId: 'precinct-1',
      votes,
      pageNumber: 1,
      totalPages: 1,
      ballotAuditId: 'test-audit-id-rotated',
      contestIdsForPage: contestIds,
      rotateImage: true,
    });

    const images = await iter(pdfToImages(pdf, { scale: 200 / 72 }))
      .map((page) => toImageBuffer(page.page))
      .toArray();
    expect(images.length).toEqual(2);
    expect(images[0]).toMatchImageSnapshot({
      failureThreshold: 0.0001,
      failureThresholdType: 'percent',
    });
  });

  test('handles contestIds not in votes', async () => {
    const election = createTestElection({
      numCandidateContests: 5,
      numYesNoContests: 3,
      candidatesPerContest: 3,
    });
    const electionDefinition = createElectionDefinition(election);

    // Only create votes for the first 4 contests, leaving some without votes
    const partialContestIds = election.contests.slice(0, 4).map((c) => c.id);
    const votes = createMockVotes([...election.contests], partialContestIds);

    // Request all contest IDs for the page, including ones without votes
    const allContestIds = election.contests.map((c) => c.id);

    const pdf = await renderMultiPageBmdBallotFixture({
      electionDefinition,
      ballotStyleId: 'ballot-style-1' as BallotStyleId,
      precinctId: 'precinct-1',
      votes,
      pageNumber: 1,
      totalPages: 1,
      ballotAuditId: 'test-audit-id-partial',
      contestIdsForPage: allContestIds,
    });

    const images = await iter(pdfToImages(pdf, { scale: 200 / 72 }))
      .map((page) => toImageBuffer(page.page))
      .toArray();
    expect(images.length).toEqual(2);
    expect(images[0]).toMatchImageSnapshot({
      failureThreshold: 0.0001,
      failureThresholdType: 'percent',
    });
  });
});
