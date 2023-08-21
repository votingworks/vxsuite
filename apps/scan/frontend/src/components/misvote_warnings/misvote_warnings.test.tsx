import { mockOf } from '@votingworks/test-utils';
import { render, screen } from '../../../test/react_testing_library';
import { WarningDetails } from './warning_details';
import { generateContests } from './test_utils.test';
import { WarningsSummary } from './warnings_summary';
import { useLayoutConfig } from './use_layout_config_hook';
import { MisvoteWarnings } from './misvote_warnings';

jest.mock('./warning_details', (): typeof import('./warning_details') => ({
  ...jest.requireActual('./warning_details'),
  WarningDetails: jest.fn(),
}));

jest.mock('./warnings_summary', (): typeof import('./warnings_summary') => ({
  ...jest.requireActual('./warnings_summary'),
  WarningsSummary: jest.fn(),
}));

jest.mock(
  './use_layout_config_hook',
  (): typeof import('./use_layout_config_hook') => ({
    ...jest.requireActual('./use_layout_config_hook'),
    useLayoutConfig: jest.fn(),
  })
);

const contests = generateContests(6);
const blankContests = contests.slice(0, 3);
const partiallyVotedContests = contests.slice(3, 5);
const overvoteContests = contests.slice(5);

beforeEach(() => {
  mockOf(WarningDetails).mockImplementation(() => (
    <div data-testid="mockWarningDetails" />
  ));

  mockOf(WarningsSummary).mockImplementation(() => (
    <div data-testid="mockWarningsSummary" />
  ));
});

afterEach(() => {
  jest.resetAllMocks();
});

test('renders summary when necessary', () => {
  mockOf(useLayoutConfig).mockReturnValue({
    maxColumnsPerCard: 2,
    numCardsPerRow: 2,
    showSummaryInPreview: true,
  });

  render(
    <MisvoteWarnings
      blankContests={blankContests}
      overvoteContests={overvoteContests}
      partiallyVotedContests={partiallyVotedContests}
    />
  );

  expect(screen.queryByTestId('mockWarningDetails')).not.toBeInTheDocument();

  screen.getByTestId('mockWarningsSummary');
  expect(mockOf(WarningsSummary)).toBeCalledWith(
    { blankContests, overvoteContests, partiallyVotedContests },
    {}
  );
});

test('renders details when possible', () => {
  mockOf(useLayoutConfig).mockReturnValue({
    maxColumnsPerCard: 2,
    numCardsPerRow: 2,
    showSummaryInPreview: false,
  });

  render(
    <MisvoteWarnings
      blankContests={blankContests}
      overvoteContests={overvoteContests}
      partiallyVotedContests={partiallyVotedContests}
    />
  );

  expect(screen.queryByTestId('mockWarningsSummary')).not.toBeInTheDocument();

  screen.getByTestId('mockWarningDetails');
  expect(mockOf(WarningDetails)).toBeCalledWith(
    { blankContests, overvoteContests, partiallyVotedContests },
    {}
  );
});
