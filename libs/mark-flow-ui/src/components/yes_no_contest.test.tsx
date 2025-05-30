import { beforeEach, expect, test, vi } from 'vitest';
import {
  readElectionGeneral,
  readElectionTwoPartyPrimary,
} from '@votingworks/fixtures';
import { YesNoContest as YesNoContestInterface } from '@votingworks/types';
import userEvent from '@testing-library/user-event';
import {
  useIsPatDeviceConnected,
  WithScrollButtons,
  WithScrollButtonsProps,
} from '@votingworks/ui';
import { screen, within, render } from '../../test/react_testing_library';
import { YesNoContest } from './yes_no_contest';

const electionGeneral = readElectionGeneral();
const electionTwoPartyPrimary = readElectionTwoPartyPrimary();

const MOCK_WITH_SCROLL_BUTTONS_TEST_ID = 'MockWithScrollButtons';

vi.mock('@votingworks/ui', async () => ({
  ...(await vi.importActual('@votingworks/ui')),
  useIsPatDeviceConnected: vi.fn(),
  WithScrollButtons: vi.fn(({ children }) => (
    <div data-testid={MOCK_WITH_SCROLL_BUTTONS_TEST_ID}>{children}</div>
  )),
}));

const mockUseIsPatDeviceConnected = vi.mocked(useIsPatDeviceConnected);
const MockWithScrollButtons = vi.mocked(WithScrollButtons);

const contest = electionTwoPartyPrimary.contests.find(
  (c) => c.id === 'fishing' && c.type === 'yesno'
) as YesNoContestInterface;

function getOption(accessibleName: string | RegExp) {
  return screen.getByRole('option', { name: accessibleName });
}

beforeEach(() => {
  mockUseIsPatDeviceConnected.mockReturnValue(false);
});

test('voting for both yes and no', () => {
  const updateVote = vi.fn();
  render(
    <YesNoContest
      election={electionTwoPartyPrimary}
      contest={contest}
      updateVote={updateVote}
    />
  );

  screen.getByRole('heading', { name: contest.title });

  const descriptions = within(
    screen.getByTestId(MOCK_WITH_SCROLL_BUTTONS_TEST_ID)
  ).getAllByText(contest.description);
  // Expect once for AudioOnly component and once for visual component
  expect(descriptions.length).toEqual(2);

  const contestChoices = screen.getByTestId('contest-choices');
  userEvent.click(within(contestChoices).getByText('YES').closest('button')!);
  expect(updateVote).toHaveBeenCalledTimes(1);

  userEvent.click(within(contestChoices).getByText('NO').closest('button')!);
  expect(updateVote).toHaveBeenCalledTimes(2);
});

test('changing votes', () => {
  const updateVote = vi.fn();
  render(
    <YesNoContest
      election={electionTwoPartyPrimary}
      contest={contest}
      vote={[contest.yesOption.id]}
      updateVote={updateVote}
    />
  );
  const contestChoices = screen.getByTestId('contest-choices');
  userEvent.click(within(contestChoices).getByText('NO').closest('button')!);
  within(screen.getByRole('alertdialog')).getByText(/first deselect/i);
  userEvent.click(screen.getByText('Continue'));
});

test('audio cue for vote', () => {
  vi.useFakeTimers();

  const updateVote = vi.fn();
  const { rerender } = render(
    <YesNoContest
      election={electionTwoPartyPrimary}
      contest={contest}
      updateVote={updateVote}
    />
  );

  const yesButton = getOption(/YES/i);

  // initial state just has a description of the choice
  getOption(/Ballot Measure 3.+yes/i);
  userEvent.click(yesButton);

  // manually handle updating the vote
  rerender(
    <YesNoContest
      election={electionTwoPartyPrimary}
      contest={contest}
      vote={[contest.yesOption.id]}
      updateVote={updateVote}
    />
  );

  // now the choice is selected
  getOption(
    /Selected.+Ballot Measure 3.+yes.*you've completed your selections/i
  );

  // unselect the choice
  userEvent.click(yesButton);

  // manually handle updating the vote
  rerender(
    <YesNoContest
      election={electionTwoPartyPrimary}
      contest={contest}
      vote={[]}
      updateVote={updateVote}
    />
  );

  // now the choice is deselected
  getOption(/Deselected.+Ballot Measure 3.+yes/i);

  // after a second, the choice is no longer selected or deselected
  vi.advanceTimersByTime(1000);
  getOption(/Ballot Measure 3.+yes/i);
});

test('can focus and click scroll buttons with PAT device', () => {
  mockUseIsPatDeviceConnected.mockReturnValue(true);

  render(
    <YesNoContest
      election={electionTwoPartyPrimary}
      contest={contest}
      vote={[contest.yesOption.id]}
      updateVote={vi.fn()}
    />
  );

  expect(MockWithScrollButtons).toHaveBeenCalledWith(
    expect.objectContaining<Partial<WithScrollButtonsProps>>({
      focusable: true,
    }),
    expect.anything()
  );
});

test('scroll button focus is disabled when no PAT device is connected', () => {
  mockUseIsPatDeviceConnected.mockReturnValue(false);

  render(
    <YesNoContest
      election={electionTwoPartyPrimary}
      contest={contest}
      vote={[contest.yesOption.id]}
      updateVote={vi.fn()}
    />
  );

  expect(MockWithScrollButtons).toHaveBeenCalledWith(
    expect.objectContaining<Partial<WithScrollButtonsProps>>({
      focusable: false,
    }),
    expect.anything()
  );
});

test('renders rich text', () => {
  const richTextContest = electionGeneral.contests.find(
    (c): c is YesNoContestInterface =>
      c.type === 'yesno' && Boolean(c.description.match(/<p>/))
  )!;
  render(
    <YesNoContest
      election={electionGeneral}
      contest={richTextContest}
      updateVote={vi.fn()}
    />
  );

  const title = screen.getByRole('heading', { name: richTextContest.title });
  const contestHeader = title.parentElement!.parentElement!;
  expect(contestHeader.innerHTML).toContain(richTextContest.description);
});
