import { ImageData, writeImageData } from '@votingworks/image-utils';
import { mockOf } from '@votingworks/test-utils';

import { PaperHandlerStatus } from './coders';
import {
  MockPaperHandlerDriver,
  MockPaperHandlerStatus,
  isMockPaperHandler,
} from './mock_driver';
import * as statusHelpers from './scanner_status';
import { MinimalWebUsbDevice } from './minimal_web_usb_device';
import { PaperHandlerDriver } from './driver';

jest.mock(
  '@votingworks/image-utils',
  (): typeof import('@votingworks/image-utils') => ({
    ...jest.requireActual('@votingworks/image-utils'),
    writeImageData: jest.fn(),
  })
);

function newMockDriver() {
  const mockDriver = new MockPaperHandlerDriver();

  const operationDelayMs = 1000;
  mockDriver.setMockOperationDelayMs(operationDelayMs);

  return { mockDriver, operationDelayMs };
}

async function expectMockStatus(params: {
  delayMs?: number;
  mockDriver: MockPaperHandlerDriver;
  mockStatus: MockPaperHandlerStatus;
}) {
  const { delayMs, mockDriver, mockStatus } = params;

  if (delayMs) {
    await jest.advanceTimersByTimeAsync(delayMs);
  }

  expect(mockDriver.getMockStatus()).toEqual(mockStatus);
}

beforeEach(() => {
  jest.useFakeTimers();
});

describe('setMockPaperHandlerStatus', () => {
  const statusAssertions: Record<
    MockPaperHandlerStatus,
    (paperHandlerStatus: PaperHandlerStatus) => void
  > = {
    noPaper(status) {
      expect(statusHelpers.isPaperAnywhere(status)).toEqual(false);
    },

    paperInScannerNotParked(status) {
      expect(statusHelpers.isPaperInScanner(status)).toEqual(true);
      expect(statusHelpers.isPaperParked(status)).toEqual(false);
    },

    paperInserted(status) {
      expect(statusHelpers.isPaperReadyToLoad(status)).toEqual(true);
      expect(statusHelpers.isPaperParked(status)).toEqual(false);
    },

    paperJammed(status) {
      expect(statusHelpers.isPaperJammed(status)).toEqual(true);
    },

    paperJammedNoPaper(status) {
      expect(statusHelpers.isPaperJammed(status)).toEqual(true);
      expect(statusHelpers.isPaperAnywhere(status)).toEqual(false);
    },

    paperParked(status) {
      expect(statusHelpers.isPaperParked(status)).toEqual(true);
    },

    paperPartiallyInserted(status) {
      expect(statusHelpers.isPaperAnywhere(status)).toEqual(true);
      expect(statusHelpers.isPaperInScanner(status)).toEqual(false);
      expect(statusHelpers.isPaperReadyToLoad(status)).toEqual(false);
    },
    presentingPaper(status) {
      expect(statusHelpers.isPaperParked(status)).toEqual(false);
      expect(statusHelpers.isPaperReadyToLoad(status)).toEqual(true);
    },
  };

  for (const mockStatus of Object.keys(
    statusAssertions
  ) as MockPaperHandlerStatus[]) {
    test(mockStatus, async () => {
      const { mockDriver } = newMockDriver();

      mockDriver.setMockStatus(mockStatus);
      await expectMockStatus({ mockDriver, mockStatus });

      const paperHandlerStatus = await mockDriver.getPaperHandlerStatus();
      statusAssertions[mockStatus](paperHandlerStatus);
    });
  }
});

test('parkPaper()', async () => {
  const { mockDriver } = newMockDriver();
  mockDriver.setMockStatus('paperInserted');

  await expectMockStatus({ mockDriver, mockStatus: 'paperInserted' });

  await mockDriver.parkPaper();

  await expectMockStatus({ mockDriver, mockStatus: 'paperParked' });
});

test('ejectPaperToFront()', async () => {
  const { mockDriver, operationDelayMs: delayMs } = newMockDriver();
  mockDriver.setMockStatus('paperParked');

  await expectMockStatus({ mockDriver, mockStatus: 'paperParked' });

  await mockDriver.ejectPaperToFront();

  await expectMockStatus({ mockDriver, mockStatus: 'noPaper', delayMs });
});

test('ejectBallotToRear()', async () => {
  const { mockDriver, operationDelayMs: delayMs } = newMockDriver();
  mockDriver.setMockStatus('paperParked');

  await expectMockStatus({ mockDriver, mockStatus: 'paperParked' });

  await mockDriver.ejectBallotToRear();

  await expectMockStatus({ mockDriver, mockStatus: 'noPaper', delayMs });
});

test('presentPaper()', async () => {
  const { mockDriver, operationDelayMs: delayMs } = newMockDriver();
  mockDriver.setMockStatus('paperParked');

  await expectMockStatus({ mockDriver, mockStatus: 'paperParked' });

  await mockDriver.presentPaper();
  await expectMockStatus({
    delayMs,
    mockDriver,
    mockStatus: 'presentingPaper',
  });
});

describe('print and scan', () => {
  const { mockDriver, operationDelayMs } = newMockDriver();

  const mockPageContents = new ImageData(
    new Uint8ClampedArray([1, 2, 3, 4]),
    2
  );

  test('scan only', async () => {
    mockDriver.setMockPaperContents(mockPageContents);

    const scannedImagePromise = mockDriver.scan();
    await jest.advanceTimersByTimeAsync(operationDelayMs);

    expect(await scannedImagePromise).toEqual(mockPageContents);
  });

  test('scan and save', async () => {
    mockDriver.setMockPaperContents(mockPageContents);

    const scannedImageFilename = '/tmp/mockPaperHandlerScan.png';
    const scannedImagePromise = mockDriver.scanAndSave(scannedImageFilename);
    await jest.advanceTimersByTimeAsync(operationDelayMs);

    await scannedImagePromise;
    expect(mockOf(writeImageData)).toHaveBeenCalledWith(
      scannedImageFilename,
      mockPageContents
    );
  });
});

test('isMockPaperHandler()', () => {
  expect(isMockPaperHandler(new MockPaperHandlerDriver())).toEqual(true);
});

test('false for PaperHandlerDriver', () => {
  const mockWebDevice: MinimalWebUsbDevice = {
    open: jest.fn(),
    close: jest.fn(),
    transferOut: jest.fn(),
    transferIn: jest.fn(),
    claimInterface: jest.fn(),
    selectConfiguration: jest.fn(),
  };

  expect(isMockPaperHandler(new PaperHandlerDriver(mockWebDevice))).toEqual(
    false
  );
});
