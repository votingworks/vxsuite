import { assert } from '@votingworks/basics';
import { mocks } from '@votingworks/custom-scanner';
import { Buffer } from 'buffer';
import { findByIds, WebUSBDevice } from 'usb';
import { Uint16 } from '@votingworks/message-coder';
import { mockOf } from '@votingworks/test-utils';
import {
  GENERIC_ENDPOINT_OUT,
  REAL_TIME_ENDPOINT_IN,
  REAL_TIME_ENDPOINT_OUT,
  getPaperHandlerWebDevice,
  PaperHandlerDriver,
  RealTimeRequestIds,
  ReturnCodes,
  GENERIC_ENDPOINT_IN,
} from './driver';
import { TOKEN, NULL_CODE } from './constants';
import { PrinterStatus, ScannerStatus } from './sensors';
import { setUpMockWebUsbDevice } from './test_utils';

type MockWebUsbDevice = mocks.MockWebUsbDevice;

jest.mock('usb');
const findByIdsMock = mockOf(findByIds);
const createInstanceMock = mockOf(WebUSBDevice.createInstance);

let mockWebUsbDevice: MockWebUsbDevice;
let paperHandlerWebDevice: WebUSBDevice;
let paperHandlerDriver: PaperHandlerDriver;

export async function setUpMocksAndDriver(): Promise<void> {
  // setUpMockWebUsbDevice creates a MockWebUsbDevice (A) that represents the paper handler.
  // getPaperHandlerWebDevice is the driver function that returns the underlying WebUSBDevice (B).
  // In this case, A and B are the same, but we need to return both because (A) is the mock type and (B)
  // is the standard WebUSBDevice type. Some tests require both types.
  const mockDevices = setUpMockWebUsbDevice(findByIdsMock, createInstanceMock);
  mockWebUsbDevice = mockDevices.mockWebUsbDevice;

  paperHandlerWebDevice = (await getPaperHandlerWebDevice()) as WebUSBDevice;
  assert(paperHandlerWebDevice);

  paperHandlerDriver = new PaperHandlerDriver(paperHandlerWebDevice);
  await paperHandlerDriver.connect();
}

beforeEach(async () => {
  await setUpMocksAndDriver();
});

test('initializePrinter sends the correct message', async () => {
  const transferOutStub = jest.fn();
  paperHandlerWebDevice.transferOut = transferOutStub;

  await paperHandlerDriver.initializePrinter();
  expect(paperHandlerWebDevice.transferOut).toHaveBeenCalledTimes(1);
  expect(paperHandlerWebDevice.transferOut).toHaveBeenCalledWith(
    GENERIC_ENDPOINT_OUT,
    Uint8Array.from([0x1b, 0x40])
  );
});

test('getScannerStatus sends the correct message and can parse a response', async () => {
  const transferOutSpy = jest.spyOn(mockWebUsbDevice, 'transferOut');

  // How test values are chosen:
  // Choose non-palindrome value so we know we're parsing in the right order. eg. for first byte:
  // 8 in left position should map to 4 most significant bits in expectedStatus ie. parkSensor ... paperPreCisSensor.
  // f in right position should map to 4 least significant bits in expected status ie. paperInputLeftInnerSensor ... paperInputRightOuterSensor
  // 0x8f == 0b10001111 so we expect
  // (parkSensor, ...                                  , paperInputRightOuterSensor)
  // (true      , false, false, false, true, true, true, true                      )
  const optionalResponseBytes = [
    0x8f,
    // Respect fixed null character at 0x80
    0x4f,
    // Respect fixed null characters from 0x10 to 0x80
    0x08,
    // All null characters
    0x00,
  ];

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

  await mockWebUsbDevice.mockAddTransferInData(
    REAL_TIME_ENDPOINT_IN,
    Buffer.from([
      0x82,
      RealTimeRequestIds.SCANNER_COMPLETE_STATUS_REQUEST_ID,
      TOKEN,
      ReturnCodes.POSITIVE_ACKNOWLEDGEMENT,
      0x04,
      ...optionalResponseBytes,
    ])
  );

  const result = await paperHandlerDriver.getScannerStatus();
  expect(transferOutSpy).toHaveBeenCalledTimes(1);
  const input = Uint8Array.from([
    0x02,
    RealTimeRequestIds.SCANNER_COMPLETE_STATUS_REQUEST_ID,
    TOKEN,
    NULL_CODE,
  ]);
  expect(transferOutSpy).toHaveBeenCalledWith(REAL_TIME_ENDPOINT_OUT, input);

  expect(result).toEqual(expectedStatus);
});

test('getPrinterStatus sends the correct message and can parse a response', async () => {
  const transferOutSpy = jest.spyOn(mockWebUsbDevice, 'transferOut');
  const expectedStatus: PrinterStatus = {
    paperNotPresent: false,
    ticketPresentInOutput: true,

    dragPaperMotorOn: true,
    spooling: true,
    coverOpen: false,
    printingHeadUpError: false,

    notAcknowledgeCommandError: false,
    powerSupplyVoltageError: false,
    headNotConnected: false,
    comError: true,
    headTemperatureError: false,

    diverterError: true,
    headErrorLocked: false,
    printingHeadReadyToPrint: false,
    eepromError: false,
    ramError: false,
  };

  const optionalDataBytes = [
    // fixed
    0x10,
    // fixed
    0x0f,
    // paper status
    0x20,
    // user status
    0x0c,
    // recoverable error status
    0x02,
    // unrecoverable error status
    0x80,
  ];

  await mockWebUsbDevice.mockAddTransferInData(
    REAL_TIME_ENDPOINT_IN,
    Buffer.from([
      0x82,
      RealTimeRequestIds.PRINTER_STATUS_REQUEST_ID,
      TOKEN,
      ReturnCodes.POSITIVE_ACKNOWLEDGEMENT,
      0x06, // 6 bytes of optional data
      ...optionalDataBytes,
    ])
  );

  const result = await paperHandlerDriver.getPrinterStatus();
  expect(transferOutSpy).toHaveBeenCalledTimes(1);
  const input = Uint8Array.from([
    0x02,
    RealTimeRequestIds.PRINTER_STATUS_REQUEST_ID,
    TOKEN,
    NULL_CODE,
  ]);
  expect(transferOutSpy).toHaveBeenCalledWith(REAL_TIME_ENDPOINT_OUT, input);

  expect(result).toEqual(expectedStatus);
});

const testsWithNoAdditionalResponseData = [
  {
    description: 'abortScan',
    requestId: RealTimeRequestIds.SCAN_ABORT_REQUEST_ID,
    functionToTest: PaperHandlerDriver.prototype.abortScan,
  },
  {
    description: 'resetScan',
    requestId: RealTimeRequestIds.SCAN_RESET_REQUEST_ID,
    functionToTest: PaperHandlerDriver.prototype.resetScan,
  },
];
test.each(testsWithNoAdditionalResponseData)(
  `$description sends the correct message`,
  async ({ requestId, functionToTest }) => {
    const transferOutSpy = jest.spyOn(mockWebUsbDevice, 'transferOut');
    await mockWebUsbDevice.mockAddTransferInData(
      REAL_TIME_ENDPOINT_IN,
      Buffer.from([
        0x82,
        requestId,
        TOKEN,
        ReturnCodes.POSITIVE_ACKNOWLEDGEMENT,
        0x00, // no additional data
      ])
    );

    await functionToTest.call(paperHandlerDriver);
    expect(transferOutSpy).toHaveBeenCalledTimes(1);
    expect(transferOutSpy).toHaveBeenCalledWith(
      REAL_TIME_ENDPOINT_OUT,
      Uint8Array.from([0x02, requestId, TOKEN, NULL_CODE])
    );
  }
);

const scannerCommands = [
  {
    description: 'load paper',
    command: [0x1c, 0x53, 0x50, 0x4c],
    functionToTest: PaperHandlerDriver.prototype.loadPaper,
  },
  {
    description: 'park paper',
    command: [0x1c, 0x53, 0x50, 0x50],
    functionToTest: PaperHandlerDriver.prototype.parkPaper,
  },
  {
    description: 'eject paper',
    command: [0x1c, 0x53, 0x50, 0x45],
    functionToTest: PaperHandlerDriver.prototype.ejectPaper,
  },
  {
    description: 'present paper and hold',
    command: [0x1c, 0x53, 0x50, 0x46],
    functionToTest: PaperHandlerDriver.prototype.presentPaper,
  },
  {
    description: 'eject paper to ballot',
    command: [0x1c, 0x53, 0x50, 0x48],
    functionToTest: PaperHandlerDriver.prototype.ejectBallot,
  },
  {
    description: 'scanner calibration',
    command: [0x1f, 0x43],
    functionToTest: PaperHandlerDriver.prototype.calibrate,
  },
  {
    description: 'enable print',
    command: [0x1f, 0x45],
    functionToTest: PaperHandlerDriver.prototype.enablePrint,
  },
  {
    description: 'disable print',
    command: [0x1f, 0x65],
    functionToTest: PaperHandlerDriver.prototype.disablePrint,
  },
];
test.each(scannerCommands)(
  `commands that take no input: "$description" sends the correct message`,
  async ({ command, functionToTest }) => {
    const transferOutSpy = jest.spyOn(mockWebUsbDevice, 'transferOut');
    await mockWebUsbDevice.mockAddTransferInData(
      GENERIC_ENDPOINT_IN,
      Buffer.from([ReturnCodes.POSITIVE_ACKNOWLEDGEMENT])
    );
    await functionToTest.call(paperHandlerDriver);
    expect(transferOutSpy).toHaveBeenCalledWith(
      GENERIC_ENDPOINT_OUT,
      Uint8Array.from(command)
    );
  }
);

function getExpectedDefaultTransferOut() {
  return [
    // Fixed command, 4 bytes
    0x1c, 0x53, 0x50, 0x43,
    // Option paper
    0x00,
    // Option sensor
    0x00,
    // Flags
    0x00,
    // Cis
    0x00,
    // Scan
    0x05,
    // Horizontal resolution, 2 bytes
    0x00, 0xc8,
    // Vertical resolution, 2 bytes
    0x00, 0xc8,
    // Horizontal resolution, 2 bytes
    0x06, 0xc0,
    // Vertical resolution max, 4 bytes
    0x00, 0x00, 0x00, 0x00,
  ];
}

/**
 * Convenience function for asserting that a transfer out was successful
 * 1. Sets up a positive ack mock transfer in response
 * 2. Runs a function expected to wrap a PaperHandlerDriver method
 * 3. Asserts the call to the web device's transferOut function was as expected
 */
async function expectScanConfigTransferOut(
  transferOutSpy: jest.SpyInstance,
  expectation: number[],
  testFn: () => Promise<boolean>
): Promise<void> {
  await mockWebUsbDevice.mockAddTransferInData(
    GENERIC_ENDPOINT_IN,
    Buffer.from([ReturnCodes.POSITIVE_ACKNOWLEDGEMENT])
  );

  await testFn();
  expect(transferOutSpy).toHaveBeenCalledWith(
    GENERIC_ENDPOINT_OUT,
    Uint8Array.from(expectation)
  );
}

test('configure scanner can encode scanner config', async () => {
  const transferOutSpy = jest.spyOn(mockWebUsbDevice, 'transferOut');
  const expectation = getExpectedDefaultTransferOut();
  await expectScanConfigTransferOut(
    transferOutSpy,
    expectation,
    async () => await paperHandlerDriver.syncScannerConfig()
  );
});

test('driver can update scan light config and scan data format', async () => {
  // Position of the scan type byte in the command data
  const SCAN_BYTE_INDEX = 8;

  const transferOutSpy = jest.spyOn(mockWebUsbDevice, 'transferOut');
  const expectation = getExpectedDefaultTransferOut();
  await expectScanConfigTransferOut(
    transferOutSpy,
    expectation,
    async () => await paperHandlerDriver.syncScannerConfig()
  );

  // Update scan type to {grayscale, red light} and expect 0x01
  expectation[SCAN_BYTE_INDEX] = 0x01;
  await expectScanConfigTransferOut(
    transferOutSpy,
    expectation,
    async () => await paperHandlerDriver.setScanLight('red')
  );

  // Update scan type to {bw, red light} and expect 0x08
  expectation[SCAN_BYTE_INDEX] = 0x08;
  await expectScanConfigTransferOut(
    transferOutSpy,
    expectation,
    async () => await paperHandlerDriver.setScanDataFormat('BW')
  );
});

test('driver can update scan resolution', async () => {
  const transferOutSpy = jest.spyOn(mockWebUsbDevice, 'transferOut');
  const expectation = getExpectedDefaultTransferOut();
  await expectScanConfigTransferOut(
    transferOutSpy,
    expectation,
    async () => await paperHandlerDriver.syncScannerConfig()
  );

  const horizontalResolution = 300;
  // 300 == 0x12c stored across bytes 9 and 10
  expectation[9] = 0x01;
  expectation[10] = 0x2c;

  const verticalResolution = 150;
  // 150 == 0x96 stored across bytes 11 and 12
  expectation[11] = 0x00;
  expectation[12] = 0x96;
  await expectScanConfigTransferOut(
    transferOutSpy,
    expectation,
    async () =>
      await paperHandlerDriver.setScanResolution({
        horizontalResolution,
        verticalResolution,
      })
  );
});

test('print command', async () => {
  const transferOutSpy = jest.spyOn(mockWebUsbDevice, 'transferOut');
  await mockWebUsbDevice.mockAddTransferInData(
    GENERIC_ENDPOINT_IN,
    Buffer.from([ReturnCodes.POSITIVE_ACKNOWLEDGEMENT])
  );

  const motionUnits = 0xff;
  const expectation = [0x1b, 0x4a, motionUnits];
  await paperHandlerDriver.print(motionUnits);
  expect(transferOutSpy).toHaveBeenCalledWith(
    GENERIC_ENDPOINT_OUT,
    Uint8Array.from(expectation)
  );
});

test('print command defaults to 0 motion units', async () => {
  const transferOutSpy = jest.spyOn(mockWebUsbDevice, 'transferOut');
  await mockWebUsbDevice.mockAddTransferInData(
    GENERIC_ENDPOINT_IN,
    Buffer.from([ReturnCodes.POSITIVE_ACKNOWLEDGEMENT])
  );

  const expectation = [0x1b, 0x4a, 0];

  await paperHandlerDriver.print();
  expect(transferOutSpy).toHaveBeenCalledWith(
    GENERIC_ENDPOINT_OUT,
    Uint8Array.from(expectation)
  );
});

interface MotionUnitTestSpec {
  description: string;
  motionUnits: Uint16;
  transferOutExpectation: number[];
  functionToTest: (motionUnits: Uint16) => void;
}

const commandsWithMotionUnits: MotionUnitTestSpec[] = [
  {
    description: 'setAbsolutePrintPosition',
    // setAbsolutePrintPosition and similar functions accept a Uint16 as [nH, nL],
    // but the actual command accepts [nL, nH], so the Uint8s are swapped in the expectation
    motionUnits: 0xabcd,
    transferOutExpectation: [0x1b, 0x24, 0xcd, 0xab],
    functionToTest: PaperHandlerDriver.prototype.setAbsolutePrintPosition,
  },
  {
    description: 'setRelativePrintPosition',
    motionUnits: 0x7530,
    transferOutExpectation: [0x1b, 0x5c, 0x30, 0x75],
    functionToTest: PaperHandlerDriver.prototype.setRelativePrintPosition,
  },
  {
    description: 'setRelativeVerticalPrintPosition',
    motionUnits: 0x7530,
    transferOutExpectation: [0x1b, 0x28, 0x76, 0x30, 0x75],
    functionToTest:
      PaperHandlerDriver.prototype.setRelativeVerticalPrintPosition,
  },
  {
    description: 'setLeftMargin',
    motionUnits: 0x7530,
    transferOutExpectation: [0x1d, 0x4c, 0x30, 0x75],
    functionToTest: PaperHandlerDriver.prototype.setLeftMargin,
  },
  {
    description: 'setPrintingAreaWidth',
    motionUnits: 0x0640, // 1600
    transferOutExpectation: [0x1d, 0x57, 0x40, 0x06],
    functionToTest: PaperHandlerDriver.prototype.setPrintingAreaWidth,
  },
];

test.each(commandsWithMotionUnits)(
  `driver methods with motion unit input: $description`,
  async ({ motionUnits, transferOutExpectation, functionToTest }) => {
    const transferOutSpy = jest.spyOn(mockWebUsbDevice, 'transferOut');
    await mockWebUsbDevice.mockAddTransferInData(
      GENERIC_ENDPOINT_IN,
      Buffer.from([ReturnCodes.POSITIVE_ACKNOWLEDGEMENT])
    );

    functionToTest.call(paperHandlerDriver, motionUnits);
    expect(transferOutSpy).toHaveBeenCalledWith(
      GENERIC_ENDPOINT_OUT,
      Uint8Array.from(transferOutExpectation)
    );
  }
);

test('setPrintingDensity', async () => {
  const transferOutSpy = jest.spyOn(mockWebUsbDevice, 'transferOut');
  await mockWebUsbDevice.mockAddTransferInData(
    GENERIC_ENDPOINT_IN,
    Buffer.from([ReturnCodes.POSITIVE_ACKNOWLEDGEMENT])
  );

  const expectation = [0x1d, 0x7c, 0x06];

  await paperHandlerDriver.setPrintingDensity('+25%');
  expect(transferOutSpy).toHaveBeenCalledWith(
    GENERIC_ENDPOINT_OUT,
    Uint8Array.from(expectation)
  );
});

test('setPrintingSpeed', async () => {
  const transferOutSpy = jest.spyOn(mockWebUsbDevice, 'transferOut');
  await mockWebUsbDevice.mockAddTransferInData(
    GENERIC_ENDPOINT_IN,
    Buffer.from([ReturnCodes.POSITIVE_ACKNOWLEDGEMENT])
  );

  const expectation = [0x1d, 0xf0, 0x02];

  await paperHandlerDriver.setPrintingSpeed('fast');
  expect(transferOutSpy).toHaveBeenCalledWith(
    GENERIC_ENDPOINT_OUT,
    Uint8Array.from(expectation)
  );
});

test('setMotionUnits', async () => {
  const transferOutSpy = jest.spyOn(mockWebUsbDevice, 'transferOut');
  await mockWebUsbDevice.mockAddTransferInData(
    GENERIC_ENDPOINT_IN,
    Buffer.from([ReturnCodes.POSITIVE_ACKNOWLEDGEMENT])
  );

  const x = 0xab;
  const y = 0xcd;
  const expectation = [0x1d, 0x50, x, y];

  await paperHandlerDriver.setMotionUnits(x, y);
  expect(transferOutSpy).toHaveBeenCalledWith(
    GENERIC_ENDPOINT_OUT,
    Uint8Array.from(expectation)
  );
});

test('setLineSpacing', async () => {
  const transferOutSpy = jest.spyOn(mockWebUsbDevice, 'transferOut');
  await mockWebUsbDevice.mockAddTransferInData(
    GENERIC_ENDPOINT_IN,
    Buffer.from([ReturnCodes.POSITIVE_ACKNOWLEDGEMENT])
  );

  const n = 0xab;
  const expectation = [0x1b, 0x33, n];

  await paperHandlerDriver.setLineSpacing(n);
  expect(transferOutSpy).toHaveBeenCalledWith(
    GENERIC_ENDPOINT_OUT,
    Uint8Array.from(expectation)
  );
});
