import { mockFunction } from '@votingworks/test-utils';
import { LogEventId, fakeLogger } from '@votingworks/logging';
import { detectPrinter } from './printer';
import { BROTHER_THERMAL_PRINTER_CONFIG, HP_LASER_PRINTER_CONFIG } from '.';

const mockConfigurePrinter = mockFunction('configurePrinter');
jest.mock('./configure', (): typeof import('./configure') => ({
  ...jest.requireActual('./configure'),
  configurePrinter: (args) => mockConfigurePrinter(args),
}));

const mockGetConnectedDeviceUris = mockFunction('getConnectedDeviceUris');
jest.mock('./device_uri', (): typeof import('./device_uri') => ({
  ...jest.requireActual('./device_uri'),
  getConnectedDeviceUris: () => mockGetConnectedDeviceUris(),
}));

beforeEach(() => {
  mockConfigurePrinter.reset();
  mockGetConnectedDeviceUris.reset();
});

afterEach(() => {
  mockConfigurePrinter.assertComplete();
  mockGetConnectedDeviceUris.assertComplete();
});

test('status and configuration', async () => {
  const logger = fakeLogger();
  const printer = detectPrinter(logger);

  // no printer connected
  mockGetConnectedDeviceUris.expectCallWith().returns([]);
  expect(await printer.status()).toEqual({ connected: false });

  const config = BROTHER_THERMAL_PRINTER_CONFIG;
  const supportedPrinterUri1 = `${BROTHER_THERMAL_PRINTER_CONFIG.baseDeviceUri}/serial=1234`;
  const supportedPrinterUri2 = `${HP_LASER_PRINTER_CONFIG.baseDeviceUri}/serial=1234`;
  const unsupportedPrinterUri = 'usb://not-supported';

  // unsupported printer connected
  mockGetConnectedDeviceUris.expectCallWith().returns([unsupportedPrinterUri]);
  expect(await printer.status()).toEqual({ connected: false });
  expect(logger.log).toHaveBeenCalledTimes(0);

  // supported printer connected leads to configure
  mockGetConnectedDeviceUris.expectCallWith().returns([supportedPrinterUri1]);
  mockConfigurePrinter
    .expectCallWith({
      uri: supportedPrinterUri1,
      config: BROTHER_THERMAL_PRINTER_CONFIG,
    })
    .returns(undefined);
  expect(await printer.status()).toEqual({
    connected: true,
    config,
  });
  expect(logger.log).toHaveBeenCalledTimes(1);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.PrinterConfigurationAdded,
    'system',
    {
      message: 'A supported printer was discovered and configured for use.',
      uri: supportedPrinterUri1,
    }
  );

  // supported printer does not configure again
  mockGetConnectedDeviceUris.expectCallWith().returns([supportedPrinterUri1]);
  expect(await printer.status()).toEqual({
    connected: true,
    config,
  });

  // second printer connected does not change anything
  mockGetConnectedDeviceUris
    .expectCallWith()
    .returns([supportedPrinterUri2, supportedPrinterUri1]);
  expect(await printer.status()).toEqual({
    connected: true,
    config,
  });

  // printer detached is detected
  mockGetConnectedDeviceUris.expectCallWith().returns([]);
  expect(await printer.status()).toEqual({
    connected: false,
  });
  expect(logger.log).toHaveBeenCalledTimes(2);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.PrinterConfigurationRemoved,
    'system',
    {
      message: 'The previously configured printer is no longer detected.',
      uri: supportedPrinterUri1,
    }
  );
});
