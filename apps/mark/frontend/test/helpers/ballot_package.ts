import { FakeKiosk, fakeUsbDrive } from '@votingworks/test-utils';
import { ElectionDefinition } from '@votingworks/types';
import { VxScreen } from '@votingworks/ui';
import { ApiMock } from './mock_api_client';

/**
 * Simulates inserting a USB drive, configuring the backend with an election definition,
 * and removing the USB drive.
 * @param apiMock
 * @param kiosk
 * @param screen
 * @param electionDefinition The election definition to return from apiMock.
 */
export async function configureFromUsbThenRemove(
  apiMock: ApiMock,
  kiosk: FakeKiosk,
  screen: VxScreen,
  electionDefinition: ElectionDefinition
): Promise<void> {
  // Insert USB
  apiMock.expectConfigureBallotPackageFromUsb(electionDefinition);
  apiMock.expectGetElectionDefinition(electionDefinition);
  kiosk.getUsbDriveInfo.mockResolvedValue([fakeUsbDrive()]);

  // Remove USB after configuration is done
  await screen.findByText('Configuring VxMark from USB drive…');
  await screen.findByText('Election Definition is loaded.');
  kiosk.getUsbDriveInfo.mockResolvedValue([]);
}
