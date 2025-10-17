import { beforeEach, afterEach, test, vi } from 'vitest';
import { PollsState } from '@votingworks/types';
import { render as baseRender } from '../../test/react_testing_library';
import { InsertUsbScreen } from './insert_usb_screen';
import {
  ApiMock,
  createApiMock,
  provideApi,
  statusNoPaper,
} from '../../test/helpers/mock_api_client';

vi.useFakeTimers({ shouldAdvanceTime: true });

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

function setUp() {
  return {
    render: (ui: React.ReactNode) => baseRender(provideApi(apiMock, ui)),
  };
}

test.each<{
  disableAlarm?: boolean;
  pollsState: PollsState;
  isSoundExpected?: boolean;
}>([
  { pollsState: 'polls_closed_initial', isSoundExpected: false },
  { pollsState: 'polls_open', isSoundExpected: true },
  { pollsState: 'polls_closed_final', isSoundExpected: false },
  {
    disableAlarm: true,
    pollsState: 'polls_open',
    isSoundExpected: false,
  },
])(
  'Alarm plays when expected',
  ({ disableAlarm, pollsState, isSoundExpected }) => {
    const { render } = setUp();

    if (isSoundExpected) {
      // Expect two or more plays
      apiMock.expectPlaySound('alarm');
      apiMock.expectPlaySoundRepeated('alarm');
    }

    render(
      <InsertUsbScreen disableAlarm={disableAlarm} pollsState={pollsState} />
    );
    vi.advanceTimersByTime(5000);
  }
);
