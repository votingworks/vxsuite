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
import { screen, within, render } from '../../test/react_testing_library.js';
import { YesNoContest } from './yes_no_contest.js';

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

  // The description is rendered once, inside the focusable header block; it
  // serves as both the visual text and the audio source (no separate
  // audio-only copy).
  const descriptions = within(
    screen.getByTestId(MOCK_WITH_SCROLL_BUTTONS_TEST_ID)
  ).getAllByText(contest.description);
  expect(descriptions.length).toEqual(1);

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
      vote={[contest.options[0].id]}
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
      vote={[contest.options[0].id]}
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
      vote={[contest.options[0].id]}
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
      vote={[contest.options[0].id]}
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

test('shows review mode navigation instructions when isReviewMode is true', () => {
  render(
    <YesNoContest
      election={electionTwoPartyPrimary}
      contest={contest}
      updateVote={vi.fn()}
      isReviewMode
    />
  );

  screen.getByText(/return to the review screen, use the right button/i);
});

test('shows all 3 option buttons when contest has 3 options', () => {
  render(
    <YesNoContest
      election={electionTwoPartyPrimary}
      contest={contest}
      updateVote={vi.fn()}
    />
  );

  const contestChoices = screen.getByTestId('contest-choices');
  within(contestChoices).getByText('YES');
  within(contestChoices).getByText('NO');
  within(contestChoices).getByText('REGULATE');
});

test('clicking REGULATE selects the regulate-fishing option', () => {
  const updateVote = vi.fn();
  render(
    <YesNoContest
      election={electionTwoPartyPrimary}
      contest={contest}
      updateVote={updateVote}
    />
  );

  const contestChoices = screen.getByTestId('contest-choices');
  userEvent.click(
    within(contestChoices).getByText('REGULATE').closest('button')!
  );
  expect(updateVote).toHaveBeenCalledWith(contest.id, ['regulate-fishing']);
});

test('switching from YES to REGULATE shows overvote alert', () => {
  const updateVote = vi.fn();
  render(
    <YesNoContest
      election={electionTwoPartyPrimary}
      contest={contest}
      vote={[contest.options[0].id]}
      updateVote={updateVote}
    />
  );

  const contestChoices = screen.getByTestId('contest-choices');
  userEvent.click(
    within(contestChoices).getByText('REGULATE').closest('button')!
  );
  within(screen.getByRole('alertdialog')).getByText(/first deselect/i);
  userEvent.click(screen.getByText('Continue'));
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
