import fs from 'node:fs';
import { Buffer } from 'node:buffer';
import { expect, test } from 'vitest';

import {
  Election,
  GridLayout,
  GridPositionOption,
  safeParseElection,
  StraightPartyContest,
  VotesDict,
} from '@votingworks/types';
import { assertDefined, find, iter } from '@votingworks/basics';
import {
  overlayImages,
  pdfToImages,
  toImageBuffer,
} from '@votingworks/image-utils';

import { generateMarkOverlay } from './marking';
import { vxGeneralElectionFixtures } from './ballot_fixtures';

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

test('marks straight-party contest options', async () => {
  const fixture = find(
    vxGeneralElectionFixtures.fixtureSpecs,
    (spec) => spec.paperSize === 'letter' && spec.languageCode === 'en'
  );

  const baseElection = safeParseElection(
    JSON.parse(fs.readFileSync(fixture.electionPath, 'utf8'))
  ).unsafeUnwrap();

  const spContestId = 'straight-party-test';
  const partyA = baseElection.parties[0].id;
  const partyB = baseElection.parties[1].id;
  const spContest: StraightPartyContest = {
    id: spContestId,
    type: 'straight-party',
    title: 'Straight Party',
  };
  const gridPositionA: GridPositionOption = {
    type: 'option',
    sheetNumber: 1,
    side: 'front',
    column: 2,
    row: 2,
    contestId: spContestId,
    optionId: partyA,
  };
  const gridPositionB: GridPositionOption = {
    type: 'option',
    sheetNumber: 1,
    side: 'front',
    column: 2,
    row: 4,
    contestId: spContestId,
    optionId: partyB,
  };

  function makeElection(extraGridPositions: GridPositionOption[]): Election {
    return {
      ...baseElection,
      contests: [spContest, ...baseElection.contests],
      gridLayouts: assertDefined(baseElection.gridLayouts).map(
        (l): GridLayout =>
          l.ballotStyleId === fixture.ballotStyleId
            ? {
                ...l,
                gridPositions: [...l.gridPositions, ...extraGridPositions],
              }
            : l
      ),
    };
  }

  async function renderOverlay(
    election: Election,
    votes: VotesDict
  ): Promise<Uint8Array> {
    return generateMarkOverlay(election, fixture.ballotStyleId, votes, {
      offsetMmX: 0,
      offsetMmY: 0,
    });
  }

  async function renderImageBytes(pdf: Uint8Array): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const { page } of pdfToImages(pdf, {
      background: 'transparent',
      scale: 1,
    })) {
      chunks.push(Buffer.from(page.data));
    }
    return Buffer.concat(chunks);
  }

  const electionBoth = makeElection([gridPositionA, gridPositionB]);
  const electionOnlyA = makeElection([gridPositionA]);
  const electionOnlyB = makeElection([gridPositionB]);

  // Voting party A with both grid positions present should produce the same
  // rendered output as voting party A with only party A's grid position
  // present (i.e. party B's bubble is left blank), and vice versa for B.
  // This catches both "no bubble drawn" and "wrong bubble drawn" regressions.
  const bothVoteA = await renderImageBytes(
    await renderOverlay(electionBoth, { [spContestId]: [partyA] })
  );
  const onlyAvoteA = await renderImageBytes(
    await renderOverlay(electionOnlyA, { [spContestId]: [partyA] })
  );
  expect(bothVoteA.equals(onlyAvoteA)).toEqual(true);

  const bothVoteB = await renderImageBytes(
    await renderOverlay(electionBoth, { [spContestId]: [partyB] })
  );
  const onlyBvoteB = await renderImageBytes(
    await renderOverlay(electionOnlyB, { [spContestId]: [partyB] })
  );
  expect(bothVoteB.equals(onlyBvoteB)).toEqual(true);

  // Sanity check: voting A vs voting B does produce visibly different output
  // (bubbles at different rows).
  expect(bothVoteA.equals(bothVoteB)).toEqual(false);
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
