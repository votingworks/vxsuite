import { err, ok } from '@votingworks/basics';
import { createImageData } from '@votingworks/image-utils';
import { asSheet } from '@votingworks/types';
import { backendWaitFor, mockFunction } from '@votingworks/test-utils';
import {
  createMockPdiScanner,
  MockScanner,
  mockScannerStatus,
} from './mock_scanner';

const mockSheetImageDatas = asSheet([
  createImageData(Uint8ClampedArray.from([0, 1, 0, 1]), 2, 2),
  createImageData(Uint8ClampedArray.from([1, 0, 1, 0]), 2, 2),
]);

async function insertAndScanSheet(mockScanner: MockScanner) {
  const listener = mockFunction('listener');
  mockScanner.client.addListener(listener);

  expect(mockScanner.getSheetStatus()).toEqual('noSheet');
  listener.expectCallWith({ event: 'scanStart' }).returns(undefined);
  listener
    .expectCallWith({ event: 'scanComplete', images: mockSheetImageDatas })
    .returns(undefined);
  mockScanner.insertSheet(mockSheetImageDatas);
  await backendWaitFor(() => listener.assertComplete(), { interval: 500 });
  mockScanner.client.removeListener(listener);
}

let mockScanner: MockScanner;

beforeEach(() => {
  mockScanner = createMockPdiScanner();
});

afterAll(async () => {
  await mockScanner.cleanup();
});

describe('mock scanner', () => {
  test('scan and accept ballot', async () => {
    const { client } = mockScanner;

    expect(await client.getScannerStatus()).toEqual(
      err({ code: 'disconnected' })
    );
    expect(mockScanner.getSheetStatus()).toEqual('noSheet');

    // Connect
    expect(await client.connect()).toEqual(ok());
    expect(await client.getScannerStatus()).toEqual(
      ok(mockScannerStatus.idleScanningDisabled)
    );

    // Enable scanning
    expect(
      await client.enableScanning({
        doubleFeedDetectionEnabled: false,
        paperLengthInches: 11,
      })
    ).toEqual(ok());
    expect(await client.getScannerStatus()).toEqual(
      ok(mockScannerStatus.idleScanningEnabled)
    );

    const listener = mockFunction('listener');
    client.addListener(listener);

    // Insert sheet to be scanned
    expect(mockScanner.getSheetStatus()).toEqual('noSheet');
    listener.expectCallWith({ event: 'scanStart' }).returns(undefined);
    listener
      .expectCallWith({ event: 'scanComplete', images: mockSheetImageDatas })
      .returns(undefined);
    mockScanner.insertSheet(mockSheetImageDatas);
    expect(await client.getScannerStatus()).toEqual(
      ok(mockScannerStatus.documentInFrontAndRear)
    );
    expect(mockScanner.getSheetStatus()).toEqual('sheetInserted');
    await backendWaitFor(() => listener.assertComplete(), { interval: 500 });
    expect(await client.getScannerStatus()).toEqual(
      ok(mockScannerStatus.documentInRear)
    );
    expect(mockScanner.getSheetStatus()).toEqual('sheetInserted');

    // Eject sheet to rear
    expect(await client.ejectDocument('toRear')).toEqual(ok());
    expect(await client.getScannerStatus()).toEqual(
      ok(mockScannerStatus.documentInFrontAndRear)
    );
    await backendWaitFor(
      async () =>
        expect(await client.getScannerStatus()).toEqual(
          ok(mockScannerStatus.idleScanningDisabled)
        ),
      { interval: 500 }
    );

    // Disconnect
    expect(await client.disconnect()).toEqual(ok());
    expect(await client.getScannerStatus()).toEqual(
      err({ code: 'disconnected' })
    );
  });

  test('scan and reject ballot, then remove', async () => {
    const { client } = mockScanner;

    // Connect and enable scanning
    expect(await client.connect()).toEqual(ok());
    expect(
      await client.enableScanning({
        doubleFeedDetectionEnabled: false,
        paperLengthInches: 11,
      })
    ).toEqual(ok());

    // Insert sheet to be scanned
    await insertAndScanSheet(mockScanner);

    // Eject sheet to front and hold
    expect(await client.ejectDocument('toFrontAndHold')).toEqual(ok());
    expect(await client.getScannerStatus()).toEqual(
      ok(mockScannerStatus.documentInFrontAndRear)
    );
    await backendWaitFor(
      async () =>
        expect(await client.getScannerStatus()).toEqual(
          ok(mockScannerStatus.documentInFront)
        ),
      { interval: 500 }
    );
    expect(mockScanner.getSheetStatus()).toEqual('sheetHeldInFront');

    // Remove sheet
    mockScanner.removeSheet();
    await backendWaitFor(
      async () =>
        expect(await client.getScannerStatus()).toEqual(
          ok(mockScannerStatus.idleScanningDisabled)
        ),
      { interval: 500 }
    );
    expect(mockScanner.getSheetStatus()).toEqual('noSheet');
  });

  test('scan and return ballot, then cast', async () => {
    const { client } = mockScanner;

    // Connect and enable scanning
    expect(await client.connect()).toEqual(ok());
    expect(
      await client.enableScanning({
        doubleFeedDetectionEnabled: false,
        paperLengthInches: 11,
      })
    ).toEqual(ok());

    // Insert sheet to be scanned
    await insertAndScanSheet(mockScanner);

    // Eject sheet to front and hold
    expect(await client.ejectDocument('toFrontAndHold')).toEqual(ok());
    await backendWaitFor(
      async () =>
        expect(await client.getScannerStatus()).toEqual(
          ok(mockScannerStatus.documentInFront)
        ),
      { interval: 500 }
    );
    expect(mockScanner.getSheetStatus()).toEqual('sheetHeldInFront');

    // Eject sheet to rear
    expect(await client.ejectDocument('toRear')).toEqual(ok());
    await backendWaitFor(
      async () =>
        expect(await client.getScannerStatus()).toEqual(
          ok(mockScannerStatus.idleScanningDisabled)
        ),
      { interval: 500 }
    );
    expect(mockScanner.getSheetStatus()).toEqual('noSheet');
  });

  test('disable scanning', async () => {
    const { client } = mockScanner;

    // Connect and enable scanning
    expect(await client.connect()).toEqual(ok());
    expect(
      await client.enableScanning({
        doubleFeedDetectionEnabled: false,
        paperLengthInches: 11,
      })
    ).toEqual(ok());
    expect(await client.getScannerStatus()).toEqual(
      ok(mockScannerStatus.idleScanningEnabled)
    );

    // Disable scanning
    expect(await client.disableScanning()).toEqual(ok());
    expect(await client.getScannerStatus()).toEqual(
      ok(mockScannerStatus.idleScanningDisabled)
    );

    // Try to insert sheet - nothing should happen
    mockScanner.insertSheet(mockSheetImageDatas);
    expect(mockScanner.getSheetStatus()).toEqual('noSheet');
  });
});
