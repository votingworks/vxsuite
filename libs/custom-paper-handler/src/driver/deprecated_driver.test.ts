import { assert } from '@votingworks/basics';
import { mocks } from '@votingworks/custom-scanner';
import { Device, findByIds, WebUSBDevice } from 'usb';
import {
  GENERIC_ENDPOINT_OUT,
  getPaperHandlerWebDevice,
  PaperHandlerDriver,
} from './deprecated_driver';

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
      packetSize: 11,
    },
    {
      endpointNumber: 2,
      direction: 'out',
      type: 'bulk',
      packetSize: 11,
    },
  ],
};

const TEST_INTERFACE: USBInterface = {
  interfaceNumber: 0,
  alternate: TEST_ALTERNATE_INTERFACE,
  alternates: [TEST_ALTERNATE_INTERFACE],
  claimed: false,
};

const TEST_CONFIGURATION: USBConfiguration = {
  configurationValue: 1,
  interfaces: [TEST_INTERFACE],
  configurationName: 'test',
};

jest.mock('usb');
const findByIdsMock = findByIds as jest.MockedFunction<typeof findByIds>;
const createInstanceMock = WebUSBDevice.createInstance as jest.MockedFunction<
  typeof WebUSBDevice.createInstance
>;

async function getMockWebUsbDevice(): Promise<{
  legacyDevice: Device;
  mockWebUsbDevice: MockWebUsbDevice;
  paperHandlerWebDevice: WebUSBDevice;
}> {
  const legacyDevice = {} as unknown as Device;
  findByIdsMock.mockReturnValueOnce(legacyDevice);

  // mockWebUsbDevice and paperHandlerWebDevice are the same device but typed differently.
  // Is there a way to return just one?

  const mockWebUsbDevice = mocks.mockWebUsbDevice();
  createInstanceMock.mockResolvedValueOnce(
    mockWebUsbDevice as unknown as WebUSBDevice
  );
  mockWebUsbDevice.mockSetConfiguration(TEST_CONFIGURATION);

  const paperHandlerWebDevice = await getPaperHandlerWebDevice();
  assert(paperHandlerWebDevice);

  return { paperHandlerWebDevice, mockWebUsbDevice, legacyDevice };
}

test('getPaperHandlerWebDevice calls createInstanceMock when successful', async () => {
  const { legacyDevice } = await getMockWebUsbDevice();
  expect(createInstanceMock).toHaveBeenCalledWith(legacyDevice);
});

test('getPaperHandlerWebDevice returns undefined when findByIds returns no devices', async () => {
  findByIdsMock.mockReturnValueOnce(undefined);

  const device = await getPaperHandlerWebDevice();
  expect(device).toBeUndefined();
  expect(createInstanceMock).not.toHaveBeenCalled();
});

test('getPaperHandlerWebDevice errors when createInstance returns an error', async () => {
  const legacyDevice = {} as unknown as Device;
  findByIdsMock.mockReturnValueOnce(legacyDevice);
  createInstanceMock.mockRejectedValueOnce(new Error('test'));

  await expect(getPaperHandlerWebDevice()).rejects.toThrow(
    'Error initializing WebUSBDevice with message: test'
  );
  expect(createInstanceMock).toHaveBeenCalledTimes(1);
});

test('connect calls WebUSBDevice.open', async () => {
  const { paperHandlerWebDevice } = await getMockWebUsbDevice();
  const paperHandlerDriver = new PaperHandlerDriver(paperHandlerWebDevice);

  const openSpy = jest.spyOn(paperHandlerWebDevice, 'open');

  await paperHandlerDriver.connect();

  expect(openSpy).toHaveBeenCalledTimes(1);
});

test('initializePrinter sends the correct message', async () => {
  const { mockWebUsbDevice, paperHandlerWebDevice } =
    await getMockWebUsbDevice();
  const paperHandlerDriver = new PaperHandlerDriver(paperHandlerWebDevice);
  await paperHandlerDriver.connect();

  mockWebUsbDevice.mockSetConfiguration(TEST_CONFIGURATION);
  await paperHandlerWebDevice.selectConfiguration(1);

  const transferOutStub = jest.fn();
  paperHandlerWebDevice.transferOut = transferOutStub;
  await paperHandlerDriver.initializePrinter();
  expect(paperHandlerWebDevice.transferOut).toHaveBeenCalledTimes(1);
  expect(paperHandlerWebDevice.transferOut).toHaveBeenCalledWith(
    GENERIC_ENDPOINT_OUT,
    new Uint8Array([0x1b, 0x40])
  );
});
