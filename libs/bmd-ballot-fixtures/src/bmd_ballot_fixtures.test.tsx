import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { pdfToImages, toImageBuffer } from '@votingworks/image-utils';
import { iter } from '@votingworks/basics';
import { renderBmdBallotFixture } from './bmd_ballot_fixtures';

test('renderBmdBallotFixture', async () => {
  const pdf = await renderBmdBallotFixture({
    electionDefinition: electionFamousNames2021Fixtures.electionDefinition,
  });
  const pages = await iter(pdfToImages(pdf, { scale: 200 / 72 }))
    .map((page) => toImageBuffer(page.page))
    .toArray();
  expect(pages.length).toEqual(2);
  expect(pages[0]).toMatchImageSnapshot();
  expect(pages[1]).toMatchImageSnapshot();
});
