import { afterEach, beforeEach, test } from 'vitest';
import userEvent from '@testing-library/user-event';

import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';
import { render, screen } from '../test/react_testing_library';
import { App } from './app';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
  apiMock.expectGetSystemSettings();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('Vendor screen', async () => {
  apiMock.expectGetMachineConfig();
  apiMock.expectGetElectionRecord(null);
  apiMock.expectGetElectionState();
  render(<App apiClient={apiMock.mockApiClient} />);

  apiMock.setAuthStatusVendorLoggedIn();
  const rebootButton = await screen.findButton('Reboot to Vendor Menu');
  screen.getByText('Remove the card to leave this screen.');

  apiMock.expectRebootToVendorMenu();
  userEvent.click(rebootButton);
});
