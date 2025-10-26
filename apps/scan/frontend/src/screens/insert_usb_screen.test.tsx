import { createMemoryHistory, MemoryHistory } from 'history';
import { Router } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  ApiMock,
  createApiMock,
  provideApi,
  statusNoPaper,
} from '../../test/helpers/mock_api_client';
import { render as baseRender, screen } from '../../test/react_testing_library';
import { InsertUsbScreen, InsertUsbScreenProps } from './insert_usb_screen';

vi.useFakeTimers({ shouldAdvanceTime: true });

let apiMock: ApiMock;
let history: MemoryHistory;

beforeEach(() => {
  apiMock = createApiMock();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetConfig();
  apiMock.expectGetScannerStatus(statusNoPaper);

  history = createMemoryHistory();
  history.push('/');
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

function setUp() {
  return {
    render: (ui: React.ReactNode) =>
      baseRender(provideApi(apiMock, <Router history={history}>{ui}</Router>)),
  };
}

test.each<{
  props: InsertUsbScreenProps;
  isSoundExpected: boolean;
  expectedBody: string;
  isPollWorkerDismissalPromptExpected: boolean;
  areSettingsButtonsExpectedToBePresent: boolean;
  areSettingsButtonsExpectedToBeEnabled: boolean;
}>([
  {
    props: { pollsState: 'polls_closed_initial' },
    isSoundExpected: false,
    expectedBody: 'Insert a USB drive into the USB hub.',
    isPollWorkerDismissalPromptExpected: false,
    areSettingsButtonsExpectedToBePresent: false,
    areSettingsButtonsExpectedToBeEnabled: false,
  },
  {
    props: { pollsState: 'polls_open' },
    isSoundExpected: true,
    expectedBody: 'Please ask a poll worker for help.',
    isPollWorkerDismissalPromptExpected: true,
    areSettingsButtonsExpectedToBePresent: true,
    areSettingsButtonsExpectedToBeEnabled: false,
  },
  {
    props: { pollsState: 'polls_open', disableAlarm: true },
    isSoundExpected: false,
    expectedBody: 'Please ask a poll worker for help.',
    isPollWorkerDismissalPromptExpected: false,
    areSettingsButtonsExpectedToBePresent: true,
    areSettingsButtonsExpectedToBeEnabled: true,
  },
])(
  'Alarm plays when expected - pollsState = $pollsState, disableAlarm = $disableAlarm',
  async ({
    props,
    isSoundExpected,
    expectedBody,
    isPollWorkerDismissalPromptExpected,
    areSettingsButtonsExpectedToBePresent,
    areSettingsButtonsExpectedToBeEnabled,
  }) => {
    const { render } = setUp();

    if (isSoundExpected) {
      // Expect two or more plays
      apiMock.expectPlaySound('alarm');
      apiMock.expectPlaySoundRepeated('alarm');
    }

    render(<InsertUsbScreen {...props} />);
    vi.advanceTimersByTime(5000);

    await screen.findByText('No USB Drive Detected');
    await screen.findByText(expectedBody);
    if (isPollWorkerDismissalPromptExpected) {
      await screen.findByText(
        'Insert a poll worker card to dismiss the alarm.'
      );
    } else {
      expect(
        screen.queryByText('Insert a poll worker card to dismiss the alarm.')
      ).not.toBeInTheDocument();
    }

    if (areSettingsButtonsExpectedToBePresent) {
      const settingsButton = await screen.findByRole('button', {
        name: 'Settings',
      });
      if (areSettingsButtonsExpectedToBeEnabled) {
        expect(settingsButton).toBeEnabled();
      } else {
        expect(settingsButton).toBeDisabled();
      }
    }
  }
);
