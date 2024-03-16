import { fakeDevice } from '@votingworks/test-utils';
import { MemoryHardware } from './memory_hardware';

it('has a standard config with all the typical hardware', async () => {
  const hardware = MemoryHardware.buildStandard();

  await new Promise<void>((resolve) => {
    hardware.devices.subscribe((devices) => {
      expect(
        new Set(Array.from(devices).map((device) => device.deviceName))
      ).toEqual(
        new Set([
          'USB Advanced Audio Device',
          'HL-L5100DN_series',
          'Scanner',
          'Sheetfed Scanner',
        ])
      );

      resolve();
    });
  });
});

it('has no connected devices by default', async () => {
  const hardware = MemoryHardware.build();

  await new Promise<void>((resolve) => {
    hardware.devices.subscribe((devices) => {
      expect(Array.from(devices)).toEqual([]);
      resolve();
    });
  });
});

it('does not have devices that have not been added', () => {
  const hardware = MemoryHardware.build();
  expect(hardware.hasDevice(fakeDevice())).toEqual(false);
});

it('has devices that have been added', () => {
  const hardware = MemoryHardware.build();
  const device = fakeDevice();

  hardware.addDevice(device);
  expect(hardware.hasDevice(device)).toEqual(true);
});

it('sets connected to true by adding a missing device', () => {
  const hardware = MemoryHardware.build();
  const device = fakeDevice();

  jest.spyOn(hardware, 'addDevice');
  hardware.setDeviceConnected(device, true);
  expect(hardware.hasDevice(device)).toEqual(true);
  expect(hardware.addDevice).toHaveBeenCalledWith(device);
});

it('does nothing when setting connected to true for an already added device', () => {
  const hardware = MemoryHardware.build();
  const device = fakeDevice();

  hardware.addDevice(device);
  jest.spyOn(hardware, 'addDevice');
  hardware.setDeviceConnected(device, true);
  expect(hardware.hasDevice(device)).toEqual(true);
  expect(hardware.addDevice).not.toHaveBeenCalled();
});

it('sets connected to false by removing a connected device', () => {
  const hardware = MemoryHardware.build();
  const device = fakeDevice();

  hardware.addDevice(device);
  jest.spyOn(hardware, 'removeDevice');
  hardware.setDeviceConnected(device, false);
  expect(hardware.hasDevice(device)).toEqual(false);
  expect(hardware.removeDevice).toHaveBeenCalledWith(device);
});

it('does nothing when setting connected to false for an already missing device', () => {
  const hardware = MemoryHardware.build();
  const device = fakeDevice();

  jest.spyOn(hardware, 'removeDevice');
  hardware.setDeviceConnected(device, false);
  expect(hardware.hasDevice(device)).toEqual(false);
  expect(hardware.removeDevice).not.toHaveBeenCalled();
});

it('triggers callbacks when adding devices', () => {
  const hardware = MemoryHardware.build();
  const callback = jest.fn();
  const device = fakeDevice();

  hardware.devices.subscribe(callback);
  hardware.addDevice(device);
  expect(callback).toHaveBeenCalledWith(new Set([device]));
});

it('triggers callbacks when removing devices', () => {
  const hardware = MemoryHardware.build();
  const callback = jest.fn();
  const device = fakeDevice();

  hardware.addDevice(device);

  hardware.devices.subscribe(callback);
  expect(callback).toHaveBeenNthCalledWith(1, new Set([device]));

  hardware.removeDevice(device);
  expect(callback).toHaveBeenNthCalledWith(2, new Set([]));
});

it('throws when adding the same device twice', () => {
  const hardware = MemoryHardware.build();
  const device = fakeDevice();

  hardware.addDevice(device);
  expect(() => hardware.addDevice(device)).toThrowError(/already added/);
});

it('throws when removing a device that was never added', () => {
  const hardware = MemoryHardware.build();
  const device = fakeDevice();

  expect(() => hardware.removeDevice(device)).toThrowError(/never added/);
});

it('allows unsubscribing from a device subscription', () => {
  const hardware = MemoryHardware.build();
  const callback = jest.fn();
  const device = fakeDevice();

  const unsubscribe = hardware.devices.subscribe(callback);
  unsubscribe();
  callback.mockClear();

  hardware.addDevice(device);
  expect(callback).not.toHaveBeenCalled();
});

it('readPrinterStatus returns printer info for connected printer', async () => {
  const hardware = MemoryHardware.build();
  hardware.setPrinterConnected(true);
  expect(await hardware.readPrinterStatus()).toMatchSnapshot();
});

it('readPrinterStatus returns undefined if there are no connected printers', async () => {
  const hardware = MemoryHardware.build();
  hardware.setPrinterConnected(false);
  expect(await hardware.readPrinterStatus()).toBeUndefined();
});

it('can set printer IPP attributes', async () => {
  const hardware = MemoryHardware.build({ connectPrinter: true });
  const attributes: KioskBrowser.PrinterIppAttributes = {
    state: 'unknown',
  };
  hardware.setPrinterIppAttributes(attributes);
  const printer = await hardware.readPrinterStatus();
  expect(printer).toMatchObject(attributes);
});

it('can remove printers', async () => {
  const hardware = MemoryHardware.build();
  hardware.setPrinterConnected(true);
  hardware.detachAllPrinters();
  await new Promise<void>((resolve) => {
    hardware.printers.subscribe((printers) => {
      expect(Array.from(printers)).toEqual([]);
      resolve();
    });
  });
});

it('can set and read battery level', async () => {
  const hardware = MemoryHardware.build();
  expect(await hardware.readBatteryStatus()).toEqual({
    discharging: false,
    level: 0.8,
  });
  hardware.setBatteryLevel(0.25);
  expect(await hardware.readBatteryStatus()).toEqual({
    discharging: false,
    level: 0.25,
  });
  hardware.setBatteryDischarging(true);
  expect(await hardware.readBatteryStatus()).toEqual({
    discharging: true,
    level: 0.25,
  });

  hardware.removeBattery();
  expect(await hardware.readBatteryStatus()).toBeUndefined();
  hardware.setBatteryLevel(0.25);
  expect(await hardware.readBatteryStatus()).toEqual({
    discharging: false,
    level: 0.25,
  });

  hardware.removeBattery();
  expect(await hardware.readBatteryStatus()).toBeUndefined();
  hardware.setBatteryDischarging(true);
  expect(await hardware.readBatteryStatus()).toEqual({
    discharging: true,
    level: 0.8,
  });
});
