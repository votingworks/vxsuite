import { beforeEach, afterEach, test } from 'vitest';
import { render, screen } from '../../test/react_testing_library';
import { ScanDoubleSheetScreen } from './scan_double_sheet_screen';
import {
  ApiMock,
  createApiMock,
  provideApi,
  statusNoPaper,
} from '../../test/helpers/mock_api_client';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetConfig();
  apiMock.expectGetScannerStatus(statusNoPaper);
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('renders double sheet screen as expected', async () => {
  render(
    provideApi(
      apiMock,
      <ScanDoubleSheetScreen
        scannedBallotCount={42}
        isTestMode={false}
        isEarlyVotingMode={false}
      />
    )
  );
  await screen.findByText('Multiple Sheets Detected');
  await screen.findByText('Remove your ballot and insert one sheet at a time.');
});
