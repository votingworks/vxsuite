import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import { mockFunction } from '@votingworks/test-utils';
import { err, ok } from '@votingworks/basics';
import { LogEventId, mockBaseLogger } from '@votingworks/logging';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { PrinterRichStatus } from '@votingworks/types';
import { isDeviceAttached } from '@votingworks/backend';
import { detectPrinter } from './printer';
import { ExecError } from '../utils/exec';
import {
  CITIZEN_E351_PRINTER_CONFIG,
  HP_4201_PRINTER_CONFIG,
  HP_4001_PRINTER_CONFIG,
  HP_M404_PRINTER_CONFIG,
} from '.';
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

vi.mock(import('@votingworks/backend'), async (importActual) => ({
  ...(await importActual()),
  isDeviceAttached: vi.fn(),
}));

const isDeviceAttachedMock = vi.mocked(isDeviceAttached);

const IDLE_RICH_STATUS: PrinterRichStatus = {
  state: 'idle',
  stateReasons: ['none'],
  markerInfos: [],
};

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
    print: (props) => mockPrintData(props),
  })
);

beforeEach(() => {
  mockConfigurePrinter.reset();
  mockGetConnectedDeviceUris.reset();
  mockGetPrinterRichStatus.reset();
  mockPrintData.reset();
  isDeviceAttachedMock.mockReturnValue(true);
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

  const config = CITIZEN_E351_PRINTER_CONFIG;
  const supportedPrinterUri1 = `${CITIZEN_E351_PRINTER_CONFIG.baseDeviceUri}/serial=1234`;
  const supportedPrinterUri2 = `${CITIZEN_E351_PRINTER_CONFIG.baseDeviceUri}/serial=1234`;
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
      config: CITIZEN_E351_PRINTER_CONFIG,
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

  mockPrintData
    .expectCallWith({ data: Buffer.of(), raw: {} })
    .returns(undefined);
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

  // printer detached is not registered if isDeviceAttached shows it is still on USB bus
  mockGetConnectedDeviceUris.expectCallWith().returns([]);
  expect(await printer.status()).toEqual({
    connected: true,
    config,
  });

  // printer detached is registered when isDeviceAttached shows it is gone
  mockGetConnectedDeviceUris.expectCallWith().returns([]);
  isDeviceAttachedMock.mockReturnValue(false);
  expect(await printer.status()).toEqual({ connected: false });
  expect(logger.log).toHaveBeenCalledTimes(2);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.PrinterConfigurationRemoved,
    'system',
    {
      message: 'The previously configured printer is no longer detected.',
      uri: supportedPrinterUri1,
    }
  );
  vi.useRealTimers();
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
    const uri = `${CITIZEN_E351_PRINTER_CONFIG.baseDeviceUri}/serial=1234`;
    const config = CITIZEN_E351_PRINTER_CONFIG;
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
    const uri = `${HP_4001_PRINTER_CONFIG.baseDeviceUri}/serial=1234`;
    const config = HP_4001_PRINTER_CONFIG;
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
    mockGetPrinterRichStatus.expectCallWith().returns(ok(richStatus));
    expect(await printer.status()).toEqual({
      connected: true,
      config,
      richStatus,
    });
  });

  test('logs only when rich status availability changes', async () => {
    const logger = mockBaseLogger({ fn: vi.fn });
    const printer = detectPrinter(logger);

    const uri = `${HP_4001_PRINTER_CONFIG.baseDeviceUri}/serial=1234`;
    const config = HP_4001_PRINTER_CONFIG;
    const richStatus: PrinterRichStatus = {
      state: 'idle',
      stateReasons: ['none'],
      markerInfos: [],
    };
    const ipptoolError: ExecError = {
      stdout: '',
      stderr:
        'ipptool: Unable to connect to localhost:60000: Connection refused',
      code: 1,
      signal: null,
      cmd: 'ipptool',
    };

    // printer connects, nothing serving IPP yet
    mockGetConnectedDeviceUris.expectCallWith().returns([uri]);
    mockConfigurePrinter.expectCallWith({ uri, config }).returns(undefined);
    mockGetPrinterRichStatus.expectCallWith().returns(err(ipptoolError));
    expect(await printer.status()).toEqual({ connected: true, config });
    expect(logger.log).toHaveBeenCalledTimes(2); // configured + unavailable
    expect(logger.log).toHaveBeenLastCalledWith(
      LogEventId.PrinterStatusChanged,
      'system',
      {
        message:
          'Rich printer status is unavailable via IPP; ipptool failed: ipptool: Unable to connect to localhost:60000: Connection refused',
        disposition: 'failure',
        ippUri: 'ipp://localhost:60000/ipp/print',
        exitCode: 1,
      }
    );

    // still unavailable: no additional log
    mockGetConnectedDeviceUris.expectCallWith().returns([uri]);
    mockGetPrinterRichStatus.expectCallWith().returns(err(ipptoolError));
    expect(await printer.status()).toEqual({ connected: true, config });
    expect(logger.log).toHaveBeenCalledTimes(2);

    // becomes available
    mockGetConnectedDeviceUris.expectCallWith().returns([uri]);
    mockGetPrinterRichStatus.expectCallWith().returns(ok(richStatus));
    expect(await printer.status()).toEqual({
      connected: true,
      config,
      richStatus,
    });
    expect(logger.log).toHaveBeenCalledTimes(3);
    expect(logger.log).toHaveBeenLastCalledWith(
      LogEventId.PrinterStatusChanged,
      'system',
      {
        message: 'Rich printer status is available via IPP.',
        disposition: 'success',
        ippUri: 'ipp://localhost:60000/ipp/print',
      }
    );

    // still available: no additional log
    mockGetConnectedDeviceUris.expectCallWith().returns([uri]);
    mockGetPrinterRichStatus.expectCallWith().returns(ok(richStatus));
    await printer.status();
    expect(logger.log).toHaveBeenCalledTimes(3);

    // fails without stderr: falls back to the exit code
    mockGetConnectedDeviceUris.expectCallWith().returns([uri]);
    mockGetPrinterRichStatus
      .expectCallWith()
      .returns(err({ ...ipptoolError, stderr: '', code: 124 }));
    await printer.status();
    expect(logger.log).toHaveBeenCalledTimes(4);
    expect(logger.log).toHaveBeenLastCalledWith(
      LogEventId.PrinterStatusChanged,
      'system',
      expect.objectContaining({
        message:
          'Rich printer status is unavailable via IPP; ipptool failed: exit code 124',
        exitCode: 124,
      })
    );

    // disconnect resets the state, so a reconnect logs again
    mockGetConnectedDeviceUris.expectCallWith().returns([]);
    isDeviceAttachedMock.mockReturnValue(false);
    expect(await printer.status()).toEqual({ connected: false });
    expect(logger.log).toHaveBeenCalledTimes(5); // removed
    mockGetConnectedDeviceUris.expectCallWith().returns([uri]);
    mockConfigurePrinter.expectCallWith({ uri, config }).returns(undefined);
    mockGetPrinterRichStatus.expectCallWith().returns(err(ipptoolError));
    await printer.status();
    expect(logger.log).toHaveBeenCalledTimes(7); // configured + unavailable
  });
});

describe('printer-specific print options', () => {
  test('passes the renderer option for printers that need it', async () => {
    const printer = detectPrinter(mockBaseLogger({ fn: vi.fn }));

    const uri = `${HP_4201_PRINTER_CONFIG.baseDeviceUri}?serial=1234`;
    const config = HP_4201_PRINTER_CONFIG;
    mockGetConnectedDeviceUris.expectCallWith().returns([uri]);
    mockConfigurePrinter.expectCallWith({ uri, config }).returns(undefined);
    mockGetPrinterRichStatus.expectCallWith().returns(ok(IDLE_RICH_STATUS));
    await printer.status();

    mockPrintData
      .expectCallWith({
        data: Buffer.of(),
        raw: { 'pdftops-renderer': 'pdftops' },
      })
      .returns(undefined);
    await printer.print({ data: Buffer.of() });
  });

  test('does not pass the renderer option for other printers', async () => {
    const printer = detectPrinter(mockBaseLogger({ fn: vi.fn }));

    const uri = `${HP_4001_PRINTER_CONFIG.baseDeviceUri}?serial=1234`;
    const config = HP_4001_PRINTER_CONFIG;
    mockGetConnectedDeviceUris.expectCallWith().returns([uri]);
    mockConfigurePrinter.expectCallWith({ uri, config }).returns(undefined);
    mockGetPrinterRichStatus.expectCallWith().returns(ok(IDLE_RICH_STATUS));
    await printer.status();

    mockPrintData
      .expectCallWith({ data: Buffer.of(), raw: {} })
      .returns(undefined);
    await printer.print({ data: Buffer.of() });
  });

  test('passes the input slot for printers that need it', async () => {
    const printer = detectPrinter(mockBaseLogger({ fn: vi.fn }));

    const uri = `${HP_M404_PRINTER_CONFIG.baseDeviceUri}?serial=1234`;
    const config = HP_M404_PRINTER_CONFIG;
    mockGetConnectedDeviceUris.expectCallWith().returns([uri]);
    mockConfigurePrinter.expectCallWith({ uri, config }).returns(undefined);
    mockGetPrinterRichStatus.expectCallWith().returns(ok(IDLE_RICH_STATUS));
    await printer.status();

    mockPrintData
      .expectCallWith({
        data: Buffer.of(),
        raw: { InputSlot: 'M404_Tray2' },
      })
      .returns(undefined);
    await printer.print({ data: Buffer.of() });
  });

  test('passes no renderer options when no printer is configured', async () => {
    const printer = detectPrinter(mockBaseLogger({ fn: vi.fn }));

    mockPrintData
      .expectCallWith({ data: Buffer.of(), raw: {} })
      .returns(undefined);
    await printer.print({ data: Buffer.of() });
  });

  test('caller-supplied raw options take precedence', async () => {
    const printer = detectPrinter(mockBaseLogger({ fn: vi.fn }));

    const uri = `${HP_4201_PRINTER_CONFIG.baseDeviceUri}?serial=1234`;
    const config = HP_4201_PRINTER_CONFIG;
    mockGetConnectedDeviceUris.expectCallWith().returns([uri]);
    mockConfigurePrinter.expectCallWith({ uri, config }).returns(undefined);
    mockGetPrinterRichStatus.expectCallWith().returns(ok(IDLE_RICH_STATUS));
    await printer.status();

    mockPrintData
      .expectCallWith({
        data: Buffer.of(),
        raw: { 'pdftops-renderer': 'gs' },
      })
      .returns(undefined);
    await printer.print({
      data: Buffer.of(),
      raw: { 'pdftops-renderer': 'gs' },
    });
  });
});
