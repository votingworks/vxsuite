import { beforeEach, afterEach, test } from 'vitest';
import { render, screen } from '../../test/react_testing_library';
import { ScanErrorScreen } from './scan_error_screen';
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

test('render correct unreadable ballot screen', async () => {
  render(
    provideApi(
      apiMock,
      <ScanErrorScreen error="unreadable" isTestMode scannedBallotCount={42} />
    )
  );
  await screen.findByText('Ballot Scan Failed');
  await screen.findByText(
    'There was a problem scanning your ballot. Please scan it again.'
  );
  await screen.findByText('Ask a poll worker if you need help.');
});

test('render correct test ballot error screen when we are in test mode', async () => {
  render(
    provideApi(
      apiMock,
      <ScanErrorScreen
        error="invalid_test_mode"
        isTestMode
        scannedBallotCount={42}
      />
    )
  );
  await screen.findByText('Official Ballot');
  await screen.findByText(
    'The scanner is in test ballot mode. Official ballots may not be scanned.'
  );
  await screen.findByText('Please ask a poll worker for help.');
});

test('render correct test ballot error screen when we are in live mode', async () => {
  render(
    provideApi(
      apiMock,
      <ScanErrorScreen
        error="invalid_test_mode"
        isTestMode={false}
        scannedBallotCount={42}
      />
    )
  );
  await screen.findByText('Test Ballot');
  await screen.findByText(
    'The scanner is in official ballot mode. Test ballots may not be scanned.'
  );
  await screen.findByText('Please ask a poll worker for help.');
});

test('render correct invalid precinct screen', async () => {
  render(
    provideApi(
      apiMock,
      <ScanErrorScreen
        error="invalid_precinct"
        isTestMode
        scannedBallotCount={42}
      />
    )
  );
  await screen.findByText('Wrong Precinct');
  await screen.findByText(
    'The scanner is configured for a precinct that does not match the ballot.'
  );
  await screen.findByText('Please ask a poll worker for help.');
});

test('render correct invalid ballot hash screen', async () => {
  render(
    provideApi(
      apiMock,
      <ScanErrorScreen
        error="invalid_ballot_hash"
        isTestMode={false}
        scannedBallotCount={42}
      />
    )
  );
  await screen.findByText('Wrong Election');
  await screen.findByText(
    'The scanner is configured for an election that does not match the ballot.'
  );
  await screen.findByText('Please ask a poll worker for help.');
});

test('render correct BMD ballot scanning disabled screen', async () => {
  render(
    provideApi(
      apiMock,
      <ScanErrorScreen
        error="bmd_ballot_scanning_disabled"
        isTestMode={false}
        scannedBallotCount={42}
      />
    )
  );
  await screen.findByText('BMD Ballot');
  await screen.findByText(
    'The scanner cannot scan BMD ballots. Use a central scanner instead.'
  );
  await screen.findByText('Please ask a poll worker for help.');
});

test('warning when scanner needs cleaning', async () => {
  render(
    provideApi(
      apiMock,
      <ScanErrorScreen
        error="vertical_streaks_detected"
        isTestMode
        scannedBallotCount={42}
      />
    )
  );
  await screen.findByText('Scanner Needs Cleaning');
  await screen.findByText(
    'The ballot was not counted. Scan it again after cleaning.'
  );
  await screen.findByText('Please ask a poll worker for help.');
});

test('double feed error screen', async () => {
  render(
    provideApi(
      apiMock,
      <ScanErrorScreen
        error="double_feed_detected"
        isTestMode
        scannedBallotCount={42}
      />
    )
  );
  await screen.findByText('Multiple Sheets Detected');
  await screen.findByText('Remove your ballot and insert one sheet at a time.');
  await screen.findByText('Ask a poll worker if you need help.');
});

test('recoverable error screen', async () => {
  render(
    provideApi(
      apiMock,
      <ScanErrorScreen
        error="paper_in_back_after_reconnect"
        isTestMode
        scannedBallotCount={42}
      />
    )
  );
  await screen.findByText('Scanner Error');
  await screen.findByText(
    'The ballot was not counted. Please remove the ballot to continue.'
  );
  await screen.findByText('Ask a poll worker if you need help.');
});

test('restart required', async () => {
  render(
    provideApi(
      apiMock,
      <ScanErrorScreen
        restartRequired
        error="client_error"
        isTestMode
        scannedBallotCount={42}
      />
    )
  );
  await screen.findByText('Scanner Error');
  await screen.findByText(
    'The ballot was not counted. Ask a poll worker to restart the scanner.'
  );
});
