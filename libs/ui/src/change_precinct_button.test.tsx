import { readElectionTwoPartyPrimary } from '@votingworks/fixtures';
import {
  ALL_PRECINCTS_NAME,
  ALL_PRECINCTS_SELECTION,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '../test/react_testing_library';
import {
  ChangePrecinctButton,
  SELECT_PRECINCT_TEXT,
} from './change_precinct_button';

const electionTwoPartyPrimary = readElectionTwoPartyPrimary();

test('default mode: set precinct from unset', async () => {
  const updatePrecinctSelection = jest.fn();

  render(
    <ChangePrecinctButton
      appPrecinctSelection={undefined}
      updatePrecinctSelection={updatePrecinctSelection}
      election={electionTwoPartyPrimary}
      mode="default"
    />
  );

  // Dropdown defaults to selection prompt
  const selectInput = await screen.findByLabelText(SELECT_PRECINCT_TEXT);
  const select = selectInput.closest('.search-select')!;
  expect(select).toHaveTextContent(SELECT_PRECINCT_TEXT);

  // Try interacting with dropdown without making any selection
  const placeholder = screen.getByText(SELECT_PRECINCT_TEXT);
  userEvent.click(placeholder);
  userEvent.click(placeholder);
  expect(updatePrecinctSelection).not.toHaveBeenCalled();

  // Updates app state
  const precinct = electionTwoPartyPrimary.precincts[0];
  userEvent.click(screen.getByText(SELECT_PRECINCT_TEXT));
  userEvent.click(await screen.findByText(precinct.name));
  expect(updatePrecinctSelection).toHaveBeenCalledTimes(1);
  expect(updatePrecinctSelection).toHaveBeenCalledWith(
    expect.objectContaining(singlePrecinctSelectionFor(precinct.id))
  );
});

test('default mode: switch precinct', async () => {
  const updatePrecinctSelection = jest.fn();

  render(
    <ChangePrecinctButton
      appPrecinctSelection={ALL_PRECINCTS_SELECTION}
      updatePrecinctSelection={updatePrecinctSelection}
      election={electionTwoPartyPrimary}
      mode="default"
    />
  );

  // Dropdown starts on All Precincts
  const input = await screen.findByLabelText(SELECT_PRECINCT_TEXT);
  expect(input.closest('.search-select')).toHaveTextContent(ALL_PRECINCTS_NAME);

  userEvent.click(screen.getByText(ALL_PRECINCTS_NAME));
  const precinct = electionTwoPartyPrimary.precincts[0];
  userEvent.click(await screen.findByText(precinct.name));
  expect(updatePrecinctSelection).toHaveBeenCalledTimes(1);
  expect(updatePrecinctSelection).toHaveBeenCalledWith(
    expect.objectContaining(singlePrecinctSelectionFor(precinct.id))
  );
});

test('confirmation required mode', async () => {
  const updatePrecinctSelection = jest.fn();
  const [precinct, otherPrecinct] = electionTwoPartyPrimary.precincts;

  render(
    <ChangePrecinctButton
      appPrecinctSelection={singlePrecinctSelectionFor(precinct.id)}
      updatePrecinctSelection={updatePrecinctSelection}
      election={electionTwoPartyPrimary}
      mode="confirmation_required"
    />
  );

  // Initially it's the button only
  const mainButton = screen.getByRole('button', { name: 'Change Precinct' });
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

  // Press the button and modal opens
  userEvent.click(mainButton);
  screen.getByRole('alertdialog');

  // Loads with the initial precinct and confirm, which is disabled as an option
  const select = screen
    .getByLabelText(SELECT_PRECINCT_TEXT)
    .closest('.search-select');
  expect(select).toHaveTextContent(precinct.name);
  expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();

  // Can select another single precinct, which enables confirmation
  userEvent.click(screen.getByText(precinct.name));
  userEvent.click(await screen.findByText(otherPrecinct.name));
  expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled();

  // Can close modal, re-open, and we will be back to default
  userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  userEvent.click(mainButton);
  screen.getByText(precinct.name);
  expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();

  // Can select and confirm a precinct
  userEvent.click(screen.getByText(precinct.name));
  userEvent.click(await screen.findByText(ALL_PRECINCTS_NAME));
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
});

test('disabled mode', () => {
  render(
    <ChangePrecinctButton
      appPrecinctSelection={undefined}
      updatePrecinctSelection={jest.fn()}
      election={electionTwoPartyPrimary}
      mode="disabled"
    />
  );

  expect(screen.getByLabelText(SELECT_PRECINCT_TEXT)).toBeDisabled();
});
