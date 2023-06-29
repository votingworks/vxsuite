import userEvent from '@testing-library/user-event';
import { electionMinimalExhaustiveSampleFixtures } from '@votingworks/fixtures';
import { typedAs } from '@votingworks/basics';
import { fakeKiosk, hasTextAcrossElements } from '@votingworks/test-utils';
import fetchMock from 'fetch-mock';
import type { WriteInAdjudicatedTally } from '@votingworks/admin-backend';
import { VotingMethod } from '@votingworks/types';
import {
  convertTalliesByPrecinctToFullManualTally,
  getEmptyManualTalliesByPrecinct,
  buildSpecificManualTally,
} from '@votingworks/utils';
import { screen, within } from '../test/react_testing_library';
import { ApiMock, createApiMock } from '../test/helpers/api_mock';
import { buildApp } from '../test/helpers/build_app';
import { VxFiles } from './lib/converters';
import { getMockWriteInCandidate } from '../test/api_mock_data';
import { expectReportsScreenCardCountQueries } from '../test/helpers/api_expect_helpers';

const nonOfficialAdjudicationSummaryMammal: WriteInAdjudicatedTally = {
  status: 'adjudicated',
  adjudicationType: 'write-in-candidate',
  contestId: 'zoo-council-mammal',
  candidateName: 'Chimera',
  candidateId: 'uuid',
  tally: 1,
};

let mockKiosk!: jest.Mocked<KioskBrowser.Kiosk>;
let apiMock: ApiMock;

beforeEach(() => {
  mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;

  apiMock = createApiMock();
  // Set default auth status to logged out.
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'machine_locked',
  });
  apiMock.expectGetMachineConfig();

  fetchMock.reset();
  fetchMock.get(
    '/convert/tallies/files',
    typedAs<VxFiles>({
      inputFiles: [{ name: 'name' }, { name: 'name' }],
      outputFiles: [{ name: 'name' }],
    })
  );
  fetchMock.delete('/admin/write-ins/cvrs', { body: { status: 'ok ' } });
  jest.useFakeTimers();
});

afterEach(() => {
  delete window.kiosk;
  apiMock.assertComplete();
});

test('manually added write-in results appears in reports', async () => {
  const { electionDefinition } = electionMinimalExhaustiveSampleFixtures;
  const { election } = electionDefinition;
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  apiMock.expectGetSystemSettings();
  apiMock.expectGetCastVoteRecords([]);
  apiMock.expectGetCastVoteRecordFileMode('test');
  apiMock.expectGetWriteInTalliesAdjudicated([
    nonOfficialAdjudicationSummaryMammal,
  ]);
  expectReportsScreenCardCountQueries({
    apiMock,
    isPrimary: true,
  });
  apiMock.expectGetScannerBatches([]);
  apiMock.expectGetManualResultsMetadata([]);

  // mock manual data
  const precinct1ManualTally = buildSpecificManualTally(election, 8, {
    'zoo-council-mammal': {
      ballots: 8,
      officialOptionTallies: {
        zebra: 3,
        kangaroo: 3,
      },
      writeInOptionTallies: {
        chimera: {
          candidate: getMockWriteInCandidate('Chimera'),
          count: 9,
        },
        rapidash: {
          candidate: getMockWriteInCandidate('Rapidash'),
          count: 5,
        },
      },
    },
    'aquarium-council-fish': {
      ballots: 7,
      writeInOptionTallies: {
        relicanth: {
          candidate: getMockWriteInCandidate('Relicanth'),
          count: 14,
        },
      },
    },
  });
  const talliesByPrecinct = getEmptyManualTalliesByPrecinct(election);
  talliesByPrecinct['precinct-1'] = precinct1ManualTally;
  apiMock.expectGetFullElectionManualTally(
    convertTalliesByPrecinctToFullManualTally(
      talliesByPrecinct,
      election,
      VotingMethod.Precinct,
      new Date()
    )
  );

  renderApp();
  await apiMock.authenticateAsElectionManager(electionDefinition);

  // check that results are appropriately incorporated into scatter report
  userEvent.click(screen.getByText('Reports'));
  userEvent.click(screen.getByText('Unofficial Write-In Tally Report'));
  const writeInReportPreview = await screen.findByTestId('report-preview');
  within(writeInReportPreview).getByText(
    'Unofficial Mammal Party Example Primary Election Write-In Tally Report'
  );
  const zooCouncilMammal2 = within(writeInReportPreview).getByTestId(
    'results-table-zoo-council-mammal'
  );
  const zooCouncilFish2 = within(writeInReportPreview).getByTestId(
    'results-table-aquarium-council-fish'
  );
  within(zooCouncilMammal2).getByText(hasTextAcrossElements('Chimera9'));
  within(zooCouncilMammal2).getByText(hasTextAcrossElements('Rapidash5'));
  within(zooCouncilFish2).getByText(hasTextAcrossElements('Relicanth14'));
});
