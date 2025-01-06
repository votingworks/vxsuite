import { beforeEach, afterEach, test, expect, vi } from 'vitest';
import { render, screen } from '../../../test/react_testing_library';
import { WarningDetails } from './warning_details';
import { generateContests } from './test_utils.test';
import { WarningsSummary } from './warnings_summary';
import { useLayoutConfig } from './use_layout_config_hook';
import { MisvoteWarnings } from './misvote_warnings';

vi.mock('./warning_details', async () => ({
  ...(await vi.importActual('./warning_details')),
  WarningDetails: vi.fn(),
}));

vi.mock('./warnings_summary', async () => ({
  ...(await vi.importActual('./warnings_summary')),
  WarningsSummary: vi.fn(),
}));

vi.mock('./use_layout_config_hook', async () => ({
  ...(await vi.importActual('./use_layout_config_hook')),
  useLayoutConfig: vi.fn(),
}));

const contests = generateContests(6);
const blankContests = contests.slice(0, 3);
const partiallyVotedContests = contests.slice(3, 5);
const overvoteContests = contests.slice(5);

beforeEach(() => {
  vi.mocked(WarningDetails).mockImplementation(() => (
    <div data-testid="mockWarningDetails" />
  ));

  vi.mocked(WarningsSummary).mockImplementation(() => (
    <div data-testid="mockWarningsSummary" />
  ));
});

afterEach(() => {
  vi.resetAllMocks();
});

test('renders summary when necessary', () => {
  vi.mocked(useLayoutConfig).mockReturnValue({
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
  expect(vi.mocked(WarningsSummary)).toBeCalledWith(
    { blankContests, overvoteContests, partiallyVotedContests },
    {}
  );
});

test('renders details when possible', () => {
  vi.mocked(useLayoutConfig).mockReturnValue({
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
  expect(vi.mocked(WarningDetails)).toBeCalledWith(
    { blankContests, overvoteContests, partiallyVotedContests },
    {}
  );
});
