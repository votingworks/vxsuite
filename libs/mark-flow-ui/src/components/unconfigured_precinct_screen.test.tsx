import { beforeEach, expect, test, vi } from 'vitest';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { assertDefined } from '@votingworks/basics';
import { ElectionInfoBar, ElectionInfoBarProps } from '@votingworks/ui';
import { UnconfiguredPollingPlaceScreen } from './unconfigured_polling_place_screen';
import { render, screen } from '../../test/react_testing_library';

vi.mock(import('@votingworks/ui'), async (importActual) => ({
  ...(await importActual()),
  ElectionInfoBar: vi.fn(),
}));
const MOCK_ELECTION_INFO_BAR_ID = 'MockElectionInfoBar';
const MockElectionInfoBar = vi.mocked(ElectionInfoBar);

const electionDefinition = readElectionGeneralDefinition();

beforeEach(() => {
  MockElectionInfoBar.mockReturnValue(
    <div data-testid={MOCK_ELECTION_INFO_BAR_ID} />
  );
});

test('renders note + election info', () => {
  render(
    <UnconfiguredPollingPlaceScreen
      electionDefinition={electionDefinition}
      electionPackageHash="test-hash"
    />
  );

  screen.getByRole('heading', { name: 'No Polling Place Selected' });

  screen.getByTestId(MOCK_ELECTION_INFO_BAR_ID);
  const props = assertDefined(MockElectionInfoBar.mock.lastCall)[0];
  expect(props).toEqual<ElectionInfoBarProps>({
    electionDefinition,
    electionPackageHash: 'test-hash',
  });
});
