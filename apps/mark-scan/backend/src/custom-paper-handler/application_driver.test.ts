import {
  MinimalWebUsbDevice,
  PaperHandlerDriver,
  imageDataToBinaryBitmap,
  chunkBinaryBitmap,
  VERTICAL_DOTS_IN_CHUNK,
  getPaperHandlerDriver,
  PaperHandlerStatus,
  isPaperAnywhere,
  MockPaperHandlerDriver,
  isMockPaperHandler,
  MaxPrintWidthDots,
} from '@votingworks/custom-paper-handler';
import { Buffer } from 'node:buffer';
import { mockOf } from '@votingworks/test-utils';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import { renderBmdBallotFixture } from '@votingworks/bmd-ballot-fixtures';
import {
  loadAndParkPaper,
  printBallotChunks,
  resetAndReconnect,
  scanAndSave,
} from './application_driver';
import { getDefaultPaperHandlerStatus } from './test_utils';

jest.mock('@votingworks/custom-paper-handler');

let driver: PaperHandlerDriver;
let webDevice: MinimalWebUsbDevice;

beforeEach(() => {
  webDevice = {
    open: jest.fn(),
    close: jest.fn(),
    transferOut: jest.fn(),
    transferIn: jest.fn(),
    claimInterface: jest.fn(),
    selectConfiguration: jest.fn(),
  };
  driver = new PaperHandlerDriver(webDevice, MaxPrintWidthDots.BMD_155);
});

test('print ballot', async () => {
  // Valid test ballot in pdf format. We need to supply real data so
  // printBallot won't error when calling pdfToImages, but this data
  // doesn't impact assertions in this test.
  const pdfData = await renderBmdBallotFixture({
    electionDefinition: electionGeneralDefinition,
    frontPageOnly: true,
  });

  // Nonsensical test data but it's enough to make the assertions we need.
  // This data shouldn't be treated as a realistic representation
  mockOf(imageDataToBinaryBitmap).mockReturnValue({
    width: 2,
    height: 2,
    data: [true, false],
  });
  mockOf(chunkBinaryBitmap).mockReturnValue([
    {
      width: 0,
      data: Buffer.of(),
      empty: true,
    },
    {
      width: 1,
      data: Buffer.of(1),
    },
    {
      width: 1,
      data: Buffer.of(0),
    },
  ]);

  await printBallotChunks(driver, pdfData);

  // Setup and data conversion functions that are called no matter what
  expect(driver.enablePrint).toHaveBeenCalledTimes(1);
  expect(imageDataToBinaryBitmap).toHaveBeenCalled();
  expect(chunkBinaryBitmap).toHaveBeenCalled();

  // Assert because the test data includes an empty chunk
  expect(driver.setRelativeVerticalPrintPosition).toHaveBeenCalledTimes(1);
  expect(driver.setRelativeVerticalPrintPosition).toHaveBeenCalledWith(
    VERTICAL_DOTS_IN_CHUNK * 2
  );

  // Called once for each nonempty chunk
  expect(driver.printChunk).toHaveBeenCalledTimes(2);
});

test('printBallotChunks errors when too many pages of data', async () => {
  const pdfData = await renderBmdBallotFixture({
    electionDefinition: electionGeneralDefinition,
  });

  await expect(printBallotChunks(driver, pdfData)).rejects.toThrow(
    'Unexpected page count 2'
  );
});

test('scanAndSave success', async () => {
  const status: PaperHandlerStatus = {
    ...getDefaultPaperHandlerStatus(),
    parkSensor: true,
  };
  mockOf(driver.getPaperHandlerStatus).mockResolvedValue(status);
  mockOf(isPaperAnywhere).mockReturnValue(true);

  await scanAndSave(driver, 'backward');

  expect(driver.getPaperHandlerStatus).toHaveBeenCalledTimes(1);
  expect(driver.setScanDirection).toHaveBeenCalledWith('backward');
  expect(driver.scanAndSave).toHaveBeenCalledTimes(1);
  expect(driver.scanAndSave).toHaveBeenCalledWith(
    expect.stringContaining('.jpeg')
  );
});

test('scanAndSave errors when no paper', async () => {
  const status: PaperHandlerStatus = getDefaultPaperHandlerStatus();
  mockOf(driver.getPaperHandlerStatus).mockResolvedValue(status);

  await expect(scanAndSave(driver, 'backward')).rejects.toThrow(
    'Paper has been removed'
  );
});

test('resetAndReconnect', async () => {
  const delay = 1;
  const newMockDriver = new PaperHandlerDriver(
    webDevice,
    MaxPrintWidthDots.BMD_155
  );
  mockOf(getPaperHandlerDriver).mockResolvedValue(newMockDriver);

  await resetAndReconnect(driver, delay);

  expect(driver.resetScan).toHaveBeenCalledTimes(1);
  expect(driver.disconnect).toHaveBeenCalledTimes(1);
  expect(getPaperHandlerDriver).toHaveBeenCalledTimes(1);
  expect(newMockDriver.initializePrinter).toHaveBeenCalledTimes(1);
  expect(newMockDriver.setLineSpacing).toHaveBeenCalledTimes(1);
  expect(newMockDriver.setLineSpacing).toHaveBeenCalledWith(0);
  expect(newMockDriver.setPrintingSpeed).toHaveBeenCalledTimes(1);
  expect(newMockDriver.setPrintingSpeed).toHaveBeenCalledWith('slow');
});

test('resetAndReconnect - is no-op for mock driver', async () => {
  const mockDriver = new MockPaperHandlerDriver();
  mockOf(isMockPaperHandler).mockReturnValue(true);

  expect(await resetAndReconnect(mockDriver)).toEqual(mockDriver);
  expect(mockOf(getPaperHandlerDriver)).not.toHaveBeenCalled();
});

test('loadAndParkPaper', async () => {
  await loadAndParkPaper(driver);
  expect(driver.loadPaper).toHaveBeenCalled();
  expect(driver.parkPaper).toHaveBeenCalled();
});
