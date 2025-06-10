import { beforeEach, afterEach, test } from 'vitest';
import { render as baseRender } from '../../test/react_testing_library';
import { InsertUsbScreen } from './insert_usb_screen';
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

function setUp() {
  return {
    render: (ui: React.ReactNode) => baseRender(provideApi(apiMock, ui)),
  };
}

test('plays sound on open', () => {
  const { render } = setUp();
  apiMock.expectPlaySound('alarm');

  render(<InsertUsbScreen />);
});
