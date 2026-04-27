import { expect, test, vi } from 'vitest';
import { Route } from 'react-router-dom';
import { electionOpenPrimaryFixtures } from '@votingworks/fixtures';
import { createMemoryHistory } from 'history';
import { MARK_FLOW_UI_VOTER_SCREEN_TEST_ID } from '@votingworks/mark-flow-ui';
import userEvent from '@testing-library/user-event';
import { PartyId, VotesDict } from '@votingworks/types';
import { screen, within } from '../../test/react_testing_library';
import { render } from '../../test/test_utils';
import { PartySelectionScreen } from './party_selection_screen';

const electionDefinition = electionOpenPrimaryFixtures.readElectionDefinition();

test('renders as voter screen with party options', () => {
  render(<Route path="/party-selection" component={PartySelectionScreen} />, {
    electionDefinition,
    route: '/party-selection',
  });

  screen.getByTestId(MARK_FLOW_UI_VOTER_SCREEN_TEST_ID);
  screen.getByRole('heading', { name: 'Choose Your Party' });
  screen.getByRole('radio', { name: 'Democratic Party' });
  screen.getByRole('radio', { name: 'Republican Party' });
  screen.getByRole('radio', { name: 'Libertarian Party' });
});

test('Next button disabled until a party is selected', () => {
  render(<Route path="/party-selection" component={PartySelectionScreen} />, {
    electionDefinition,
    route: '/party-selection',
  });

  expect(screen.getButton(/next/i)).toBeDisabled();
});

test('Next button enabled once a party is selected', () => {
  render(<Route path="/party-selection" component={PartySelectionScreen} />, {
    electionDefinition,
    route: '/party-selection',
    selectedPartyId: 'democratic-party' as PartyId,
  });

  expect(screen.getButton(/next/i)).toBeEnabled();
});

test('selecting a party calls selectParty with the party id', () => {
  const selectParty = vi.fn();
  render(<Route path="/party-selection" component={PartySelectionScreen} />, {
    electionDefinition,
    route: '/party-selection',
    selectParty,
  });

  userEvent.click(screen.getByRole('radio', { name: 'Republican Party' }));
  expect(selectParty).toHaveBeenCalledWith('republican-party');
});

test('Back button navigates to start screen', () => {
  const history = createMemoryHistory({ initialEntries: ['/party-selection'] });
  render(<Route path="/party-selection" component={PartySelectionScreen} />, {
    electionDefinition,
    history,
    route: '/party-selection',
  });

  userEvent.click(screen.getButton(/back/i));
  expect(history.location.pathname).toEqual('/');
});

test('Next button navigates to first contest when a party is selected', () => {
  const history = createMemoryHistory({ initialEntries: ['/party-selection'] });
  render(<Route path="/party-selection" component={PartySelectionScreen} />, {
    electionDefinition,
    history,
    route: '/party-selection',
    selectedPartyId: 'democratic-party' as PartyId,
  });

  userEvent.click(screen.getButton(/next/i));
  expect(history.location.pathname).toEqual('/contests/0');
});

test('changing party with votes cast prompts confirmation before clearing votes', () => {
  const selectParty = vi.fn();
  const democraticGovernor = electionDefinition.election.contests.find(
    (c) => c.id === 'governor-democratic'
  );
  if (democraticGovernor?.type !== 'candidate') {
    throw new Error('expected governor-democratic to be a candidate contest');
  }
  const votes: VotesDict = {
    'governor-democratic': [democraticGovernor.candidates[0]],
  };
  render(<Route path="/party-selection" component={PartySelectionScreen} />, {
    electionDefinition,
    route: '/party-selection',
    selectedPartyId: 'democratic-party' as PartyId,
    selectParty,
    votes,
  });

  // Tapping a different party opens the modal without changing the party yet.
  userEvent.click(screen.getByRole('radio', { name: 'Republican Party' }));
  let modal = screen.getByRole('alertdialog');
  within(modal).getByText(/clear all of your votes/i);
  expect(selectParty).not.toHaveBeenCalled();

  // Cancel closes the modal and leaves the party unchanged.
  userEvent.click(within(modal).getButton(/cancel/i));
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(selectParty).not.toHaveBeenCalled();

  // Reopening and confirming applies the new party.
  userEvent.click(screen.getByRole('radio', { name: 'Republican Party' }));
  modal = screen.getByRole('alertdialog');
  userEvent.click(within(modal).getButton(/^change party$/i));
  expect(selectParty).toHaveBeenCalledWith('republican-party');
  expect(screen.queryByRole('alertdialog')).toBeNull();
});

test('changing party with no votes cast skips the confirmation modal', () => {
  const selectParty = vi.fn();
  render(<Route path="/party-selection" component={PartySelectionScreen} />, {
    electionDefinition,
    route: '/party-selection',
    selectedPartyId: 'democratic-party' as PartyId,
    selectParty,
  });

  userEvent.click(screen.getByRole('radio', { name: 'Republican Party' }));
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(selectParty).toHaveBeenCalledWith('republican-party');
});
