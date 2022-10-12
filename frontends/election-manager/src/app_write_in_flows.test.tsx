import React from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  electionMinimalExhaustiveSampleDefinition,
  electionMinimalExhaustiveSampleFixtures,
} from '@votingworks/fixtures';
import { MemoryCard, MemoryHardware, typedAs } from '@votingworks/utils';
import {
  advanceTimersAndPromises,
  fakeKiosk,
  hasTextAcrossElements,
} from '@votingworks/test-utils';
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
  jest.useFakeTimers();
});

afterEach(() => {
  delete window.kiosk;
});

test('manual write-in data end-to-end test', async () => {
  const backend = new ElectionManagerStoreMemoryBackend({
    electionDefinition: electionMinimalExhaustiveSampleDefinition,
  });
  await backend.addCastVoteRecordFile(
    new File(
      [electionMinimalExhaustiveSampleFixtures.partial1CvrFile.asBuffer()],
      'partial1.jsonl'
    )
  );
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  renderRootElement(<App card={card} hardware={hardware} />, { backend });

  // Navigate to manual data entry
  await authenticateWithElectionManagerCard(
    card,
    electionMinimalExhaustiveSampleDefinition
  );
  userEvent.click(screen.getByText('Tally'));
  userEvent.click(screen.getByText('Add Manually Entered Results'));
  userEvent.click(screen.getByText('Edit Precinct Results for Precinct 1'));

  // Navigate away, adjudicated a write-in, and return - to ensure the
  // page does not use stale data
  userEvent.click(await screen.findByText('Cancel'));
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

  userEvent.click(screen.getByText('Reports'));
});

test('availability of write-in tally report', async () => {
  // Start with transcribed, not adjudicated values
  const backend = new ElectionManagerStoreMemoryBackend({
    electionDefinition: electionMinimalExhaustiveSampleDefinition,
  });
  await backend.addCastVoteRecordFile(
    new File(
      [electionMinimalExhaustiveSampleFixtures.standardCvrFile.asBuffer()],
      'standard.jsonl'
    )
  );
  const writeIn1 = (
    await backend.loadWriteIns({
      contestId: 'zoo-council-mammal',
    })
  )[0];
  await backend.transcribeWriteIn(writeIn1.id, 'Chimera');
  const writeIn2 = (
    await backend.loadWriteIns({
      contestId: 'aquarium-council-fish',
    })
  )[0];
  await backend.transcribeWriteIn(writeIn2.id, 'Loch Ness');

  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  renderRootElement(<App card={card} hardware={hardware} />, { backend });

  // Before any adjudication, report should be empty
  await authenticateWithElectionManagerCard(
    card,
    electionMinimalExhaustiveSampleDefinition
  );
  userEvent.click(screen.getByText('Reports'));
  userEvent.click(screen.getByText('Unofficial Write-In Tally Report'));
  screen.getByText(
    /there are no write-in votes adjudicated to non-official candidates/
  );
  expect(screen.queryByText('Report Preview')).not.toBeInTheDocument();
  expect(screen.queryByText('Print Report')).not.toBeInTheDocument();

  // Navigate away and adjudicate one of the write-ins
  userEvent.click(screen.getByText('Reports'));
  await backend.adjudicateWriteInTranscription(
    'zoo-council-mammal',
    'Chimera',
    'Chimera'
  );

  await advanceTimersAndPromises(1);

  // We should now have a report for one of the parties, including one of the races
  userEvent.click(screen.getByText('Unofficial Write-In Tally Report'));
  await screen.findByText('Report Preview');
  screen.getAllByText(
    'Unofficial Mammal Party Example Primary Election Write-In Tally Report'
  );
  expect(
    screen.queryByText(
      'Unofficial Fish Party Example Primary Election Write-In Tally Report'
    )
  ).not.toBeInTheDocument();
  screen.getAllByTestId('results-table-zoo-council-mammal');
  expect(
    screen.queryByTestId('results-table-new-zoo-either')
  ).not.toBeInTheDocument();

  // Navigate away and adjudicate the other write-in
  userEvent.click(screen.getByText('Reports'));
  await backend.adjudicateWriteInTranscription(
    'aquarium-council-fish',
    'Loch Ness',
    'Loch Ness'
  );
  await advanceTimersAndPromises(1);

  // We should now have reports for both parties
  userEvent.click(screen.getByText('Unofficial Write-In Tally Report'));
  await screen.findByText('Report Preview');
  screen.getAllByText(
    'Unofficial Mammal Party Example Primary Election Write-In Tally Report'
  );
  await screen.findAllByText(
    'Unofficial Fish Party Example Primary Election Write-In Tally Report'
  );
  screen.getAllByTestId('results-table-zoo-council-mammal');
  screen.getAllByTestId('results-table-aquarium-council-fish');
});
