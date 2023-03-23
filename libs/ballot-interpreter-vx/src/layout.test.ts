import { iter } from '@votingworks/basics';
import { BallotMetadata, BallotType } from '@votingworks/types';
import * as fs from 'fs';
import * as choctaw2020General from '../test/fixtures/choctaw-county-2020-general-election';
import { interpretMultiPagePdfTemplate } from './layout';

test('interpretMultiPagePdfTemplate', async () => {
  const { electionDefinition } = choctaw2020General;
  const ballotPdfData = fs.readFileSync(
    choctaw2020General.district5Pdf.filePath()
  );
  const metadata: BallotMetadata = {
    ballotStyleId: '5',
    electionHash: electionDefinition.electionHash,
    ballotType: BallotType.Standard,
    precinctId: '6522',
    locales: { primary: 'en-US' },
    isTestMode: true,
  };

  const layoutsWithImages = await iter(
    interpretMultiPagePdfTemplate({
      electionDefinition,
      ballotPdfData,
      metadata,
    })
  ).toArray();

  expect(layoutsWithImages).toHaveLength(2);
  expect(
    layoutsWithImages[0].ballotPageLayout.contests.map(
      (contest) => contest.contestId
    )
  ).toEqual([
    '775020896',
    '775020897',
    '775020892',
    '775020890',
    '775021420',
    '775021421',
  ]);
  expect(
    layoutsWithImages[1].ballotPageLayout.contests.map(
      (contest) => contest.contestId
    )
  ).toEqual(['750000261', '750000262', '750000263']);
});
