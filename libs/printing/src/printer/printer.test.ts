import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import { err, ok } from '@votingworks/basics';
import { mockFunction } from '@votingworks/test-utils';
import { LogEventId, mockBaseLogger } from '@votingworks/logging';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { PrinterRichStatus } from '@votingworks/types';
import { isDeviceAttached } from '@votingworks/backend';
import { detectPrinter } from './printer';
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

const mockGetPrinterRichStatus = mockFunction('mockGetPrinterRichStatus');
vi.mock(
  import('./status.js'),
  async (importActual): Promise<typeof import('./status')> => ({
    ...(await importActual()),
    getPrinterRichStatus: () => mockGetPrinterRichStatus(),
  })
);

const mockPrintData = mockFunction('mockPrintData');
const mockCancelAllJobs = mockFunction('cancelAllJobs');
vi.mock(
  import('./print.js'),
  async (importActual): Promise<typeof import('./print')> => ({
    ...(await importActual()),
    print: (props) => mockPrintData(props),
    cancelAllJobs: () => mockCancelAllJobs(),
  })
);

vi.mock(import('./job_monitor.js'), async (importActual) => ({
  ...(await importActual()),
  startPrintJobMonitor: vi.fn(({ jobId, jobs }) => {
    jobs.set(jobId, { outcome: 'in-progress' });
    return { stop: vi.fn() };
  }),
}));

const MOCK_JOB_ID = 1;

beforeEach(() => {
  mockConfigurePrinter.reset();
  mockGetConnectedDeviceUris.reset();
  mockGetPrinterRichStatus.reset();
  mockPrintData.reset();
  mockCancelAllJobs.reset();
  isDeviceAttachedMock.mockReturnValue(true);
});

afterEach(() => {
  mockConfigurePrinter.assertComplete();
  mockGetConnectedDeviceUris.assertComplete();
  mockGetPrinterRichStatus.assertComplete();
  mockPrintData.assertComplete();
  mockCancelAllJobs.assertComplete();
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
    .returns(MOCK_JOB_ID);
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
  mockCancelAllJobs.expectCallWith().returns(undefined);
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
    mockGetPrinterRichStatus.expectCallWith().returns(richStatus);
    expect(await printer.status()).toEqual({
      connected: true,
      config,
      richStatus,
    });
  });
});

describe('printer-specific print options', () => {
  test('passes the renderer option for printers that need it', async () => {
    const printer = detectPrinter(mockBaseLogger({ fn: vi.fn }));

    const uri = `${HP_4201_PRINTER_CONFIG.baseDeviceUri}?serial=1234`;
    const config = HP_4201_PRINTER_CONFIG;
    mockGetConnectedDeviceUris.expectCallWith().returns([uri]);
    mockConfigurePrinter.expectCallWith({ uri, config }).returns(undefined);
    mockGetPrinterRichStatus.expectCallWith().returns(undefined);
    await printer.status();

    mockPrintData
      .expectCallWith({
        data: Buffer.of(),
        raw: { 'pdftops-renderer': 'pdftops' },
      })
      .returns(MOCK_JOB_ID);
    await printer.print({ data: Buffer.of() });
  });

  test('does not pass the renderer option for other printers', async () => {
    const printer = detectPrinter(mockBaseLogger({ fn: vi.fn }));

    const uri = `${HP_4001_PRINTER_CONFIG.baseDeviceUri}?serial=1234`;
    const config = HP_4001_PRINTER_CONFIG;
    mockGetConnectedDeviceUris.expectCallWith().returns([uri]);
    mockConfigurePrinter.expectCallWith({ uri, config }).returns(undefined);
    mockGetPrinterRichStatus.expectCallWith().returns(undefined);
    await printer.status();

    mockPrintData
      .expectCallWith({ data: Buffer.of(), raw: {} })
      .returns(MOCK_JOB_ID);
    await printer.print({ data: Buffer.of() });
  });

  test('passes the input slot for printers that need it', async () => {
    const printer = detectPrinter(mockBaseLogger({ fn: vi.fn }));

    const uri = `${HP_M404_PRINTER_CONFIG.baseDeviceUri}?serial=1234`;
    const config = HP_M404_PRINTER_CONFIG;
    mockGetConnectedDeviceUris.expectCallWith().returns([uri]);
    mockConfigurePrinter.expectCallWith({ uri, config }).returns(undefined);
    mockGetPrinterRichStatus.expectCallWith().returns(undefined);
    await printer.status();

    mockPrintData
      .expectCallWith({
        data: Buffer.of(),
        raw: { InputSlot: 'M404_Tray2' },
      })
      .returns(MOCK_JOB_ID);
    await printer.print({ data: Buffer.of() });
  });

  test('passes no renderer options when no printer is configured', async () => {
    const printer = detectPrinter(mockBaseLogger({ fn: vi.fn }));

    mockPrintData
      .expectCallWith({ data: Buffer.of(), raw: {} })
      .returns(MOCK_JOB_ID);
    await printer.print({ data: Buffer.of() });
  });

  test('caller-supplied raw options take precedence', async () => {
    const printer = detectPrinter(mockBaseLogger({ fn: vi.fn }));

    const uri = `${HP_4201_PRINTER_CONFIG.baseDeviceUri}?serial=1234`;
    const config = HP_4201_PRINTER_CONFIG;
    mockGetConnectedDeviceUris.expectCallWith().returns([uri]);
    mockConfigurePrinter.expectCallWith({ uri, config }).returns(undefined);
    mockGetPrinterRichStatus.expectCallWith().returns(undefined);
    await printer.status();

    mockPrintData
      .expectCallWith({
        data: Buffer.of(),
        raw: { 'pdftops-renderer': 'gs' },
      })
      .returns(MOCK_JOB_ID);
    await printer.print({
      data: Buffer.of(),
      raw: { 'pdftops-renderer': 'gs' },
    });
  });
});

test('job status tracking', async () => {
  const printer = detectPrinter(mockBaseLogger({ fn: vi.fn }));

  const uri = `${CITIZEN_E351_PRINTER_CONFIG.baseDeviceUri}/serial=1234`;
  mockGetConnectedDeviceUris.expectCallWith().returns([uri]);
  mockConfigurePrinter
    .expectCallWith({ uri, config: CITIZEN_E351_PRINTER_CONFIG })
    .returns(undefined);
  await printer.status();

  expect(printer.getJobStatus(MOCK_JOB_ID)).toEqual(err(expect.any(Error)));

  mockPrintData
    .expectCallWith({ data: Buffer.of(), raw: {} })
    .returns(MOCK_JOB_ID);
  const jobId = await printer.print({ data: Buffer.of() });

  expect(printer.getJobStatus(jobId)).toEqual(ok({ outcome: 'in-progress' }));

  mockCancelAllJobs.expectCallWith().returns(undefined);
  await printer.clearJobQueue();
});
