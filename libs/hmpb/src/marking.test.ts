import fs from 'node:fs';
import { expect, test } from 'vitest';

import { safeParseElection } from '@votingworks/types';
import { find, iter } from '@votingworks/basics';
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
