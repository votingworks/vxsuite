import { expect, test, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import { mockWebUsbDevice } from './web_usb_device';

const TEST_ALTERNATE_INTERFACE: USBAlternateInterface = {
  alternateSetting: 3,
  interfaceClass: 4,
  interfaceSubclass: 5,
  interfaceProtocol: 6,
  interfaceName: '7',
  endpoints: [
    {
      endpointNumber: 8,
      direction: 'in',
      type: 'bulk',
      packetSize: 9,
    },
    {
      endpointNumber: 10,
      direction: 'out',
      type: 'bulk',
      packetSize: 11,
    },
  ],
};

const TEST_INTERFACE: USBInterface = {
  interfaceNumber: 2,
  alternate: TEST_ALTERNATE_INTERFACE,
  alternates: [TEST_ALTERNATE_INTERFACE],
  claimed: false,
};

const TEST_CONFIGURATION: USBConfiguration = {
  configurationValue: 1,
  interfaces: [TEST_INTERFACE],
  configurationName: 'test',
};

test('default setup', () => {
  const device = mockWebUsbDevice();
  expect(device.configuration).toBeUndefined();
  expect(device.configurations).toHaveLength(0);
  expect(device.opened).toEqual(false);
});

test('open/close', async () => {
  const device = mockWebUsbDevice();

  expect(device.opened).toEqual(false);
  await device.open();
  expect(device.opened).toEqual(true);
  await device.close();
  expect(device.opened).toEqual(false);

  await device.open();
  expect(device.opened).toEqual(true);
  await device.forget();
  expect(device.opened).toEqual(false);

  const onOpen = vi.fn();
  device.mockOnOpen(onOpen);
  expect(onOpen).toHaveBeenCalledTimes(0);
  await device.open();
  expect(onOpen).toHaveBeenCalledTimes(1);
});

test('selectConfiguration', async () => {
  const device = mockWebUsbDevice();
  device.mockSetConfiguration({
    configurationValue: 1,
    interfaces: [],
  });

  await expect(device.selectConfiguration(1)).rejects.toThrow(
    'device not opened'
  );
  await device.open();
  expect(device.configuration).toBeUndefined();
  await device.selectConfiguration(1);
  expect(device.configuration).toBeDefined();

  // allows overriding the configuration
  device.mockSetConfiguration(TEST_CONFIGURATION);
  expect(device.configuration).toEqual(TEST_CONFIGURATION);
});

test('claimInterface/releaseInterface', async () => {
  const device = mockWebUsbDevice();
  device.mockSetConfiguration(TEST_CONFIGURATION);

  await expect(device.claimInterface(1)).rejects.toThrow('device not opened');
  await device.open();
  await expect(device.claimInterface(1)).rejects.toThrow(
    'configuration not selected'
  );
  await device.selectConfiguration(1);
  await device.claimInterface(2);
  await expect(device.claimInterface(2)).rejects.toThrow(
    'interface already claimed'
  );
  await expect(device.claimInterface(3)).rejects.toThrow('interface not found');

  await device.releaseInterface(2);
  await expect(device.releaseInterface(2)).rejects.toThrow(
    'interface not claimed'
  );
  await expect(device.releaseInterface(3)).rejects.toThrow(
    'interface not found'
  );
});

test('selectAlternateInterface', async () => {
  const device = mockWebUsbDevice();
  device.mockSetConfiguration(TEST_CONFIGURATION);

  await expect(device.selectAlternateInterface(1, 2)).rejects.toThrow(
    'device not opened'
  );
  await device.open();
  await expect(device.selectAlternateInterface(1, 2)).rejects.toThrow(
    'configuration not selected'
  );
  await device.selectConfiguration(1);
  await expect(device.selectAlternateInterface(2, 2)).rejects.toThrow(
    'interface not claimed'
  );
  await device.claimInterface(2);
  await expect(device.selectAlternateInterface(2, 2)).rejects.toThrow(
    'alternate setting not found'
  );
  await device.selectAlternateInterface(2, 3);
});

test('read/write with halts', async () => {
  const device = mockWebUsbDevice();
  device.mockSetConfiguration(TEST_CONFIGURATION);

  await expect(device.clearHalt('in', 8)).rejects.toThrow('device not opened');
  await device.open();
  await expect(device.clearHalt('in', 8)).rejects.toThrow(
    'configuration not selected'
  );
  await device.selectConfiguration(1);
  await expect(device.clearHalt('in', 8)).rejects.toThrow('endpoint not found');
  await device.claimInterface(2);
  await expect(device.clearHalt('out', 8)).rejects.toThrow(
    'endpoint direction does not match'
  );
  await device.clearHalt('in', 8);

  await device.mockStallEndpoint(8);
  expect(await device.transferIn(8, 1)).toEqual<USBInTransferResult>({
    status: 'stall',
  });
  await device.clearHalt('in', 8);
  await expect(
    device.mockAddTransferInData(10, Buffer.of(1, 2, 3))
  ).rejects.toThrow('endpoint direction is out');
  await device.mockAddTransferInData(8, Buffer.of(1, 2, 3));
  const arrayBuffer = new ArrayBuffer(3);
  const uint8Array = new Uint8Array(arrayBuffer);
  uint8Array.set([1, 2, 3]);
  expect(await device.transferIn(8, 1)).toEqual<USBInTransferResult>({
    status: 'ok',
    data: new DataView(arrayBuffer, 0, 3),
  });
  await expect(device.transferIn(10, 1)).rejects.toThrow(
    'endpoint direction is out'
  );

  await device.mockStallEndpoint(10);
  expect(
    await device.transferOut(10, Buffer.of(1, 2, 3))
  ).toEqual<USBOutTransferResult>({
    status: 'stall',
    bytesWritten: 0,
  });
  await expect(device.clearHalt('in', 10)).rejects.toThrow(
    'endpoint direction does not match'
  );
  await device.clearHalt('out', 10);
  expect(await device.mockGetTransferOutData(10)).toHaveLength(0);
  expect(
    await device.transferOut(10, Buffer.of(1, 2, 3))
  ).toEqual<USBOutTransferResult>({
    status: 'ok',
    bytesWritten: 3,
  });
  expect(
    await device.transferOut(10, arrayBuffer)
  ).toEqual<USBOutTransferResult>({
    status: 'ok',
    bytesWritten: 3,
  });
  expect(await device.mockGetTransferOutData(10)).toHaveLength(2);
  await expect(device.transferOut(8, Buffer.of(1, 2, 3))).rejects.toThrow(
    'endpoint direction is in'
  );

  // read data in chunks
  await device.mockLimitNextTransferInSize(8, 2);
  await device.mockLimitNextTransferInSize(8, 1);
  await device.mockAddTransferInData(8, Buffer.of(1, 2, 3));
  expect(await device.transferIn(8, 3)).toEqual<USBInTransferResult>({
    status: 'ok',
    data: new DataView(arrayBuffer, 0, 2),
  });
  expect(await device.transferIn(8, 3)).toEqual<USBInTransferResult>({
    status: 'ok',
    data: new DataView(arrayBuffer, 2, 1),
  });
});
