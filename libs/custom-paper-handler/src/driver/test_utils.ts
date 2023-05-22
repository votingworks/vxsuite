import { Device, WebUSBDevice, findByIds } from 'usb';
import { mocks } from '@votingworks/custom-scanner';
import {
  REAL_TIME_ENDPOINT_IN,
  REAL_TIME_ENDPOINT_OUT,
  PACKET_SIZE,
} from './driver';

type MockWebUsbDevice = mocks.MockWebUsbDevice;

const TEST_ALTERNATE_INTERFACE: USBAlternateInterface = {
  alternateSetting: 3,
  interfaceClass: 4,
  interfaceSubclass: 5,
  interfaceProtocol: 6,
  interfaceName: '7',
  endpoints: [
    {
      endpointNumber: 1,
      direction: 'in',
      type: 'bulk',
      packetSize: PACKET_SIZE,
    },
    {
      endpointNumber: 2,
      direction: 'out',
      type: 'bulk',
      packetSize: PACKET_SIZE,
    },
    {
      endpointNumber: REAL_TIME_ENDPOINT_IN,
      direction: 'in',
      type: 'bulk',
      packetSize: PACKET_SIZE,
    },
    {
      endpointNumber: REAL_TIME_ENDPOINT_OUT,
      direction: 'out',
      type: 'bulk',
      packetSize: PACKET_SIZE,
    },
  ],
};

const TEST_INTERFACE: USBInterface = {
  interfaceNumber: 0,
  alternate: TEST_ALTERNATE_INTERFACE,
  alternates: [TEST_ALTERNATE_INTERFACE],
  claimed: false,
};

export const TEST_CONFIGURATION: USBConfiguration = {
  configurationValue: 1,
  interfaces: [TEST_INTERFACE],
  configurationName: 'test',
};

/**
 * Sets up a mock WebUsbDevice and returns it
 */
export function setUpMockWebUsbDevice(
  findByIdsMock: jest.MockedFunction<typeof findByIds>,
  createInstanceMock: jest.MockedFunction<typeof WebUSBDevice.createInstance>
): {
  legacyDevice: Device;
  mockWebUsbDevice: MockWebUsbDevice;
} {
  const legacyDevice = {} as unknown as Device;
  findByIdsMock.mockReturnValueOnce(legacyDevice);

  const mockWebUsbDevice = mocks.mockWebUsbDevice();
  createInstanceMock.mockResolvedValueOnce(
    mockWebUsbDevice as unknown as WebUSBDevice
  );
  mockWebUsbDevice.mockSetConfiguration(TEST_CONFIGURATION);

  return { legacyDevice, mockWebUsbDevice };
}
