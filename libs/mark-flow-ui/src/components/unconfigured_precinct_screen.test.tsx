import { beforeEach, expect, test, vi } from 'vitest';
import {
  BooleanEnvironmentVariableName as Feature,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { assertDefined } from '@votingworks/basics';
import { ElectionInfoBar, ElectionInfoBarProps } from '@votingworks/ui';
import { UnconfiguredPollingPlaceScreen } from './unconfigured_polling_place_screen';
import { render, screen } from '../../test/react_testing_library';

const featureFlagMock = getFeatureFlagMock();
vi.mock('@votingworks/utils', async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (f: Feature) => featureFlagMock.isEnabled(f),
}));

vi.mock(import('@votingworks/ui'), async (importActual) => ({
  ...(await importActual()),
  ElectionInfoBar: vi.fn(),
}));
const MOCK_ELECTION_INFO_BAR_ID = 'MockElectionInfoBar';
const MockElectionInfoBar = vi.mocked(ElectionInfoBar);

const electionDefinition = readElectionGeneralDefinition();

beforeEach(() => {
  featureFlagMock.resetFeatureFlags();
  MockElectionInfoBar.mockReturnValue(
    <div data-testid={MOCK_ELECTION_INFO_BAR_ID} />
  );
});

test('renders note + election info (with precinct selection)', () => {
  featureFlagMock.disableFeatureFlag(Feature.ENABLE_POLLING_PLACES);

  render(
    <UnconfiguredPollingPlaceScreen
      electionDefinition={electionDefinition}
      electionPackageHash="test-hash"
    />
  );

  screen.getByRole('heading', { name: 'No Precinct Selected' });

  screen.getByTestId(MOCK_ELECTION_INFO_BAR_ID);
  const props = assertDefined(MockElectionInfoBar.mock.lastCall)[0];
  expect(props).toEqual<ElectionInfoBarProps>({
    electionDefinition,
    electionPackageHash: 'test-hash',
  });
});

test('renders note + election info', () => {
  featureFlagMock.enableFeatureFlag(Feature.ENABLE_POLLING_PLACES);

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
