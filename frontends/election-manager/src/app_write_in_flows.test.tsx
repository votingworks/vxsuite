import React from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  electionMinimalExhaustiveSampleDefinition,
  electionMinimalExhaustiveSampleFixtures,
} from '@votingworks/fixtures';
import { MemoryCard, MemoryHardware, typedAs } from '@votingworks/utils';
import { fakeKiosk, hasTextAcrossElements } from '@votingworks/test-utils';
import fetchMock from 'fetch-mock';
import { renderRootElement } from '../test/render_in_app_context';
import { authenticateWithElectionManagerCard } from '../test/util/authenticate';
import { App } from './app';
import { ElectionManagerStoreMemoryBackend } from './lib/backends';
import { VxFiles } from './lib/converters';
import { MachineConfig } from './config/types';

let mockKiosk!: jest.Mocked<KioskBrowser.Kiosk>;

beforeEach(() => {
  mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;
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
});

afterEach(() => {
  delete window.kiosk;
});

test('manual write-in data end-to-end test', async () => {
  // Set up an an existing adjudicated value
  const backend = new ElectionManagerStoreMemoryBackend({
    electionDefinition: electionMinimalExhaustiveSampleDefinition,
  });
  await backend.addCastVoteRecordFile(
    new File(
      [electionMinimalExhaustiveSampleFixtures.partial1CvrFile.asBuffer()],
      'partial1.jsonl'
    )
  );
  const writeIn = (
    await backend.loadWriteIns({
      contestId: 'zoo-council-mammal',
    })
  )[0];
  await backend.transcribeWriteIn(writeIn.id, 'Chimera');
  await backend.adjudicateWriteInTranscription(
    'zoo-council-mammal',
    'Chimera',
    'Chimera'
  );
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();

  renderRootElement(<App card={card} hardware={hardware} />, { backend });

  await authenticateWithElectionManagerCard(
    card,
    electionMinimalExhaustiveSampleDefinition
  );
  userEvent.click(screen.getByText('Tally'));
  userEvent.click(screen.getByText('Add Manually Entered Results'));
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

  // Add votes to the the pre-adjudicated value
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
  ).toEqual('18');

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
  ).toEqual('15');
  expect(
    within(precinct2SummaryRow).getByTestId('numBallots').textContent
  ).toEqual('5');

  // Check that results are appropriately incorporated into the main report
  userEvent.click(screen.getByText('Reports'));
  userEvent.click(screen.getByText('Unofficial Full Election Tally Report'));
  const printableArea = await screen.findByTestId('printable-area');
  within(printableArea).getByText(
    'Unofficial Mammal Party Example Primary Election Tally Report'
  );
  const zooCouncilMammal = within(printableArea).getByTestId(
    'results-table-zoo-council-mammal'
  );
  const zooCouncilFish = within(printableArea).getByTestId(
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
  const printableArea2 = await screen.findByTestId('printable-area');
  within(printableArea2).getByText(
    'Unofficial Mammal Party Example Primary Election Write-In Tally Report'
  );
  const zooCouncilMammal2 = within(printableArea2).getByTestId(
    'results-table-zoo-council-mammal'
  );
  const zooCouncilFish2 = within(printableArea2).getByTestId(
    'results-table-aquarium-council-fish'
  );
  within(zooCouncilMammal2).getByText(hasTextAcrossElements('Chimera10'));
  within(zooCouncilMammal2).getByText(hasTextAcrossElements('Rapidash20'));
  within(zooCouncilFish2).getByText(hasTextAcrossElements('Relicanth14'));
});
