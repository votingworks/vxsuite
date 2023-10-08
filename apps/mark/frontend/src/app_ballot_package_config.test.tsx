import { fakeLogger } from '@votingworks/logging';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import { MemoryHardware, MemoryStorage } from '@votingworks/utils';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';
import { render, screen } from '../test/react_testing_library';
import { App } from './app';
import { mockUsbDriveStatus } from '../test/helpers/mock_usb_drive';

let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('renders an error if ballot package config endpoint returns an error', async () => {
  apiMock.expectGetMachineConfig({
    screenOrientation: 'portrait',
  });
  apiMock.expectGetSystemSettings();
  apiMock.expectGetElectionDefinition(null);
  apiMock.setAuthStatusElectionManagerLoggedIn(electionGeneralDefinition);

  render(
    <App
      hardware={MemoryHardware.buildStandard()}
      storage={new MemoryStorage()}
      reload={jest.fn()}
      logger={fakeLogger()}
      apiClient={apiMock.mockApiClient}
    />
  );

  apiMock.expectConfigureBallotPackageFromUsbError('election_hash_mismatch');
  apiMock.expectGetSystemSettings();
  apiMock.expectGetElectionDefinition(null);
  apiMock.setUsbDriveStatus(mockUsbDriveStatus('mounted'));
  await screen.findByText('Configuring VxMark from USB drive…');
  await screen.findByText(
    'The most recent ballot package found is for a different election.'
  );
});
