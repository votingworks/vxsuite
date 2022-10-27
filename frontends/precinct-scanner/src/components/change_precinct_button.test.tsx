import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { electionMinimalExhaustiveSample } from '@votingworks/fixtures';
import { singlePrecinctSelectionFor } from '@votingworks/utils';
import userEvent from '@testing-library/user-event';
import {
  ALL_PRECINCTS_OPTION_VALUE,
  ChangePrecinctButton,
} from './change_precinct_button';

test('change precinct button flow', async () => {
  const updatePrecinctSelection = jest.fn();

  render(
    <ChangePrecinctButton
      updatePrecinctSelection={updatePrecinctSelection}
      initialPrecinctSelection={singlePrecinctSelectionFor('precinct-1')}
      election={electionMinimalExhaustiveSample}
    />
  );

  // Initially it's the button only
  const mainButton = screen.getByRole('button', { name: 'Change Precinct' });
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

  // Press the button and modal opens
  userEvent.click(mainButton);
  screen.getByRole('alertdialog');

  // Loads with the initial precinct and confirm disabled
  screen.getByText('Precinct 1');
  expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();

  // Can select other precincts;
  userEvent.selectOptions(screen.getByTestId('selectPrecinct'), 'precinct-2');
  screen.getByText('Precinct 2');
  expect(screen.getByRole('button', { name: 'Confirm' })).not.toBeDisabled();
  userEvent.selectOptions(
    screen.getByTestId('selectPrecinct'),
    ALL_PRECINCTS_OPTION_VALUE
  );
  screen.getByText('All Precincts');
  expect(screen.getByRole('button', { name: 'Confirm' })).not.toBeDisabled();

  // Can close modal, re-open, and we will be back to default
  userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  userEvent.click(mainButton);
  screen.getByText('Precinct 1');
  expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();

  // Can select and confirm a precinct
  userEvent.selectOptions(screen.getByTestId('selectPrecinct'), 'precinct-2');
  screen.getByText('Precinct 2');
  userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
  expect(updatePrecinctSelection).toHaveBeenCalledTimes(1);
  expect(updatePrecinctSelection).toHaveBeenLastCalledWith(
    expect.objectContaining({
      kind: 'SinglePrecinct',
      precinctId: 'precinct-2',
    })
  );
});

test('disabled if set as disabled', () => {
  render(
    <ChangePrecinctButton
      updatePrecinctSelection={jest.fn()}
      initialPrecinctSelection={singlePrecinctSelectionFor('precinct-1')}
      election={electionMinimalExhaustiveSample}
      disabled
    />
  );

  expect(screen.getByText('Change Precinct')).toBeDisabled();
});
