import { afterEach, beforeEach, test } from 'vitest';
import userEvent from '@testing-library/user-event';
import { App } from './app.js';
import { render, screen } from '../test/react_testing_library.js';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client.js';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings();
  apiMock.expectGetElectionRecord(null);
  apiMock.expectGetElectionState();
  apiMock.setPaperHandlerState('no_hardware');
  apiMock.setDiskSpaceSummary();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('renders overlay when audio-only mode is enabled', () => {
  render(<App apiClient={apiMock.mockApiClient} />, {
    vxTheme: { isVisualModeDisabled: true },
  });

  userEvent.click(screen.getByText('Exit Audio-Only Mode'));
});
