import React from 'react';
import { MemoryHardware, MemoryStorage } from '@votingworks/utils';
import { electionMinimalExhaustiveSampleSinglePrecinctDefinition } from '@votingworks/fixtures';
import { ElectionDefinition, getDisplayElectionHash } from '@votingworks/types';
import { ok } from '@votingworks/basics';
import { fakeKiosk, fakeUsbDrive } from '@votingworks/test-utils';
import { screen } from '../test/react_testing_library';
import { render } from '../test/test_utils';
import { App } from './app';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';

let apiMock: ApiMock;
let kiosk = fakeKiosk();

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
  apiMock = createApiMock();
  kiosk = fakeKiosk();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

jest.setTimeout(15000);

function insertUsbDriveWithBallotPackage(
  electionDefinition: ElectionDefinition
) {
  kiosk.getUsbDriveInfo.mockResolvedValue([fakeUsbDrive()]);
  apiMock.mockApiClient.configureBallotPackageFromUsb
    .expectCallWith({ electionHash: undefined })
    .resolves(ok(electionDefinition));
  window.kiosk = kiosk;
}

test('loading election with a single precinct automatically sets precinct', async () => {
  const electionDefinition =
    electionMinimalExhaustiveSampleSinglePrecinctDefinition;
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetElectionDefinition(null);

  render(
    <App
      hardware={hardware}
      storage={storage}
      apiClient={apiMock.mockApiClient}
      reload={jest.fn()}
    />
  );

  await screen.findByText('VxMark is Not Configured');

  apiMock.setAuthStatusElectionManagerLoggedIn(electionDefinition);
  apiMock.expectGetElectionDefinition(electionDefinition);

  // Insert a USB with a ballot package
  insertUsbDriveWithBallotPackage(electionDefinition);

  await screen.findByText('Configuring VxMark from USB drive…');
  await screen.findByText(getDisplayElectionHash(electionDefinition));
  // Should not be able to select a precinct
  expect(screen.getByTestId('selectPrecinct')).toBeDisabled();
  screen.getByText(
    'Precinct cannot be changed because there is only one precinct configured for this election.'
  );
  apiMock.setAuthStatusLoggedOut();
  await screen.findByText('Precinct 1');
});
