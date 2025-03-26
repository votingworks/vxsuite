import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import { mockFunction } from '@votingworks/test-utils';
import { LogEventId, mockBaseLogger } from '@votingworks/logging';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { PrinterRichStatus } from '@votingworks/types';
import { detectPrinter } from './printer';
import { BROTHER_THERMAL_PRINTER_CONFIG, HP_LASER_PRINTER_CONFIG } from '.';
import { MockFilePrinter } from './mocks/file_printer';

const featureFlagMock = getFeatureFlagMock();
vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
    featureFlagMock.isEnabled(flag),
}));

const mockConfigurePrinter = mockFunction('configurePrinter');
vi.mock(
  import('./configure.js'),
  async (importActual): Promise<typeof import('./configure')> => ({
    ...(await importActual()),
    configurePrinter: (args) => mockConfigurePrinter(args),
  })
);

const mockGetConnectedDeviceUris = mockFunction('getConnectedDeviceUris');
vi.mock(
  import('./device_uri.js'),
  async (importActual): Promise<typeof import('./device_uri')> => ({
    ...(await importActual()),
    getConnectedDeviceUris: () => mockGetConnectedDeviceUris(),
  })
);

const mockGetPrinterRichStatus = mockFunction('mockGetPrinterRichStatus');
vi.mock(
  import('./status.js'),
  async (importActual): Promise<typeof import('./status')> => ({
    ...(await importActual()),
    getPrinterRichStatus: () => mockGetPrinterRichStatus(),
  })
);

const mockPrintData = mockFunction('mockPrintData');
vi.mock(
  import('./print.js'),
  async (importActual): Promise<typeof import('./print')> => ({
    ...(await importActual()),
    print: () => mockPrintData(),
  })
);

beforeEach(() => {
  mockConfigurePrinter.reset();
  mockGetConnectedDeviceUris.reset();
  mockGetPrinterRichStatus.reset();
  mockPrintData.reset();
});

afterEach(() => {
  mockConfigurePrinter.assertComplete();
  mockGetConnectedDeviceUris.assertComplete();
  mockGetPrinterRichStatus.assertComplete();
  mockPrintData.assertComplete();
});

test('status and configuration', async () => {
  vi.useFakeTimers();
  const logger = mockBaseLogger({ fn: vi.fn });
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

  mockPrintData.expectCallWith().returns(undefined);
  await printer.print({ data: Buffer.of() });

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

  // printer detached is not registered until timeout passes
  mockGetConnectedDeviceUris.expectCallWith().returns([]);
  expect(await printer.status()).toEqual({
    connected: true,
    config,
  });

  vi.advanceTimersByTime(3000);
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

test('uses mock file printer when feature flag is set', () => {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.USE_MOCK_PRINTER
  );

  const printer = detectPrinter(mockBaseLogger({ fn: vi.fn }));
  expect(printer).toBeInstanceOf(MockFilePrinter);
  featureFlagMock.resetFeatureFlags();
});

describe('rich status', () => {
  test('does not get rich status if printer is not an IPP printer', async () => {
    const printer = detectPrinter(mockBaseLogger({ fn: vi.fn }));

    // connect printer
    const uri = `${BROTHER_THERMAL_PRINTER_CONFIG.baseDeviceUri}/serial=1234`;
    const config = BROTHER_THERMAL_PRINTER_CONFIG;
    mockGetConnectedDeviceUris.expectCallWith().returns([uri]);
    mockConfigurePrinter
      .expectCallWith({
        uri,
        config,
      })
      .returns(undefined);
    expect(await printer.status()).toEqual({
      connected: true,
      config,
    });
  });

  test('attempts to get rich status if printer is an IPP printer', async () => {
    const printer = detectPrinter(mockBaseLogger({ fn: vi.fn }));

    // connect printer
    const uri = `${HP_LASER_PRINTER_CONFIG.baseDeviceUri}/serial=1234`;
    const config = HP_LASER_PRINTER_CONFIG;
    const richStatus: PrinterRichStatus = {
      state: 'idle',
      stateReasons: ['none'],
      markerInfos: [],
    };
    mockGetConnectedDeviceUris.expectCallWith().returns([uri]);
    mockConfigurePrinter
      .expectCallWith({
        uri,
        config,
      })
      .returns(undefined);
    mockGetPrinterRichStatus.expectCallWith().returns(richStatus);
    expect(await printer.status()).toEqual({
      connected: true,
      config,
      richStatus,
    });
  });
});
