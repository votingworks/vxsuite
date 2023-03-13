import userEvent from '@testing-library/user-event';
import { electionMinimalExhaustiveSampleFixtures } from '@votingworks/fixtures';
import { typedAs } from '@votingworks/basics';
import { fakeKiosk, hasTextAcrossElements } from '@votingworks/test-utils';
import fetchMock from 'fetch-mock';
import { Admin } from '@votingworks/api';
import { screen, within } from '../test/react_testing_library';
import { ApiMock, createApiMock } from '../test/helpers/api_mock';
import { buildApp } from '../test/helpers/build_app';
import { fileDataToCastVoteRecords } from '../test/util/cast_vote_records';
import { VxFiles } from './lib/converters';
import { MachineConfig } from './config/types';

const nonOfficialAdjudicationSummaryMammal: Admin.WriteInSummaryEntryAdjudicated =
  {
    status: 'adjudicated',
    contestId: 'zoo-council-mammal',
    transcribedValue: 'Chimera',
    writeInCount: 1,
    writeInAdjudication: {
      id: 'some',
      contestId: 'zoo-council-mammal',
      transcribedValue: 'Chimera',
      adjudicatedValue: 'Chimera',
    },
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

  fetchMock.reset();
  fetchMock.get(
    '/convert/tallies/files',
    typedAs<VxFiles>({
      inputFiles: [{ name: 'name' }, { name: 'name' }],
      outputFiles: [{ name: 'name' }],
    })
  );
  fetchMock.get(
    '/machine-config',
    typedAs<MachineConfig>({
      machineId: '0000',
      codeVersion: 'TEST',
    })
  );
  fetchMock.delete('/admin/write-ins/cvrs', { body: { status: 'ok ' } });
  jest.useFakeTimers();
});

afterEach(() => {
  delete window.kiosk;
  apiMock.assertComplete();
});

test('manual write-in data end-to-end test', async () => {
  const { electionDefinition, partial1CvrFile } =
    electionMinimalExhaustiveSampleFixtures;
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  apiMock.expectGetCastVoteRecords(
    await fileDataToCastVoteRecords(
      partial1CvrFile.asText(),
      electionDefinition
    )
  );
  apiMock.expectGetCastVoteRecordFiles([]);
  apiMock.expectGetCastVoteRecordFileMode(Admin.CvrFileMode.Test);
  apiMock.expectGetOfficialPrintedBallots([]);
  renderApp();

  // Navigate to manual data entry
  await apiMock.authenticateAsElectionManager(electionDefinition);

  userEvent.click(screen.getByText('Tally'));
  userEvent.click(await screen.findByText('Add Manually Entered Results'));

  apiMock.expectGetWriteInSummaryAdjudicated([
    nonOfficialAdjudicationSummaryMammal,
  ]);
  userEvent.click(screen.getByText('Edit Precinct Results for Precinct 1'));

  // Enter some official results for Precinct 1
  await screen.findByText('Manually Entered Precinct Results:');
  userEvent.type(
    screen.getByTestId('zoo-council-mammal-zebra-input').closest('input')!,
    '7'
  );
  userEvent.type(
    screen.getByTestId('zoo-council-mammal-kangaroo-input').closest('input')!,
    '3'
  );

  // Add votes to the pre-adjudicated value
  const zooMammalCouncil = screen
    .getByText('Zoo Council - Mammal Party')
    .closest('div')!;
  userEvent.type(
    within(zooMammalCouncil).getByTestId(
      'zoo-council-mammal-write-in-(Chimera)-input'
    ),
    '9'
  );

  // Add a write-in to appear in the results
  userEvent.click(within(zooMammalCouncil).getByText('Add Write-In Candidate'));
  userEvent.type(
    within(zooMammalCouncil).getByTestId('zoo-council-mammal-write-in-input'),
    'Rapidash'
  );
  userEvent.click(within(zooMammalCouncil).getByText('Add'));
  userEvent.type(
    within(zooMammalCouncil).getByTestId(
      'zoo-council-mammal-write-in-(Rapidash)-manual-input'
    ),
    '5'
  );

  // Add a write-in we'll remove later
  userEvent.click(within(zooMammalCouncil).getByText('Add Write-In Candidate'));
  userEvent.type(
    within(zooMammalCouncil).getByTestId('zoo-council-mammal-write-in-input'),
    'Slakoth'
  );
  userEvent.click(within(zooMammalCouncil).getByText('Add'));
  userEvent.type(
    within(zooMammalCouncil).getByTestId(
      'zoo-council-mammal-write-in-(Slakoth)-manual-input'
    ),
    '9'
  );
  expect(
    within(zooMammalCouncil).getByTestId('zoo-council-mammal-numBallots')
      .textContent
  ).toEqual('11');

  // Add a write-in to another race
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
      'aquarium-council-fish-write-in-(Relicanth)-manual-input'
    ),
    '14'
  );

  // Save results and check index screen
  userEvent.click(screen.getByText('Save Precinct Results for Precinct 1'));
  let summaryTable = await screen.findByTestId('summary-data');
  let precinct1SummaryRow = within(summaryTable)
    .getByText('Precinct 1')
    .closest('tr')!;
  expect(
    within(precinct1SummaryRow).getByTestId('numBallots').textContent
  ).toEqual('11');

  // Check our write-ins appear for precinct 2
  userEvent.click(screen.getByText('Edit Precinct Results for Precinct 2'));
  screen.getByText('Chimera (write-in)');
  screen.getByText('Rapidash (write-in)');
  screen.getByText('Slakoth (write-in)');
  screen.getByText('Relicanth (write-in)');

  // Add results for one write-in for precinct 2
  userEvent.type(
    screen.getByTestId('zoo-council-mammal-write-in-(Rapidash)-manual-input'),
    '15'
  );

  // Remove one of the write-in candidates in precinct 2 screen
  userEvent.click(
    within(
      screen.getByTestId('zoo-council-mammal-write-in-(Slakoth)-manual')
    ).getByText('Remove')
  );
  userEvent.click(screen.getByText('Remove Candidate'));

  // Save results and confirm index screen has updated appropriately
  userEvent.click(screen.getByText('Save Precinct Results for Precinct 2'));
  summaryTable = await screen.findByTestId('summary-data');
  precinct1SummaryRow = within(summaryTable)
    .getByText('Precinct 1')
    .closest('tr')!;
  const precinct2SummaryRow = within(summaryTable)
    .getByText('Precinct 2')
    .closest('tr')!;
  // Here we're confirming that removing a candidate from one precinct screen
  // alters the candidates and results from another precinct
  expect(
    within(precinct1SummaryRow).getByTestId('numBallots').textContent
  ).toEqual('8');
  expect(
    within(precinct2SummaryRow).getByTestId('numBallots').textContent
  ).toEqual('5');

  // Check that results are appropriately incorporated into the main report
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
  // Added write-in candidates should not appear in the report
  expect(
    within(zooCouncilMammal).queryByText(/Chimera/)
  ).not.toBeInTheDocument();
  expect(
    within(zooCouncilMammal).queryByText(/Rapidash/)
  ).not.toBeInTheDocument();
  expect(
    within(zooCouncilFish).queryByText(/Relicanth/)
  ).not.toBeInTheDocument();
  // Check totals are correct
  within(zooCouncilMammal).getByText(
    hasTextAcrossElements('Ballots Cast10113114')
  );
  within(zooCouncilMammal).getByText(hasTextAcrossElements('Zebra58765'));
  within(zooCouncilMammal).getByText(hasTextAcrossElements('Kangaroo42345'));
  within(zooCouncilMammal).getByText(hasTextAcrossElements('Write-In422971'));
  within(zooCouncilFish).getByText(hasTextAcrossElements('Ballots Cast077'));
  within(zooCouncilFish).getByText(hasTextAcrossElements('Write-In01414'));

  // Check that results are appropriately incorporated into scatter report
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
  within(zooCouncilMammal2).getByText(hasTextAcrossElements('Rapidash20'));
  within(zooCouncilFish2).getByText(hasTextAcrossElements('Relicanth14'));
});
