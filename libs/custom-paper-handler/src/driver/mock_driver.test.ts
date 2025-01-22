import { beforeEach, describe, expect, test, vi } from 'vitest';
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

vi.mock(import('@votingworks/image-utils'), async (importActual) => ({
  ...(await importActual()),
  writeImageData: vi.fn(),
}));

function expectMockStatus(params: {
  mockDriver: MockPaperHandlerDriver;
  mockStatus: MockPaperHandlerStatus;
}) {
  const { mockDriver, mockStatus } = params;

  expect(mockDriver.getMockStatus()).toEqual(mockStatus);
}

beforeEach(() => {
  vi.useFakeTimers();
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
      const mockDriver = new MockPaperHandlerDriver();

      mockDriver.setMockStatus(mockStatus);
      expectMockStatus({ mockDriver, mockStatus });

      const paperHandlerStatus = await mockDriver.getPaperHandlerStatus();
      statusAssertions[mockStatus](paperHandlerStatus);
    });
  }
});

test('loadPaper()', async () => {
  const mockDriver = new MockPaperHandlerDriver();
  mockDriver.setMockStatus('paperInserted');

  expectMockStatus({ mockDriver, mockStatus: 'paperInserted' });

  await mockDriver.loadPaper();

  expectMockStatus({ mockDriver, mockStatus: 'paperInScannerNotParked' });
});

test('parkPaper()', async () => {
  const mockDriver = new MockPaperHandlerDriver();
  mockDriver.setMockStatus('paperInserted');

  expectMockStatus({ mockDriver, mockStatus: 'paperInserted' });

  await mockDriver.parkPaper();

  expectMockStatus({ mockDriver, mockStatus: 'paperParked' });
});

test('ejectPaperToFront()', async () => {
  const mockDriver = new MockPaperHandlerDriver();
  mockDriver.setMockStatus('paperParked');

  expectMockStatus({ mockDriver, mockStatus: 'paperParked' });

  await mockDriver.ejectPaperToFront();

  expectMockStatus({ mockDriver, mockStatus: 'noPaper' });
});

test('ejectBallotToRear()', async () => {
  const mockDriver = new MockPaperHandlerDriver();
  mockDriver.setMockStatus('paperParked');

  expectMockStatus({ mockDriver, mockStatus: 'paperParked' });

  await mockDriver.ejectBallotToRear();

  expectMockStatus({ mockDriver, mockStatus: 'noPaper' });
});

test('presentPaper()', async () => {
  const mockDriver = new MockPaperHandlerDriver();
  mockDriver.setMockStatus('paperParked');

  expectMockStatus({ mockDriver, mockStatus: 'paperParked' });

  await mockDriver.presentPaper();
  expectMockStatus({ mockDriver, mockStatus: 'presentingPaper' });
});

describe('print and scan', () => {
  const mockDriver = new MockPaperHandlerDriver();

  const mockPageContents = new ImageData(
    new Uint8ClampedArray([1, 2, 3, 4]),
    2
  );

  test('scan only', async () => {
    mockDriver.setMockPaperContents(mockPageContents);

    expect(await mockDriver.scan()).toEqual(mockPageContents);
  });

  test('scan and save', async () => {
    mockDriver.setMockPaperContents(mockPageContents);

    const scannedImageFilename = '/tmp/mockPaperHandlerScan.png';
    await mockDriver.scanAndSave(scannedImageFilename);

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
    open: vi.fn(),
    close: vi.fn(),
    transferOut: vi.fn(),
    transferIn: vi.fn(),
    claimInterface: vi.fn(),
    selectConfiguration: vi.fn(),
  };

  expect(
    isMockPaperHandler(new PaperHandlerDriver(mockWebDevice, 1700))
  ).toEqual(false);
});
