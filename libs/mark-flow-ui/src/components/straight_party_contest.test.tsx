import { beforeEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { useIsPatDeviceConnected, WithScrollButtons } from '@votingworks/ui';
import {
  Election,
  StraightPartyContest as StraightPartyContestInterface,
} from '@votingworks/types';
import { screen, within, render } from '../../test/react_testing_library';
import { StraightPartyContest } from './straight_party_contest';

vi.mock('@votingworks/ui', async () => ({
  ...(await vi.importActual('@votingworks/ui')),
  useIsPatDeviceConnected: vi.fn(),
  WithScrollButtons: vi.fn(({ children }) => (
    <div data-testid="MockWithScrollButtons">{children}</div>
  )),
}));

const mockUseIsPatDeviceConnected = vi.mocked(useIsPatDeviceConnected);
vi.mocked(WithScrollButtons);

const election: Election = {
  title: 'Test Election',
  state: 'Test State',
  county: { id: 'county-1', name: 'Test County' },
  date: { toMidnightDatetimeWithSystemTimezone: () => new Date() },
  type: 'general',
  seal: '',
  parties: [
    { id: 'party-dem', name: 'Democrat', fullName: 'Democratic Party' },
    { id: 'party-rep', name: 'Republican', fullName: 'Republican Party' },
  ],
  precincts: [{ id: 'precinct-1', name: 'Precinct 1' }],
  districts: [{ id: 'district-1', name: 'District 1' }],
  ballotStyles: [],
  contests: [
    {
      id: 'straight-party',
      type: 'straight-party',
      title: 'Straight Party',
    },
  ],
} as unknown as Election;

const contest = election.contests[0] as StraightPartyContestInterface;

beforeEach(() => {
  mockUseIsPatDeviceConnected.mockReturnValue(false);
});

test('renders party options', () => {
  const updateVote = vi.fn();
  render(
    <StraightPartyContest
      election={election}
      contest={contest}
      updateVote={updateVote}
    />
  );

  screen.getByRole('heading', { name: contest.title });
  const choices = screen.getByTestId('contest-choices');
  within(choices).getByText('Democratic Party');
  within(choices).getByText('Republican Party');
});

test('selecting a party', () => {
  const updateVote = vi.fn();
  render(
    <StraightPartyContest
      election={election}
      contest={contest}
      updateVote={updateVote}
    />
  );

  const choices = screen.getByTestId('contest-choices');
  userEvent.click(
    within(choices).getByText('Democratic Party').closest('button')!
  );
  expect(updateVote).toHaveBeenCalledWith('straight-party', ['party-dem']);
});

test('deselecting a party', () => {
  const updateVote = vi.fn();
  render(
    <StraightPartyContest
      election={election}
      contest={contest}
      vote={['party-dem']}
      updateVote={updateVote}
    />
  );

  const choices = screen.getByTestId('contest-choices');
  userEvent.click(
    within(choices).getByText('Democratic Party').closest('button')!
  );
  expect(updateVote).toHaveBeenCalledWith('straight-party', undefined);
});

test('overvote shows modal', () => {
  const updateVote = vi.fn();
  render(
    <StraightPartyContest
      election={election}
      contest={contest}
      vote={['party-dem']}
      updateVote={updateVote}
    />
  );

  const choices = screen.getByTestId('contest-choices');
  userEvent.click(
    within(choices).getByText('Republican Party').closest('button')!
  );
  expect(updateVote).not.toHaveBeenCalled();

  within(screen.getByRole('alertdialog')).getByText(/first deselect/i);
  userEvent.click(screen.getByText('Continue'));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
});
