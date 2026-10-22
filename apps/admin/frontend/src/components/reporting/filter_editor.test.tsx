import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  readElectionCombinedBallotPrimaryDefinition,
  readElectionTwoPartyPrimaryDefinition,
} from '@votingworks/fixtures';
import { Tabulation } from '@votingworks/types';
import { userEvent } from '@testing-library/user-event';
import { renderInAppContext } from '../../../test/render_in_app_context.js';
import { FilterEditor } from './filter_editor.js';
import { screen, within } from '../../../test/react_testing_library.js';
import {
  type ApiMock,
  createApiMock,
} from '../../../test/helpers/mock_api_client.js';

const electionTwoPartyPrimaryDefinition =
  readElectionTwoPartyPrimaryDefinition();
const electionCombinedBallotPrimaryDefinition =
  readElectionCombinedBallotPrimaryDefinition();

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('precinct, voting method, ballot style selection (general flow)', async () => {
  const { election } = electionTwoPartyPrimaryDefinition;
  const onChange = vi.fn();

  apiMock.expectGetScannerBatches([]);
  apiMock.expectGetSystemSettings();
  renderInAppContext(
    <FilterEditor
      election={election}
      onChange={onChange}
      allowedFilters={['ballot-style', 'precinct', 'voting-method']}
    />,
    {
      apiMock,
    }
  );

  // Add filter row, precinct
  await userEvent.click(screen.getButton('Add Filter'));
  expect(onChange).not.toHaveBeenCalled();
  await userEvent.click(screen.getByLabelText('Select New Filter Type'));
  await userEvent.click(screen.getByText('Precinct'));
  expect(onChange).toHaveBeenNthCalledWith(1, { precinctIds: [] });
  await userEvent.click(screen.getByLabelText('Select Filter Values'));
  await userEvent.click(screen.getByText('Precinct 1'));
  expect(onChange).toHaveBeenNthCalledWith(2, { precinctIds: ['precinct-1'] });

  // Edit selections in filter row
  await userEvent.click(screen.getByLabelText('Select Filter Values'));
  await userEvent.click(screen.getByText('Precinct 2'));
  expect(onChange).toHaveBeenNthCalledWith(3, {
    precinctIds: ['precinct-1', 'precinct-2'],
  });
  await userEvent.click(screen.getByLabelText('Remove Precinct 1'));
  expect(onChange).toHaveBeenNthCalledWith(4, {
    precinctIds: ['precinct-2'],
  });

  // Add another filter row, voting method
  await userEvent.click(screen.getByText('Add Filter'));
  await userEvent.click(screen.getByLabelText('Select New Filter Type'));
  await userEvent.click(screen.getByText('Voting Method'));
  expect(onChange).toHaveBeenNthCalledWith(5, {
    precinctIds: ['precinct-2'],
    votingMethods: [],
  });
  await userEvent.click(
    within(
      screen.getByTestId('filter-editor-row-voting-method')
    ).getByLabelText('Select Filter Values')
  );
  await userEvent.click(screen.getByText('Absentee'));
  expect(onChange).toHaveBeenNthCalledWith(6, {
    precinctIds: ['precinct-2'],
    votingMethods: ['absentee'],
  });

  // Edit type of existing filter row, ballot style
  await userEvent.click(
    within(
      screen.getByTestId('filter-editor-row-voting-method')
    ).getByLabelText('Edit Filter Type')
  );
  await userEvent.click(screen.getByText('Ballot Style'));
  expect(onChange).toHaveBeenNthCalledWith(7, {
    precinctIds: ['precinct-2'],
    ballotStyleGroupIds: [],
  });
  await userEvent.click(
    within(screen.getByTestId('filter-editor-row-ballot-style')).getByLabelText(
      'Select Filter Values'
    )
  );
  screen.getByText('District 1 - Mammal');
  screen.getByText('District 1 - Fish');

  // Remove filter row
  await userEvent.click(
    within(screen.getByTestId('filter-editor-row-precinct')).getByLabelText(
      'Remove Filter'
    )
  );
  expect(onChange).toHaveBeenNthCalledWith(8, {
    ballotStyleGroupIds: [],
  });
});

test('scanner, batch selection', async () => {
  const { election } = electionTwoPartyPrimaryDefinition;
  const onChange = vi.fn();

  apiMock.expectGetScannerBatches([
    {
      batchId: '12345678-0000-0000-0000-000000000000',
      scannerId: 'scanner-1',
      label: 'Batch 1',
      electionId: 'id',
      startedAt: '2024-11-05T08:00:00.000Z',
    },
    {
      batchId: '23456789-0000-0000-0000-000000000000',
      scannerId: 'scanner-1',
      label: 'Batch 2',
      electionId: 'id',
      startedAt: '2024-11-05T09:03:00.000Z',
    },
    {
      batchId: '34567890-0000-0000-0000-000000000000',
      scannerId: 'scanner-2',
      label: 'Batch 3',
      electionId: 'id',
      startedAt: '2024-11-05T10:05:00.000Z',
    },
  ]);
  apiMock.expectGetSystemSettings();
  renderInAppContext(
    <FilterEditor
      election={election}
      onChange={onChange}
      allowedFilters={['scanner', 'batch']}
    />,
    {
      apiMock,
    }
  );

  // add scanner filter
  await userEvent.click(screen.getButton('Add Filter'));
  await userEvent.click(screen.getByLabelText('Select New Filter Type'));
  await userEvent.click(screen.getByText('Scanner'));
  expect(onChange).toHaveBeenNthCalledWith(1, { scannerIds: [] });
  await userEvent.click(screen.getByLabelText('Select Filter Values'));
  await screen.findByText('scanner-1'); // list populates after query completes
  screen.getByText('scanner-2');
  await userEvent.click(screen.getByText('scanner-1'));
  expect(onChange).toHaveBeenNthCalledWith(2, { scannerIds: ['scanner-1'] });

  // switch to batch filter
  await userEvent.click(screen.getByLabelText('Edit Filter Type'));
  await userEvent.click(screen.getByText('Batch'));
  expect(onChange).toHaveBeenNthCalledWith(3, { batchIds: [] });
  await userEvent.click(screen.getByLabelText('Select Filter Values'));
  screen.getByText('Scanner scanner-1, Batch 1');
  screen.getByText('Scanner scanner-1, Batch 2');
  screen.getByText('Scanner scanner-2, Batch 3');
  await userEvent.click(screen.getByText('Scanner scanner-1, Batch 1'));
  expect(onChange).toHaveBeenNthCalledWith(4, {
    batchIds: ['12345678-0000-0000-0000-000000000000'],
  });
});

test('party selection', async () => {
  const { election } = electionTwoPartyPrimaryDefinition;
  const onChange = vi.fn();

  apiMock.expectGetScannerBatches([]);
  apiMock.expectGetSystemSettings();
  renderInAppContext(
    <FilterEditor
      election={election}
      onChange={onChange}
      allowedFilters={['party']}
    />,
    {
      apiMock,
    }
  );

  // add scanner filter
  await userEvent.click(screen.getButton('Add Filter'));
  await userEvent.click(screen.getByLabelText('Select New Filter Type'));
  await userEvent.click(screen.getByText('Party'));
  expect(onChange).toHaveBeenNthCalledWith(1, { partyIds: [] });
  await userEvent.click(screen.getByLabelText('Select Filter Values'));
  screen.getByText('Mammal');
  screen.getByText('Fish');
  expect(screen.queryByText('No Party')).toBeNull();
  await userEvent.click(screen.getByText('Mammal'));
  expect(onChange).toHaveBeenNthCalledWith(2, { partyIds: ['0'] });
});

test('combined ballot primary party selection includes "No Party"', async () => {
  const { election } = electionCombinedBallotPrimaryDefinition;
  const onChange = vi.fn();

  apiMock.expectGetScannerBatches([]);
  apiMock.expectGetSystemSettings();
  renderInAppContext(
    <FilterEditor
      election={election}
      onChange={onChange}
      allowedFilters={['party']}
    />,
    {
      apiMock,
    }
  );

  await userEvent.click(screen.getButton('Add Filter'));
  await userEvent.click(screen.getByLabelText('Select New Filter Type'));
  await userEvent.click(screen.getByText('Party'));
  expect(onChange).toHaveBeenNthCalledWith(1, { partyIds: [] });
  await userEvent.click(screen.getByLabelText('Select Filter Values'));
  screen.getByText('Democratic');
  screen.getByText('Republican');
  screen.getByText('Libertarian');
  await userEvent.click(screen.getByText('No Party'));
  expect(onChange).toHaveBeenNthCalledWith(2, {
    partyIds: [Tabulation.NO_PARTY_ID],
  });
});

test('adjudication status selection', async () => {
  const { election } = electionTwoPartyPrimaryDefinition;
  const onChange = vi.fn();

  apiMock.expectGetScannerBatches([]);
  apiMock.expectGetSystemSettings();
  renderInAppContext(
    <FilterEditor
      election={election}
      onChange={onChange}
      allowedFilters={['adjudication-status']}
    />,
    {
      apiMock,
    }
  );

  // add adjudication status filter
  await userEvent.click(screen.getButton('Add Filter'));
  await userEvent.click(screen.getByLabelText('Select New Filter Type'));
  await userEvent.click(screen.getByText('Adjudication Status'));
  expect(onChange).toHaveBeenNthCalledWith(1, { adjudicationFlags: [] });
  await userEvent.click(screen.getByLabelText('Select Filter Values'));
  screen.getByText('Blank Ballot');
  screen.getByText('Overvote');
  screen.getByText('Undervote');
  screen.getByText('Write-In');
  expect(screen.queryByText('Crossover Vote')).toBeNull();
  await userEvent.click(screen.getByText('Blank Ballot'));
  expect(onChange).toHaveBeenNthCalledWith(2, {
    adjudicationFlags: ['isBlank'],
  });
});

test('adjudication status selection includes "Crossover Vote" in combined ballot primary', async () => {
  const { election } = readElectionCombinedBallotPrimaryDefinition();
  const onChange = vi.fn();

  apiMock.expectGetScannerBatches([]);
  apiMock.expectGetSystemSettings();
  renderInAppContext(
    <FilterEditor
      election={election}
      onChange={onChange}
      allowedFilters={['adjudication-status']}
    />,
    {
      apiMock,
    }
  );

  await userEvent.click(screen.getButton('Add Filter'));
  await userEvent.click(screen.getByLabelText('Select New Filter Type'));
  await userEvent.click(screen.getByText('Adjudication Status'));
  await userEvent.click(screen.getByLabelText('Select Filter Values'));
  await userEvent.click(screen.getByText('Crossover Vote'));
  expect(onChange).toHaveBeenLastCalledWith({
    adjudicationFlags: ['hasCrossoverVote'],
  });
});

test('reporting status filter', async () => {
  const { election } = electionTwoPartyPrimaryDefinition;
  const onChange = vi.fn();

  apiMock.expectGetScannerBatches([]);
  apiMock.expectGetSystemSettings();
  renderInAppContext(
    <FilterEditor
      election={election}
      onChange={onChange}
      allowedFilters={['reporting-status']}
    />,
    {
      apiMock,
    }
  );

  await userEvent.click(screen.getButton('Add Filter'));
  await userEvent.click(screen.getByLabelText('Select New Filter Type'));
  await userEvent.click(screen.getByText('Reporting Status'));
  expect(onChange).toHaveBeenNthCalledWith(1, { reportingStatus: undefined });
  await userEvent.click(screen.getByLabelText('Select Filter Values'));
  screen.getByText('Counted');
  await userEvent.click(screen.getByText('Not Counted'));
  expect(onChange).toHaveBeenNthCalledWith(2, {
    reportingStatus: 'notCounted',
  });

  // only one status can be selected; choosing another replaces it
  await userEvent.click(screen.getByLabelText('Select Filter Values'));
  await userEvent.click(screen.getByText('Counted'));
  expect(onChange).toHaveBeenNthCalledWith(3, {
    reportingStatus: 'counted',
  });
});

test('district filter', async () => {
  const { election } = electionTwoPartyPrimaryDefinition;
  const onChange = vi.fn();

  apiMock.expectGetScannerBatches([]);
  apiMock.expectGetSystemSettings();
  renderInAppContext(
    <FilterEditor
      election={election}
      onChange={onChange}
      allowedFilters={['district']}
    />,
    {
      apiMock,
    }
  );

  // add adjudication status filter
  await userEvent.click(screen.getButton('Add Filter'));
  await userEvent.click(screen.getByLabelText('Select New Filter Type'));
  await userEvent.click(screen.getByText('District'));
  expect(onChange).toHaveBeenNthCalledWith(1, { districtIds: [] });
  await userEvent.click(screen.getByLabelText('Select Filter Values'));
  await userEvent.click(screen.getByText('District 1'));
  expect(onChange).toHaveBeenNthCalledWith(2, {
    districtIds: ['district-1'],
  });
});

test('polling place filter', async () => {
  const { election } = electionTwoPartyPrimaryDefinition;
  const onChange = vi.fn();

  apiMock.expectGetScannerBatches([]);
  apiMock.expectGetSystemSettings();
  renderInAppContext(
    <FilterEditor
      election={election}
      onChange={onChange}
      allowedFilters={['polling-place']}
    />,
    {
      apiMock,
    }
  );

  await userEvent.click(screen.getButton('Add Filter'));
  await userEvent.click(screen.getByLabelText('Select New Filter Type'));
  await userEvent.click(screen.getByText('Polling Place'));
  expect(onChange).toHaveBeenNthCalledWith(1, { pollingPlaceIds: [] });
  await userEvent.click(screen.getByLabelText('Select Filter Values'));
  // labeled with the polling place type to disambiguate places that share a
  // name with their precinct
  await userEvent.click(screen.getByText('Precinct 1 (Election Day)'));
  expect(onChange).toHaveBeenNthCalledWith(2, {
    pollingPlaceIds: ['precinct-1-polling-place'],
  });
});

test('can cancel adding a filter', async () => {
  const { election } = electionTwoPartyPrimaryDefinition;
  const onChange = vi.fn();

  apiMock.expectGetScannerBatches([]);
  apiMock.expectGetSystemSettings();
  renderInAppContext(
    <FilterEditor
      election={election}
      onChange={onChange}
      allowedFilters={['precinct']}
    />,
    {
      apiMock,
    }
  );

  await userEvent.click(screen.getButton('Add Filter'));
  await userEvent.click(screen.getByLabelText('Cancel Add Filter'));
  screen.getByText('Add Filter');
  expect(onChange).not.toHaveBeenCalled();
});
