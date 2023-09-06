import { mockOf } from '@votingworks/test-utils';
import { ContestList } from './contest_list';
import { render, screen, within } from '../../../test/react_testing_library';
import { WarningDetails } from './warning_details';
import { generateContests } from './test_utils.test';
import { useLayoutConfig } from './use_layout_config_hook';

jest.mock('./contest_list', (): typeof import('./contest_list') => ({
  ...jest.requireActual('./contest_list'),
  ContestList: jest.fn(),
}));

jest.mock(
  './use_layout_config_hook',
  (): typeof import('./use_layout_config_hook') => ({
    ...jest.requireActual('./use_layout_config_hook'),
    useLayoutConfig: jest.fn(),
  })
);

beforeEach(() => {
  mockOf(ContestList).mockImplementation((props) => (
    <div data-testid="mockContestList">
      <div>title: {props.title}</div>
      <div>helpNote: {props.helpNote}</div>
      <div>maxColumns: {props.maxColumns}</div>
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
  jest.resetAllMocks();
});

test('renders all relevant warnings', () => {
  mockOf(useLayoutConfig).mockReturnValue({
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

  const blankContestWarnings = within(contestLists[0]);
  blankContestWarnings.getByText(/title:.+no votes/i);
  blankContestWarnings.getByText(
    /helpNote:.+did you mean to leave these contests blank?/i
  );
  blankContestWarnings.getByText(/maxColumns: 2/i);
  for (const c of blankContests) {
    blankContestWarnings.getByText(c.title);
  }

  const partialVoteWarnings = within(contestLists[1]);
  partialVoteWarnings.getByText(/title:.+you may add one or more/i);
  partialVoteWarnings.getByText(
    /helpNote:.+all other votes in these contests will count/i
  );
  partialVoteWarnings.getByText(/maxColumns: 2/i);
  for (const c of partiallyVotedContests) {
    partialVoteWarnings.getByText(c.title);
  }

  const overvoteWarnings = within(contestLists[2]);
  overvoteWarnings.getByText(/title:.+too many votes/i);
  overvoteWarnings.getByText(
    /helpNote:.+votes in this contest will not be counted/i
  );
  overvoteWarnings.getByText(/maxColumns: 2/i);
  for (const c of overvoteContests) {
    overvoteWarnings.getByText(c.title);
  }
});

test('omits warnings with no contests', () => {
  mockOf(useLayoutConfig).mockReturnValue({
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

  const overvoteWarnings = within(contestList);
  overvoteWarnings.getByText(/title:.+too many votes/i);
  overvoteWarnings.getByText(
    /helpNote:.+votes in these contests will not be counted/i
  );
  overvoteWarnings.getByText(/maxColumns: 3/i);
  for (const c of overvoteContests) {
    overvoteWarnings.getByText(c.title);
  }
});
