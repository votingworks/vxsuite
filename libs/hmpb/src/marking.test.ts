import fs from 'node:fs';
import { expect, test } from 'vitest';

import { safeParseElection, Vote, VotesDict } from '@votingworks/types';
import { assertDefined, find, iter } from '@votingworks/basics';
import {
  overlayImages,
  pdfToImages,
  toImageBuffer,
} from '@votingworks/image-utils';

import { generateMarkOverlay } from './marking';
import {
  miGeneralElectionFixtures,
  nhGeneralElectionFixtures,
  nhStateGeneralElectionFixtures,
  vxGeneralElectionFixtures,
} from './ballot_fixtures';

test('places marks consistently', async () => {
  const fixture = find(
    vxGeneralElectionFixtures.fixtureSpecs,
    (spec) => spec.paperSize === 'letter' && spec.languageCode === 'en'
  );

  const election = safeParseElection(
    JSON.parse(fs.readFileSync(fixture.electionPath, 'utf8'))
  );

  const overlayPdf = await generateMarkOverlay(
    election.unsafeUnwrap(),
    fixture.ballotStyleId,
    fixture.votes,
    { offsetMmX: 0, offsetMmY: 0 }
  );

  const ballotBuf = fs.readFileSync(fixture.blankBallotPath);
  const ballotPdf = Uint8Array.from(ballotBuf);

  const scale = 1;
  const basePages = pdfToImages(ballotPdf, { scale });
  const overlayPages = pdfToImages(overlayPdf, {
    background: 'transparent',
    scale,
  });

  const compositePages = iter(basePages)
    .zip(overlayPages)
    .map(([base, overlay]) => overlayImages(base.page, overlay.page));

  for await (const page of compositePages) {
    expect(toImageBuffer(page)).toMatchImageSnapshot();
  }
});

test('composites marks onto base ballot PDF', async () => {
  const fixture = find(
    vxGeneralElectionFixtures.fixtureSpecs,
    (spec) => spec.paperSize === 'letter' && spec.languageCode === 'en'
  );

  const election = safeParseElection(
    JSON.parse(fs.readFileSync(fixture.electionPath, 'utf8'))
  );

  const ballotBuf = fs.readFileSync(fixture.blankBallotPath);
  const baseBallotPdf = Uint8Array.from(ballotBuf);

  const compositePdf = await generateMarkOverlay(
    election.unsafeUnwrap(),
    fixture.ballotStyleId,
    fixture.votes,
    { offsetMmX: 0, offsetMmY: 0 },
    baseBallotPdf
  );

  const scale = 1;
  const compositePages = pdfToImages(compositePdf, { scale });

  for await (const page of compositePages) {
    expect(toImageBuffer(page.page)).toMatchImageSnapshot();
  }
});

test('marks a ballot with a vote for the third yesno option', async () => {
  // Uses the NH general election fixture which has question-a as a 3-option
  // yesno contest (Yes / No / Third Option). This verifies that a bubble mark
  // is correctly rendered for a third option beyond the standard Yes/No pair.
  const spec = nhGeneralElectionFixtures.fixtureSpecs[0];
  const { electionPath, ballotStyleId, blankBallotPath } = spec;

  const election = safeParseElection(
    JSON.parse(fs.readFileSync(electionPath, 'utf8'))
  ).unsafeUnwrap();

  const questionA = election.contests.find(
    (c) => c.id === 'question-a' && c.type === 'yesno'
  );
  // Confirm the fixture has the third option
  expect(questionA?.type).toEqual('yesno');
  if (questionA?.type !== 'yesno') return;
  expect(questionA.options).toHaveLength(3);

  const thirdOption = assertDefined(questionA.options[2]);
  const votes: typeof spec.votes = {
    ...spec.votes,
    'question-a': [thirdOption.id], // vote for 'third-option'
  };

  const baseBallotPdf = Uint8Array.from(fs.readFileSync(blankBallotPath));
  const markedBallotPdf = await generateMarkOverlay(
    election,
    ballotStyleId,
    votes,
    { offsetMmX: 0, offsetMmY: 0 },
    baseBallotPdf
  );

  const scale = 1;
  const markedPages = pdfToImages(markedBallotPdf, { scale });

  for await (const page of markedPages) {
    expect(toImageBuffer(page.page)).toMatchImageSnapshot();
  }
});

test.each([
  {
    label: 'a wide write-in area',
    fixtures: () => vxGeneralElectionFixtures.fixtureSpecs[0],
  },
  {
    label: 'a narrow write-in area',
    fixtures: () => nhStateGeneralElectionFixtures,
  },
])('keeps an overflowing write-in name inside $label', async ({ fixtures }) => {
  const { electionPath, ballotStyleId, votes, blankBallotPath } = fixtures();

  const election = safeParseElection(
    JSON.parse(fs.readFileSync(electionPath, 'utf8'))
  ).unsafeUnwrap();

  // A name long enough to overflow its write-in area and run into the
  // neighboring contest, which could be read as a mark there. 39 characters,
  // just under the 40-character limit VxMark enforces on write-in names.
  const longName = 'BARTHOLOMEW MONTGOMERY-WINTERBOTTOM III';
  const longWriteInVotes: VotesDict = Object.fromEntries(
    Object.entries(votes).map(([contestId, contestVotes]) => [
      contestId,
      (contestVotes ?? []).map((vote) =>
        typeof vote === 'string' || !vote.isWriteIn
          ? vote
          : { ...vote, name: longName }
      ) as Vote,
    ])
  );

  const baseBallotPdf = Uint8Array.from(fs.readFileSync(blankBallotPath));
  const markedBallotPdf = await generateMarkOverlay(
    election,
    ballotStyleId,
    longWriteInVotes,
    { offsetMmX: 0, offsetMmY: 0 },
    baseBallotPdf
  );

  for await (const page of pdfToImages(markedBallotPdf, { scale: 1 })) {
    expect(toImageBuffer(page.page)).toMatchImageSnapshot();
  }
});

test('marks the selected party in a straight party contest', async () => {
  const { electionPath, ballotStyleId, votes, blankBallotPath } =
    miGeneralElectionFixtures;

  const election = safeParseElection(
    JSON.parse(fs.readFileSync(electionPath, 'utf8'))
  ).unsafeUnwrap();

  expect(votes['straight-party-ticket']).toEqual(['0']);

  const baseBallotPdf = Uint8Array.from(fs.readFileSync(blankBallotPath));

  const markedBallotPdf = await generateMarkOverlay(
    election,
    ballotStyleId,
    votes,
    { offsetMmX: 0, offsetMmY: 0 },
    baseBallotPdf
  );

  const scale = 1;
  const markedPages = pdfToImages(markedBallotPdf, { scale });

  for await (const page of markedPages) {
    expect(toImageBuffer(page.page)).toMatchImageSnapshot();
  }
});
