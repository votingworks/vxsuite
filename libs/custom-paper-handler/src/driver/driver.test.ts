import { assert } from '@votingworks/basics';
import { mocks } from '@votingworks/custom-scanner';
import { Buffer } from 'buffer';
import { Device, findByIds, WebUSBDevice } from 'usb';
import {
  GENERIC_ENDPOINT_OUT,
  REAL_TIME_ENDPOINT_IN,
  REAL_TIME_ENDPOINT_OUT,
  getPaperHandlerWebDevice,
  PaperHandlerDriver,
  PACKET_SIZE,
  RealTimeRequestIds,
  TOKEN,
  ReturnCodes,
  NULL_CODE,
} from './driver';
import { ScannerStatus } from './sensors';
import { Uint8 } from '../bits';

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
  const { paperHandlerWebDevice } = await getMockWebUsbDevice();
  const paperHandlerDriver = new PaperHandlerDriver(paperHandlerWebDevice);
  await paperHandlerDriver.connect();

  // await paperHandlerWebDevice.selectConfiguration(1);

  const transferOutStub = jest.fn();
  paperHandlerWebDevice.transferOut = transferOutStub;

  await paperHandlerDriver.initializePrinter();
  expect(paperHandlerWebDevice.transferOut).toHaveBeenCalledTimes(1);
  expect(paperHandlerWebDevice.transferOut).toHaveBeenCalledWith(
    GENERIC_ENDPOINT_OUT,
    // new Uint8Array([0x1b, 0x40])
    Buffer.from([0x1b, 0x40])
  );
});

test('getScannerStatus sends the correct message', async () => {
  const { mockWebUsbDevice, paperHandlerWebDevice } =
    await getMockWebUsbDevice();
  const paperHandlerDriver = new PaperHandlerDriver(paperHandlerWebDevice);
  await paperHandlerDriver.connect();

  // await paperHandlerWebDevice.selectConfiguration(1);

  const transferOutSpy = jest.spyOn(mockWebUsbDevice, 'transferOut');
  // How test values are chosen:
  // Choose non-palindrome value so we know we're parsing in the right direction.
  // 8 in 2^1 position should map to 4 most significant bits in expectedStatus ie. parkSensor ... paperPreCisSensor.
  // f in 2^0 position should map to 4 least significant bits in expected status ie. paperInputLeftInnerSensor ... paperInputRightOuterSensor
  // 0x8f == 0b10001111 so we expect
  // (parkSensor, ...                                  , paperInputRightOuterSensor)
  // (true      , false, false, false, true, true, true, true                      )
  const firstByteOfStatusResponse: Uint8 = 0x8f;
  // Respect fixed null character at 0x80
  const secondByteOfStatusResponse: Uint8 = 0x4f;
  // Respect fixed null characters from 0x10 to 0x80
  const thirdByteOfStatusResponse: Uint8 = 0x08;
  // All null characters
  const fourthByteOfStatusResponse: Uint8 = 0x00;

  await mockWebUsbDevice.mockAddTransferInData(
    REAL_TIME_ENDPOINT_IN,
    Buffer.from([
      0x82,
      RealTimeRequestIds.SCANNER_COMPLETE_STATUS_REQUEST_ID,
      TOKEN,
      ReturnCodes.POSITIVE_ACKNOWLEDGEMENT,
      0x04,
      firstByteOfStatusResponse,
      secondByteOfStatusResponse,
      thirdByteOfStatusResponse,
      fourthByteOfStatusResponse,
    ])
  );

  const result = await paperHandlerDriver.getScannerStatus();
  expect(transferOutSpy).toHaveBeenCalledTimes(1);
  expect(transferOutSpy).toHaveBeenCalledWith(
    REAL_TIME_ENDPOINT_OUT,
    Buffer.from([
      0x02,
      RealTimeRequestIds.SCANNER_COMPLETE_STATUS_REQUEST_ID,
      TOKEN,
      NULL_CODE,
    ])
  );

  // See the ScannerStatus type for more information on position of these values in the bitmap
  const expectedStatus: ScannerStatus = {
    // First byte, MSB leftmost bit
    parkSensor: true,
    paperOutSensor: false,
    paperPostCisSensor: false,
    paperPreCisSensor: false,
    paperInputLeftInnerSensor: true,
    paperInputRightInnerSensor: true,
    paperInputLeftOuterSensor: true,
    paperInputRightOuterSensor: true,

    // Second byte, MSB leftmost bit
    // 0x80 fixed to 0
    printHeadInPosition: true,
    scanTimeout: false,
    motorMove: false,
    scanInProgress: true,
    jamEncoder: true,
    paperJam: true,
    coverOpen: true,

    // Third byte, MSB leftmost bit
    // 0x80 fixed to 0
    // 0x40 fixed to 0
    // 0x20 fixed to 0
    // 0x10 fixed to 0
    optoSensor: true,
    ballotBoxDoorSensor: false,
    ballotBoxAttachSensor: false,
    preHeadSensor: false,
  };
  expect(result).toEqual(expectedStatus);
});
