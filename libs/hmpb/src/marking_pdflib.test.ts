import fs from 'node:fs';
import { expect, test } from 'vitest';

import { safeParseElection } from '@votingworks/types';
import { find } from '@votingworks/basics';
import { pdfToImages, toImageBuffer } from '@votingworks/image-utils';

import { generateMarkOverlay } from './marking_pdflib';
import { vxGeneralElectionFixtures } from './ballot_fixtures';

const fixture = find(
  vxGeneralElectionFixtures.fixtureSpecs,
  (spec) => spec.paperSize === 'letter' && spec.languageCode === 'en'
);

const election = safeParseElection(
  JSON.parse(fs.readFileSync(fixture.electionPath, 'utf8'))
);

test('places marks consistently - marked ballot', async () => {
  const ballotBuf = fs.readFileSync(fixture.blankBallotPath);
  const ballotPdf = new Uint8Array(
    ballotBuf.buffer,
    ballotBuf.byteOffset,
    ballotBuf.length
  );

  const markedPdf = await generateMarkOverlay(
    election.unsafeUnwrap(),
    fixture.ballotStyleId,
    fixture.votes,
    { offsetMmX: 0, offsetMmY: 0 },
    ballotPdf
  );

  const scale = 1;
  const overlayPages = pdfToImages(markedPdf, {
    scale,
  });

  for await (const { page } of overlayPages) {
    expect(toImageBuffer(page)).toMatchImageSnapshot();
  }
});

test('places marks consistently - mark overlay only', async () => {
  const markOverlayPdf = await generateMarkOverlay(
    election.unsafeUnwrap(),
    fixture.ballotStyleId,
    fixture.votes,
    { offsetMmX: 0, offsetMmY: 0 }
  );

  const scale = 1;
  const overlayPages = pdfToImages(markOverlayPdf, {
    scale,
  });

  for await (const { page } of overlayPages) {
    expect(toImageBuffer(page)).toMatchImageSnapshot();
  }
});
