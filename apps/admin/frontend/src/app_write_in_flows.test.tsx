import userEvent from '@testing-library/user-event';
import { electionMinimalExhaustiveSampleFixtures } from '@votingworks/fixtures';
import { typedAs } from '@votingworks/basics';
import { fakeKiosk, hasTextAcrossElements } from '@votingworks/test-utils';
import fetchMock from 'fetch-mock';
import type {
  WriteInCandidateRecord,
  WriteInSummaryEntryAdjudicated,
} from '@votingworks/admin-backend';
import { VotingMethod } from '@votingworks/types';
import { screen, waitFor, within } from '../test/react_testing_library';
import { ApiMock, createApiMock } from '../test/helpers/api_mock';
import { buildApp } from '../test/helpers/build_app';
import { fileDataToCastVoteRecords } from '../test/util/cast_vote_records';
import { VxFiles } from './lib/converters';
import { buildSpecifiedManualTally } from '../test/helpers/build_manual_tally';
import {
  convertTalliesByPrecinctToFullManualTally,
  getEmptyManualTalliesByPrecinct,
} from './utils/manual_tallies';
import {
  getMockTempWriteInCandidate,
  getMockWriteInCandidate,
} from '../test/api_mock_data';

const nonOfficialAdjudicationSummaryMammal: WriteInSummaryEntryAdjudicated = {
  status: 'adjudicated',
  adjudicationType: 'write-in-candidate',
  contestId: 'zoo-council-mammal',
  candidateName: 'Chimera',
  candidateId: 'uuid',
  writeInCount: 1,
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

function mockWriteInCandidateRecord(
  contestId: string,
  name: string
): WriteInCandidateRecord {
  return {
    contestId,
    name,
    id: name.toLowerCase(),
    electionId: 'uuid',
  };
}

test('manual write-in data end-to-end test', async () => {
  const { electionDefinition, legacyPartial1CvrFile } =
    electionMinimalExhaustiveSampleFixtures;
  const { election } = electionDefinition;
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  apiMock.expectGetSystemSettings();
  apiMock.expectGetCastVoteRecords(
    await fileDataToCastVoteRecords(
      legacyPartial1CvrFile.asText(),
      electionDefinition
    )
  );
  apiMock.expectGetFullElectionManualTally();
  apiMock.expectGetCastVoteRecordFiles([]);
  apiMock.expectGetCastVoteRecordFileMode('test');
  const chimera = mockWriteInCandidateRecord('zoo-council-mammal', 'Chimera');
  apiMock.expectGetWriteInCandidates([chimera]);
  apiMock.expectGetWriteInSummaryAdjudicated([
    nonOfficialAdjudicationSummaryMammal,
  ]);
  renderApp();

  // navigate to manual data entry
  await apiMock.authenticateAsElectionManager(electionDefinition);

  userEvent.click(screen.getByText('Tally'));
  userEvent.click(await screen.findByText('Add Manually Entered Results'));

  userEvent.click(screen.getByText('Edit Results for Precinct 1'));

  // enter some official results for Precinct 1
  await screen.findByText('Manually Entered Results:');
  userEvent.type(
    screen.getByTestId('zoo-council-mammal-zebra-input').closest('input')!,
    '7'
  );
  userEvent.type(
    screen.getByTestId('zoo-council-mammal-kangaroo-input').closest('input')!,
    '3'
  );

  // add votes to the pre-adjudicated value
  const zooMammalCouncil = screen
    .getByText('Zoo Council - Mammal Party')
    .closest('div')!;
  userEvent.type(
    within(zooMammalCouncil).getByTestId('zoo-council-mammal-chimera-input'),
    '9'
  );

  // add a write-in to appear in the results
  userEvent.click(within(zooMammalCouncil).getByText('Add Write-In Candidate'));
  userEvent.type(
    within(zooMammalCouncil).getByTestId('zoo-council-mammal-write-in-input'),
    'Rapidash'
  );
  userEvent.click(within(zooMammalCouncil).getByText('Add'));
  userEvent.type(
    within(zooMammalCouncil).getByTestId(
      'zoo-council-mammal-temp-write-in-(Rapidash)-input'
    ),
    '5'
  );

  expect(
    within(zooMammalCouncil).getByTestId('zoo-council-mammal-numBallots')
      .textContent
  ).toEqual('8');

  // add a write-in for another race
  const zooFishCouncil = screen
    .getByText('Zoo Council - Fish Party')
    .closest('div')!;
  userEvent.click(within(zooFishCouncil).getByText('Add Write-In Candidate'));
  userEvent.type(
    within(zooFishCouncil).getByTestId('aquarium-council-fish-write-in-input'),
    'Relicanth'
  );
  userEvent.click(within(zooFishCouncil).getByText('Add'));
  userEvent.type(
    within(zooFishCouncil).getByTestId(
      'aquarium-council-fish-temp-write-in-(Relicanth)-input'
    ),
    '14'
  );

  // save results and then check index screen
  const expectedTempManualTally = buildSpecifiedManualTally(election, 8, {
    'zoo-council-mammal': {
      ballots: 8,
      officialOptionTallies: {
        zebra: 7,
        kangaroo: 3,
      },
      writeInOptionTallies: {
        chimera: {
          candidate: getMockWriteInCandidate('Chimera'),
          count: 9,
        },
        'temp-write-in-(Rapidash)': {
          candidate: getMockTempWriteInCandidate('Rapidash'),
          count: 5,
        },
      },
    },
    'aquarium-council-fish': {
      ballots: 7,
      writeInOptionTallies: {
        'temp-write-in-(Relicanth)': {
          candidate: getMockTempWriteInCandidate('Relicanth'),
          count: 14,
        },
      },
    },
  });
  const expectedManualTally = buildSpecifiedManualTally(election, 8, {
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
  apiMock.expectSetManualTally({
    precinctId: 'precinct-1',
    manualTally: expectedTempManualTally,
  });
  const talliesByPrecinct = getEmptyManualTalliesByPrecinct(election);
  talliesByPrecinct['precinct-1'] = expectedManualTally;
  apiMock.expectGetFullElectionManualTally(
    convertTalliesByPrecinctToFullManualTally(
      talliesByPrecinct,
      election,
      VotingMethod.Precinct,
      new Date()
    )
  );
  userEvent.click(screen.getByText('Save Results for Precinct 1'));
  const summaryTable = await screen.findByTestId('summary-data');
  const precinct1SummaryRow = within(summaryTable)
    .getByText('Precinct 1')
    .closest('tr')!;
  await waitFor(() => {
    expect(
      within(precinct1SummaryRow).getByTestId('numBallots').textContent
    ).toEqual('8');
  });

  // check our write-ins appear for Precinct 2
  const rapidash = mockWriteInCandidateRecord('zoo-council-mammal', 'Rapidash');
  const relicanth = mockWriteInCandidateRecord(
    'aquarium-council-fish',
    'Relicanth'
  );
  apiMock.expectGetWriteInCandidates([chimera, rapidash, relicanth]);
  userEvent.click(screen.getByText('Edit Results for Precinct 2'));
  screen.getByText('Chimera (write-in)');
  await screen.findByText('Rapidash (write-in)');
  screen.getByText('Relicanth (write-in)');

  // check our results appear properly if we navigate back to Precinct 1
  userEvent.click(screen.getByText('Tally'));
  userEvent.click(screen.getButton('Edit Manually Entered Results'));
  userEvent.click(screen.getButton('Edit Results for Precinct 1'));
  const zooMammalCouncil2 = screen
    .getByText('Zoo Council - Mammal Party')
    .closest('div')!;
  expect(
    within(zooMammalCouncil2)
      .getByTestId('zoo-council-mammal-chimera-input')
      .closest('input')!.value
  ).toEqual('9');
  expect(
    within(zooMammalCouncil2)
      .getByTestId('zoo-council-mammal-rapidash-input')
      .closest('input')!.value
  ).toEqual('5');

  // check that results are appropriately incorporated into the main report
  userEvent.click(screen.getByText('Reports'));
  userEvent.click(screen.getByText('Unofficial Full Election Tally Report'));
  const mainReportPreview = await screen.findByTestId('report-preview');
  within(mainReportPreview).getByText(
    'Unofficial Mammal Party Example Primary Election Tally Report'
  );
  const zooCouncilMammal = within(mainReportPreview).getByTestId(
    'results-table-zoo-council-mammal'
  );
  const zooCouncilFish = within(mainReportPreview).getByTestId(
    'results-table-aquarium-council-fish'
  );
  // added write-in candidates should not appear in the report
  expect(
    within(zooCouncilMammal).queryByText(/Chimera/)
  ).not.toBeInTheDocument();
  expect(
    within(zooCouncilMammal).queryByText(/Rapidash/)
  ).not.toBeInTheDocument();
  expect(
    within(zooCouncilFish).queryByText(/Relicanth/)
  ).not.toBeInTheDocument();
  // check totals are correct
  within(zooCouncilMammal).getByText(
    hasTextAcrossElements('Ballots Cast1018109')
  );
  within(zooCouncilMammal).getByText(hasTextAcrossElements('Zebra58361'));
  within(zooCouncilMammal).getByText(hasTextAcrossElements('Kangaroo42345'));
  within(zooCouncilMammal).getByText(hasTextAcrossElements('Write-In421456'));
  within(zooCouncilFish).getByText(hasTextAcrossElements('Ballots Cast077'));
  within(zooCouncilFish).getByText(hasTextAcrossElements('Write-In01414'));

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
  within(zooCouncilMammal2).getByText(hasTextAcrossElements('Chimera10'));
  within(zooCouncilMammal2).getByText(hasTextAcrossElements('Rapidash5'));
  within(zooCouncilFish2).getByText(hasTextAcrossElements('Relicanth14'));
});
