import {
  getEmptyCardCounts,
  getEmptyElectionResults,
} from '@votingworks/utils';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import {
  AdminTallyReportByParty,
  AdminTallyReportByPartyProps,
} from '@votingworks/ui';
import { tmpNameSync } from 'tmp';
import { renderToPdf } from './render';

const { electionDefinition } = electionFamousNames2021Fixtures;
const { election } = electionDefinition;

const testReportProps: AdminTallyReportByPartyProps = {
  title: 'North Lincoln Tally Report',
  isOfficial: false,
  isTest: false,
  isForLogicAndAccuracyTesting: false,
  electionDefinition,
  tallyReportResults: {
    contestIds: election.contests.map((c) => c.id),
    scannedResults: getEmptyElectionResults(election, true),
    hasPartySplits: false,
    cardCounts: getEmptyCardCounts(),
  },
  testId: 'test',
  generatedAtTime: new Date('2023-09-06T21:45:08'),
};

test('rendered tally report matches snapshot', async () => {
  const pdfPath = tmpNameSync();
  await renderToPdf(<AdminTallyReportByParty {...testReportProps} />, pdfPath);

  await expect(pdfPath).toMatchPdfSnapshot();
});
