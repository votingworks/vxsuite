import { test, beforeEach, afterEach, vi } from 'vitest';
import { readElectionGeneral } from '@votingworks/fixtures';
import { screen } from '../test/react_testing_library';
import { ApiMock, createApiMock } from '../test/mock_api_client';
import { renderInAppContext } from '../test/render_in_app_context';
import { SmartCardsScreen } from './smart_cards_screen';

let apiMock: ApiMock;
const electionGeneral = readElectionGeneral();

let unmount: () => void;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.clearAllMocks();
  apiMock = createApiMock();
  apiMock.setElection(electionGeneral);
  apiMock.authenticateAsSystemAdministrator();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetDeviceStatuses();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
  unmount();
});

// Component is fully tested in libs/ui/src/smart_cards_screen.tsx
test('basic render', async () => {
  const renderResult = renderInAppContext(<SmartCardsScreen />, {
    apiMock,
  });
  unmount = renderResult.unmount;

  await screen.findByRole('heading', { name: 'Smart Cards' });
  await screen.findByRole('heading', { name: 'Program New Card' });
});
