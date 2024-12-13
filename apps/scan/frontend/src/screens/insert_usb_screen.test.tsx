import { vi, beforeEach, afterEach, test, expect } from 'vitest';
import { render as baseRender } from '../../test/react_testing_library';
import { InsertUsbScreen } from './insert_usb_screen';
import { useSound } from '../utils/use_sound';
import {
  ApiMock,
  createApiMock,
  provideApi,
  statusNoPaper,
} from '../../test/helpers/mock_api_client';

vi.mock('../utils/use_sound');
let apiMock: ApiMock;

const mockUseSound = vi.mocked(useSound);

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
  const mockPlaySound = vi.fn();
  mockUseSound.mockReturnValue(mockPlaySound);
  return {
    mockPlaySound,
    render: (ui: React.ReactNode) => baseRender(provideApi(apiMock, ui)),
  };
}

test('plays sound on open', () => {
  const { mockPlaySound, render } = setUp();
  expect(mockPlaySound).not.toHaveBeenCalled();
  render(<InsertUsbScreen />);
  expect(mockPlaySound).toHaveBeenCalled();
});
