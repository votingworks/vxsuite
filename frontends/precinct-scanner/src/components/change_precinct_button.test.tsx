import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { electionMinimalExhaustiveSample } from '@votingworks/fixtures';
import {
  ALL_PRECINCTS_SELECTION,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import userEvent from '@testing-library/user-event';
import {
  ALL_PRECINCTS_OPTION_VALUE,
  ChangePrecinctButton,
  SELECT_PRECINCT_TEXT,
} from './change_precinct_button';

test('polls closed initial: set precinct initially', async () => {
  const updatePrecinctSelection = jest.fn();

  render(
    <ChangePrecinctButton
      appPrecinctSelection={undefined}
      updatePrecinctSelection={updatePrecinctSelection}
      election={electionMinimalExhaustiveSample}
      ballotsCast={false}
      pollsState="polls_closed_initial"
    />
  );

  // Dropdown defaults to disabled selection prompt
  const dropdown = await screen.findByTestId('selectPrecinct');
  screen.getByRole('option', { name: SELECT_PRECINCT_TEXT, selected: true });
  expect(
    screen.getByRole('option', { name: SELECT_PRECINCT_TEXT })
  ).toBeDisabled();

  // Updates app state
  userEvent.selectOptions(dropdown, 'precinct-1');
  expect(updatePrecinctSelection).toHaveBeenCalledTimes(1);
  expect(updatePrecinctSelection).toHaveBeenCalledWith(
    expect.objectContaining(singlePrecinctSelectionFor('precinct-1'))
  );

  // Prompt is still disabled
  expect(
    screen.getByRole('option', { name: SELECT_PRECINCT_TEXT })
  ).toBeDisabled();
});

test('polls closed initial: switch precinct', async () => {
  const updatePrecinctSelection = jest.fn();

  render(
    <ChangePrecinctButton
      appPrecinctSelection={ALL_PRECINCTS_SELECTION}
      updatePrecinctSelection={updatePrecinctSelection}
      election={electionMinimalExhaustiveSample}
      ballotsCast={false}
      pollsState="polls_closed_initial"
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
});

test('polls open, no ballots: selection behind confirmation', async () => {
  const updatePrecinctSelection = jest.fn();

  render(
    <ChangePrecinctButton
      appPrecinctSelection={singlePrecinctSelectionFor('precinct-1')}
      updatePrecinctSelection={updatePrecinctSelection}
      election={electionMinimalExhaustiveSample}
      ballotsCast={false}
      pollsState="polls_open"
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
});

test('disabled if ballots cast', () => {
  render(
    <ChangePrecinctButton
      appPrecinctSelection={undefined}
      updatePrecinctSelection={jest.fn()}
      election={electionMinimalExhaustiveSample}
      ballotsCast
      pollsState="polls_open"
    />
  );

  expect(screen.getByText('Change Precinct')).toBeDisabled();
});

test('disabled if polls closed final', () => {
  render(
    <ChangePrecinctButton
      appPrecinctSelection={undefined}
      updatePrecinctSelection={jest.fn()}
      election={electionMinimalExhaustiveSample}
      ballotsCast={false}
      pollsState="polls_closed_final"
    />
  );

  expect(screen.getByText('Change Precinct')).toBeDisabled();
});
