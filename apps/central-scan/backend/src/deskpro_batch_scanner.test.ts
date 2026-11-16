import { expect, test, vi } from 'vitest';
import { type Device, isDeviceAttached } from '@votingworks/backend';
import { err } from '@votingworks/basics';
import {
  DeskProBatchScanner,
  INOTEC_DESKPRO_PRODUCT_ID,
  INOTEC_VENDOR_ID,
} from './deskpro_batch_scanner.js';

vi.mock(import('@votingworks/backend'), async (importActual) => ({
  ...(await importActual()),
  isDeviceAttached: vi.fn(),
}));

const isDeviceAttachedMock = vi.mocked(isDeviceAttached);

function usbDevice(idVendor: number, idProduct: number): Device {
  return { deviceDescriptor: { idVendor, idProduct } } as unknown as Device;
}

test('attached based on detected USB devices', () => {
  const scanner = new DeskProBatchScanner();

  isDeviceAttachedMock.mockReturnValue(true);
  expect(scanner.isAttached()).toEqual(true);

  isDeviceAttachedMock.mockReturnValue(false);
  expect(scanner.isAttached()).toEqual(false);

  const isDeskPro = isDeviceAttachedMock.mock.calls[0]![0];
  expect(
    isDeskPro(usbDevice(INOTEC_VENDOR_ID, INOTEC_DESKPRO_PRODUCT_ID))
  ).toEqual(true);
  expect(isDeskPro(usbDevice(INOTEC_VENDOR_ID, 0x0002))).toEqual(false);
  expect(isDeskPro(usbDevice(0x04c5, INOTEC_DESKPRO_PRODUCT_ID))).toEqual(
    false
  );
});

test('imprinter is not detected', async () => {
  await expect(
    new DeskProBatchScanner().isImprinterDetected()
  ).resolves.toEqual(false);
});

test('scanning reports that it is not yet supported', async () => {
  const batch = new DeskProBatchScanner().startBatch();
  expect(await batch.scanSheet()).toEqual(
    err({
      code: 'scan_failed',
      message: 'Scanning with the DeskPro is not yet supported',
    })
  );
  await batch.endBatch();
});
