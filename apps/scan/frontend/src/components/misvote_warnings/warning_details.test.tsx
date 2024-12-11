import { vi, expect, beforeEach, afterEach, test } from 'vitest';
import { Contest } from '@votingworks/types';
import { ContestList } from './contest_list';
import { render, screen, within } from '../../../test/react_testing_library';
import { WarningDetails } from './warning_details';
import { generateContests } from './test_utils.test';
import { useLayoutConfig } from './use_layout_config_hook';

vi.mock('./contest_list', async () => ({
  ...(await vi.importActual('./contest_list')),
  ContestList: vi.fn(),
}));

vi.mock('./use_layout_config_hook', async () => ({
  ...(await vi.importActual('./use_layout_config_hook')),
  useLayoutConfig: vi.fn(),
}));

function expectMockContestListProps(
  container: HTMLElement,
  matchers: {
    title: string | RegExp;
    helpNote: string | RegExp;
    maxColumns: number;
    contests: Contest[];
  }
) {
  const { contests, helpNote, maxColumns, title } = matchers;

  const contestList = within(container);
  expect(contestList.getByTestId('title')).toHaveTextContent(title);
  expect(contestList.getByTestId('helpNote')).toHaveTextContent(helpNote);
  expect(contestList.getByTestId('maxColumns')).toHaveTextContent(
    `${maxColumns}`
  );
  for (const c of contests) {
    contestList.getByText(c.title);
  }
}

beforeEach(() => {
  vi.mocked(ContestList).mockImplementation((props) => (
    <div data-testid="mockContestList">
      <div data-testid="title">{props.title}</div>
      <div data-testid="helpNote">{props.helpNote}</div>
      <div data-testid="maxColumns">{props.maxColumns}</div>
      <div>
        contests:{' '}
        {props.contests.map((c) => (
          <div key={c.id}>{c.title}</div>
        ))}
      </div>
    </div>
  ));
});

afterEach(() => {
  vi.resetAllMocks();
});

test('renders all relevant warnings', () => {
  vi.mocked(useLayoutConfig).mockReturnValue({
    maxColumnsPerCard: 2,
    numCardsPerRow: 2,
    showSummaryInPreview: true,
  });

  const contests = generateContests(6);
  const blankContests = contests.slice(0, 3);
  const partiallyVotedContests = contests.slice(3, 5);
  const overvoteContests = contests.slice(5);

  render(
    <WarningDetails
      blankContests={blankContests}
      overvoteContests={overvoteContests}
      partiallyVotedContests={partiallyVotedContests}
    />
  );

  const contestLists = screen.getAllByTestId('mockContestList');
  expect(contestLists).toHaveLength(3);

  expectMockContestListProps(contestLists[0], {
    title: /no votes/i,
    helpNote: /did you mean to leave these contests blank?/i,
    maxColumns: 2,
    contests: blankContests,
  });

  expectMockContestListProps(contestLists[1], {
    title: /you may add one or more/i,
    helpNote: /all other votes in these contests will count/i,
    maxColumns: 2,
    contests: partiallyVotedContests,
  });

  expectMockContestListProps(contestLists[2], {
    title: /too many votes/i,
    helpNote: /votes in this contest will not be counted/i,
    maxColumns: 2,
    contests: overvoteContests,
  });
});

test('omits warnings with no contests', () => {
  vi.mocked(useLayoutConfig).mockReturnValue({
    maxColumnsPerCard: 3,
    numCardsPerRow: 2,
    showSummaryInPreview: true,
  });

  const overvoteContests = generateContests(2);

  render(
    <WarningDetails
      blankContests={[]}
      overvoteContests={overvoteContests}
      partiallyVotedContests={[]}
    />
  );

  const contestList = screen.getByTestId('mockContestList');

  expectMockContestListProps(contestList, {
    title: /too many votes/i,
    helpNote: /votes in these contests will not be counted/i,
    maxColumns: 3,
    contests: overvoteContests,
  });
});
