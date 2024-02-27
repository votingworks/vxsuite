import { electionTwoPartyPrimary } from '@votingworks/fixtures';
import {
  ALL_PRECINCTS_SELECTION,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import userEvent from '@testing-library/user-event';
import { mockBaseLogger, LogEventId } from '@votingworks/logging';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/react_testing_library';
import {
  ALL_PRECINCTS_OPTION_VALUE,
  ChangePrecinctButton,
  SELECT_PRECINCT_TEXT,
} from './change_precinct_button';

test('default mode: set precinct from unset', async () => {
  const updatePrecinctSelection = jest.fn();
  const logger = mockBaseLogger();

  render(
    <ChangePrecinctButton
      appPrecinctSelection={undefined}
      updatePrecinctSelection={updatePrecinctSelection}
      election={electionTwoPartyPrimary}
      mode="default"
      logger={logger}
    />
  );

  // Dropdown defaults to disabled selection prompt
  const dropdown = await screen.findByTestId('selectPrecinct');
  screen.getByRole('option', { name: SELECT_PRECINCT_TEXT, selected: true });
  expect(
    screen.getByRole('option', { name: SELECT_PRECINCT_TEXT })
  ).toBeDisabled();

  // Try interacting with dropdown without making any selection
  userEvent.click(dropdown);
  fireEvent.blur(dropdown);
  expect(updatePrecinctSelection).not.toHaveBeenCalled();

  // Updates app state
  userEvent.selectOptions(dropdown, 'precinct-1');
  expect(updatePrecinctSelection).toHaveBeenCalledTimes(1);
  expect(updatePrecinctSelection).toHaveBeenCalledWith(
    expect.objectContaining(singlePrecinctSelectionFor('precinct-1'))
  );
  await waitFor(() => {
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.PrecinctConfigurationChanged,
      'election_manager',
      expect.objectContaining({
        disposition: 'success',
        message: expect.stringContaining('Precinct 1'),
      })
    );
  });

  // Prompt is still disabled
  expect(
    screen.getByRole('option', { name: SELECT_PRECINCT_TEXT })
  ).toBeDisabled();
});

test('default mode: switch precinct', async () => {
  const updatePrecinctSelection = jest.fn();
  const logger = mockBaseLogger();

  render(
    <ChangePrecinctButton
      appPrecinctSelection={ALL_PRECINCTS_SELECTION}
      updatePrecinctSelection={updatePrecinctSelection}
      election={electionTwoPartyPrimary}
      mode="default"
      logger={logger}
    />
  );

  // Dropdown starts on All Precincts, which is disabled since it is selected
  const dropdown = await screen.findByTestId('selectPrecinct');
  screen.getByRole('option', { name: 'All Precincts', selected: true });
  expect(screen.getByRole('option', { name: 'All Precincts' })).toBeDisabled();

  userEvent.selectOptions(dropdown, 'precinct-2');
  expect(updatePrecinctSelection).toHaveBeenCalledTimes(1);
  expect(updatePrecinctSelection).toHaveBeenCalledWith(
    expect.objectContaining(singlePrecinctSelectionFor('precinct-2'))
  );

  await waitFor(() => {
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.PrecinctConfigurationChanged,
      'election_manager',
      expect.objectContaining({
        disposition: 'success',
        message: expect.stringContaining('Precinct 2'),
      })
    );
  });
});

test('confirmation required mode', async () => {
  const updatePrecinctSelection = jest.fn();
  const logger = mockBaseLogger();

  render(
    <ChangePrecinctButton
      appPrecinctSelection={singlePrecinctSelectionFor('precinct-1')}
      updatePrecinctSelection={updatePrecinctSelection}
      election={electionTwoPartyPrimary}
      mode="confirmation_required"
      logger={logger}
    />
  );

  // Initially it's the button only
  const mainButton = screen.getByRole('button', { name: 'Change Precinct' });
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

  // Press the button and modal opens
  userEvent.click(mainButton);
  screen.getByRole('alertdialog');

  // Loads with the initial precinct and confirm, which is disabled as an option
  screen.getByRole('option', { name: 'Precinct 1', selected: true });
  expect(screen.getByRole('option', { name: 'Precinct 1' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();

  // Can select another single precinct, which enables confirmation
  userEvent.selectOptions(screen.getByTestId('selectPrecinct'), 'precinct-2');
  screen.getByRole('option', { name: 'Precinct 2', selected: true });
  expect(screen.getByRole('button', { name: 'Confirm' })).not.toBeDisabled();
  expect(screen.getByRole('option', { name: 'Precinct 1' })).toBeDisabled();

  // Can close modal, re-open, and we will be back to default
  userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  userEvent.click(mainButton);
  screen.getByRole('option', { name: 'Precinct 1', selected: true });
  expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();

  // Can select and confirm a precinct
  userEvent.selectOptions(
    screen.getByTestId('selectPrecinct'),
    ALL_PRECINCTS_OPTION_VALUE
  );
  screen.getByRole('option', { name: 'All Precincts', selected: true });
  userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
  expect(updatePrecinctSelection).toHaveBeenCalledTimes(1);
  expect(updatePrecinctSelection).toHaveBeenLastCalledWith(
    expect.objectContaining({
      kind: 'AllPrecincts',
    })
  );

  await waitFor(() => {
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.PrecinctConfigurationChanged,
      'election_manager',
      expect.objectContaining({
        disposition: 'success',
        message: expect.stringContaining('All Precincts'),
      })
    );
  });
  expect(logger.log).toHaveBeenCalledTimes(1);
});

test('disabled mode', () => {
  render(
    <ChangePrecinctButton
      appPrecinctSelection={undefined}
      updatePrecinctSelection={jest.fn()}
      election={electionTwoPartyPrimary}
      mode="disabled"
      logger={mockBaseLogger()}
    />
  );

  expect(screen.getByTestId('selectPrecinct')).toBeDisabled();
});
