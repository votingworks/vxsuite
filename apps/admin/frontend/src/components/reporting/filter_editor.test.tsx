import { electionMinimalExhaustiveSampleDefinition } from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { renderInAppContext } from '../../../test/render_in_app_context';
import { FilterEditor } from './filter_editor';
import { screen, within } from '../../../test/react_testing_library';
import { ApiMock, createApiMock } from '../../../test/helpers/api_mock';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('general flow + precinct, voting method, ballot style selection', () => {
  const { election } = electionMinimalExhaustiveSampleDefinition;
  const onChange = jest.fn();

  apiMock.expectGetScannerBatches([]);
  renderInAppContext(<FilterEditor election={election} onChange={onChange} />, {
    apiMock,
  });

  // Add filter row, precinct
  userEvent.click(screen.getButton('Add Filter'));
  expect(onChange).not.toHaveBeenCalled();
  userEvent.click(screen.getByLabelText('Select New Filter Type'));
  userEvent.click(screen.getByText('Precinct'));
  expect(onChange).toHaveBeenNthCalledWith(1, { precinctIds: [] });
  userEvent.click(screen.getByLabelText('Select Filter Values'));
  userEvent.click(screen.getByText('Precinct 1'));
  expect(onChange).toHaveBeenNthCalledWith(2, { precinctIds: ['precinct-1'] });

  // Edit selections in filter row
  userEvent.click(screen.getByLabelText('Select Filter Values'));
  userEvent.click(screen.getByText('Precinct 2'));
  expect(onChange).toHaveBeenNthCalledWith(3, {
    precinctIds: ['precinct-1', 'precinct-2'],
  });
  userEvent.click(screen.getByLabelText('Remove Precinct 1'));
  expect(onChange).toHaveBeenNthCalledWith(4, {
    precinctIds: ['precinct-2'],
  });

  // Add another filter row, voting method
  userEvent.click(screen.getByText('Add Filter'));
  userEvent.click(screen.getByLabelText('Select New Filter Type'));
  userEvent.click(screen.getByText('Voting Method'));
  expect(onChange).toHaveBeenNthCalledWith(5, {
    precinctIds: ['precinct-2'],
    votingMethods: [],
  });
  userEvent.click(
    within(
      screen.getByTestId('filter-editor-row-voting-method')
    ).getByLabelText('Select Filter Values')
  );
  userEvent.click(screen.getByText('Absentee'));
  expect(onChange).toHaveBeenNthCalledWith(6, {
    precinctIds: ['precinct-2'],
    votingMethods: ['absentee'],
  });

  // Edit type of existing filter row, ballot style
  userEvent.click(
    within(
      screen.getByTestId('filter-editor-row-voting-method')
    ).getByLabelText('Edit Filter Type')
  );
  userEvent.click(screen.getByText('Ballot Style'));
  expect(onChange).toHaveBeenNthCalledWith(7, {
    precinctIds: ['precinct-2'],
    ballotStyleIds: [],
  });
  userEvent.click(
    within(screen.getByTestId('filter-editor-row-ballot-style')).getByLabelText(
      'Select Filter Values'
    )
  );
  screen.getByText('1M');
  screen.getByText('2F');

  // Remove filter row
  userEvent.click(
    within(screen.getByTestId('filter-editor-row-precinct')).getByLabelText(
      'Remove Filter'
    )
  );
  expect(onChange).toHaveBeenNthCalledWith(8, {
    ballotStyleIds: [],
  });
});

test('scanner + batch selection', async () => {
  const { election } = electionMinimalExhaustiveSampleDefinition;
  const onChange = jest.fn();

  apiMock.expectGetScannerBatches([
    {
      batchId: '12345678-0000-0000-0000-000000000000',
      scannerId: 'scanner-1',
      label: 'Batch 1',
      electionId: 'id',
    },
    {
      batchId: '23456789-0000-0000-0000-000000000000',
      scannerId: 'scanner-1',
      label: 'Batch 2',
      electionId: 'id',
    },
    {
      batchId: '34567890-0000-0000-0000-000000000000',
      scannerId: 'scanner-2',
      label: 'Batch 3',
      electionId: 'id',
    },
  ]);
  renderInAppContext(<FilterEditor election={election} onChange={onChange} />, {
    apiMock,
  });

  // add scanner filter
  userEvent.click(screen.getButton('Add Filter'));
  userEvent.click(screen.getByLabelText('Select New Filter Type'));
  userEvent.click(screen.getByText('Scanner'));
  expect(onChange).toHaveBeenNthCalledWith(1, { scannerIds: [] });
  userEvent.click(screen.getByLabelText('Select Filter Values'));
  await screen.findByText('scanner-1'); // list populates after query completes
  screen.getByText('scanner-2');
  userEvent.click(screen.getByText('scanner-1'));
  expect(onChange).toHaveBeenNthCalledWith(2, { scannerIds: ['scanner-1'] });

  // switch to batch filter
  userEvent.click(screen.getByLabelText('Edit Filter Type'));
  userEvent.click(screen.getByText('Batch'));
  expect(onChange).toHaveBeenNthCalledWith(3, { batchIds: [] });
  userEvent.click(screen.getByLabelText('Select Filter Values'));
  screen.getByText('scanner-1 • 12345678');
  screen.getByText('scanner-1 • 23456789');
  screen.getByText('scanner-2 • 34567890');
  userEvent.click(screen.getByText('scanner-1 • 12345678'));
  expect(onChange).toHaveBeenNthCalledWith(4, {
    batchIds: ['12345678-0000-0000-0000-000000000000'],
  });
});

test('can cancel adding a filter', () => {
  const { election } = electionMinimalExhaustiveSampleDefinition;
  const onChange = jest.fn();

  apiMock.expectGetScannerBatches([]);
  renderInAppContext(<FilterEditor election={election} onChange={onChange} />, {
    apiMock,
  });

  userEvent.click(screen.getButton('Add Filter'));
  userEvent.click(screen.getByLabelText('Cancel Add Filter'));
  screen.getByText('Add Filter');
  expect(onChange).not.toHaveBeenCalled();
});
