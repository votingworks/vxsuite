import fs from 'node:fs';
import { expect, test } from 'vitest';

import { safeParseElection } from '@votingworks/types';
import { assert, find, iter } from '@votingworks/basics';
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

  const overlayStream = generateMarkOverlay(
    election.unsafeUnwrap(),
    fixture.ballotStyleId,
    fixture.votes,
    { offsetMmX: 0, offsetMmY: 0 }
  );

  const overlayPdf = await new Promise<Uint8Array>((resolve, reject) => {
    overlayStream
      .on('readable', () => {
        try {
          const bufferSize = 100 * 1024;
          const res = overlayStream.read(bufferSize);
          assert(typeof res !== 'string');
          resolve(Uint8Array.from(res));
        } catch (err) {
          reject(err);
        }
      })
      .on('error', reject);
  });

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
