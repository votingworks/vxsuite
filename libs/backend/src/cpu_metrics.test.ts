import { beforeEach, expect, test, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import * as mockFs from 'node:fs/promises';
import { mockLogger } from '@votingworks/logging';
import { backendWaitFor } from '@votingworks/test-utils';
import { MaybePromise, Optional, sleep } from '@votingworks/basics';
import { getTopCpuProcesses, startCpuMetricsLogging } from './cpu_metrics';
import { execFile } from './exec';

vi.mock(import('./exec.js'));
vi.mock(import('node:fs/promises'));

const execFileMockMatchers: Array<
  (
    file: string,
    args?: readonly string[] | null
  ) => MaybePromise<Optional<{ stdout: string; stderr: string }>>
> = [];
// @ts-expect-error -- `execFile` is overloaded and confuses TS
vi.mocked(execFile).mockImplementation(async (file, args) => {
  for (const matcher of execFileMockMatchers) {
    const result = await matcher(file, args);
    if (typeof result !== 'undefined') {
      return result;
    }
  }

  throw new Error(`Unexpected command: ${file} ${args?.join(' ')}`);
});

const readFileMockMatchers: Array<
  (
    file: Parameters<(typeof mockFs)['readFile']>[0]
  ) => MaybePromise<Optional<string | Buffer>>
> = [];
vi.mocked(mockFs.readFile).mockImplementation(async (file) => {
  for (const matcher of readFileMockMatchers) {
    const result = await matcher(file);
    if (typeof result !== 'undefined') {
      return result;
    }
  }

  throw new Error(`Unexpected file: ${file}`);
});

const readlinkMockMatchers: Array<
  (
    file: Parameters<(typeof mockFs)['readlink']>[0]
  ) => MaybePromise<Optional<string>>
> = [];
vi.mocked(mockFs.readlink).mockImplementation(async (file) => {
  for (const matcher of readlinkMockMatchers) {
    const result = await matcher(file);
    if (typeof result !== 'undefined') {
      return result;
    }
  }

  throw new Error(`Unexpected file: ${file}`);
});

beforeEach(() => {
  execFileMockMatchers.length = 0;
  readFileMockMatchers.length = 0;
  readlinkMockMatchers.length = 0;
});

const DEFAULT_SENSORS_DATA = {
  'coretemp-isa-0000': {
    Adapter: 'ISA adapter',
    'Package id 0': {
      temp1_input: 39.0,
      temp1_max: 80.0,
      temp1_crit: 100.0,
      temp1_crit_alarm: 0.0,
    },
    'Core 0': {
      temp2_input: 37.0,
      temp2_max: 80.0,
      temp2_crit: 100.0,
      temp2_crit_alarm: 0.0,
    },
    'Core 1': {
      temp3_input: 37.0,
      temp3_max: 80.0,
      temp3_crit: 100.0,
      temp3_crit_alarm: 0.0,
    },
    'Core 2': {
      temp4_input: 38.0,
      temp4_max: 80.0,
      temp4_crit: 100.0,
      temp4_crit_alarm: 0.0,
    },
    'Core 3': {
      temp5_input: 37.0,
      temp5_max: 80.0,
      temp5_crit: 100.0,
      temp5_crit_alarm: 0.0,
    },
    'Core 4': {
      temp6_input: 38.0,
      temp6_max: 80.0,
      temp6_crit: 100.0,
      temp6_crit_alarm: 0.0,
    },
    'Core 5': {
      temp7_input: 36.0,
      temp7_max: 80.0,
      temp7_crit: 100.0,
      temp7_crit_alarm: 0.0,
    },
  },
  'pch_cometlake-virtual-0': {
    Adapter: 'Virtual device',
    temp1: { temp1_input: 39.0 },
  },
  'nvme-pci-0100': {
    Adapter: 'PCI adapter',
    Composite: {
      temp1_input: 38.85,
      temp1_max: 82.85,
      temp1_min: -0.15,
      temp1_crit: 83.85,
      temp1_alarm: 0.0,
    },
    'Sensor 1': {
      temp2_input: 31.85,
      temp2_max: 65261.85,
      temp2_min: -273.15,
    },
    'Sensor 2': {
      temp3_input: 34.85,
      temp3_max: 65261.85,
      temp3_min: -273.15,
    },
  },
  'iwlwifi_1-virtual-0': {
    Adapter: 'Virtual device',
    temp1: { temp1_input: 30.0 },
  },
} as const;

function enableSensorsMock(data: unknown = DEFAULT_SENSORS_DATA) {
  execFileMockMatchers.push((file) =>
    file === 'sensors'
      ? Promise.resolve({
          stdout: JSON.stringify(data),
          stderr: '',
        })
      : undefined
  );
}

const DEFAULT_PS_DATA = [
  '38702 46.3 libvirt+ qemu-system-x86',
  '44580 11.0 brian    chromium',
  '27879  4.7 libvirt+ qemu-system-x86',
  '42861  3.3 brian    ghostty',
  '43376  2.7 brian    chromium',
  '43212  2.6 brian    chromium',
  '2883  2.5 brian    chromium',
  '1938  2.3 brian    chromium',
  '1845  1.5 brian    chromium',
  '1888  1.1 brian    chromium',
  '27319  0.8 brian    chromium',
]
  .map((line) => `${line}\n`)
  .join('');

function enablePsMock(output = DEFAULT_PS_DATA) {
  execFileMockMatchers.push((file) =>
    file === 'ps'
      ? Promise.resolve({
          stdout: output,
          stderr: '',
        })
      : undefined
  );
}

const DEFAULT_MEMINFO = [
  'MemTotal:       32585332 kB',
  'MemFree:         1618828 kB',
  'MemAvailable:   13522448 kB',
  'Buffers:            2384 kB',
  'Cached:         21679136 kB',
  'SwapCached:            0 kB',
  'Active:         15062572 kB',
  'Inactive:       13756240 kB',
  'Active(anon):   14126644 kB',
  'Inactive(anon):  2388252 kB',
  'Active(file):     935928 kB',
  'Inactive(file): 11367988 kB',
  'Unevictable:     1317676 kB',
  'Mlocked:             152 kB',
  'SwapTotal:       4194300 kB',
  'SwapFree:        4194292 kB',
  'Zswap:                 0 kB',
  'Zswapped:              0 kB',
  'Dirty:              1700 kB',
  'Writeback:             0 kB',
  'AnonPages:       8325676 kB',
  'Mapped:          8843236 kB',
  'Shmem:           9377908 kB',
  'KReclaimable:     302544 kB',
  'Slab:             479304 kB',
  'SReclaimable:     302544 kB',
  'SUnreclaim:       176760 kB',
  'KernelStack:       24848 kB',
  'PageTables:        93836 kB',
  'SecPageTables:     20420 kB',
  'NFS_Unstable:          0 kB',
  'Bounce:                0 kB',
  'WritebackTmp:          0 kB',
  'CommitLimit:    20486964 kB',
  'Committed_AS:   62607684 kB',
  'VmallocTotal:   34359738367 kB',
  'VmallocUsed:       87636 kB',
  'VmallocChunk:          0 kB',
  'Percpu:            11200 kB',
  'HardwareCorrupted:     0 kB',
  'AnonHugePages:   3112960 kB',
  'ShmemHugePages:        0 kB',
  'ShmemPmdMapped:        0 kB',
  'FileHugePages:    301056 kB',
  'FilePmdMapped:    264192 kB',
  'CmaTotal:              0 kB',
  'CmaFree:               0 kB',
  'Unaccepted:            0 kB',
  'Balloon:               0 kB',
  'HugePages_Total:       0',
  'HugePages_Free:        0',
  'HugePages_Rsvd:        0',
  'HugePages_Surp:        0',
  'Hugepagesize:       2048 kB',
  'Hugetlb:               0 kB',
  'DirectMap4k:      324348 kB',
  'DirectMap2M:    10936320 kB',
  'DirectMap1G:    23068672 kB',
]
  .map((line) => `${line}\n`)
  .join('');

function enableProcfsMock({
  loadavg,
  meminfo,
}: { loadavg?: string; meminfo?: string } = {}) {
  readFileMockMatchers.push((file) => {
    if (file === '/proc/loadavg') {
      return loadavg ?? '2.22 1.93 1.78 1/1584 46214\n';
    }

    if (file === '/proc/meminfo') {
      return meminfo ?? DEFAULT_MEMINFO;
    }

    return undefined;
  });
}

test('startCpuMetricsLogging happy path', async () => {
  const logger = mockLogger({ fn: vi.fn });

  // Set up all mocks.
  enableSensorsMock();
  enablePsMock();
  enableProcfsMock();
  readlinkMockMatchers.push((file) =>
    typeof file === 'string' && /^\/proc\/\d+\/cwd$/.test(file)
      ? 'CWD'
      : undefined
  );

  const metricsLogInterval = 1; // 1ms
  const metricsLogging = startCpuMetricsLogging(logger, {
    interval: metricsLogInterval,
  });
  let logCount = 0;

  await backendWaitFor(
    () => {
      // Verify `log` is called more than once.
      logCount = vi.mocked(logger.log).mock.calls.length;
      expect(logCount).toBeGreaterThanOrEqual(2);
    },
    { interval: metricsLogInterval * 10 }
  );

  // Verify that stopping metrics logging actually works.
  metricsLogging.stop();
  await sleep(metricsLogInterval * 10);
  expect(vi.mocked(logger.log).mock.calls).toHaveLength(logCount);

  // Check that the log contains data from the expected commands and files.
  expect(logger.log).toHaveBeenCalledWith('diagnostic-complete', 'system', {
    disposition: 'success',
    message:
      'System Metrics - Temp: 39°C, Load: 2.22/1.93/1.78, Mem: 8.9 GB used / 12.9 GB avail / 20.7 GB cached / 1.5 GB free',
    loadAverage15m: 1.78,
    loadAverage1m: 2.22,
    loadAverage5m: 1.93,
    memoryAvailableBytes: 13846986752,
    memoryCachedBytes: 22199435264,
    memoryFreeBytes: 1657679872,
    memoryUsedBytes: 9507823616,
    temperatureCelsius: 39,
    topProcesses:
      'qemu-system-x86 (46.3%) (user=libvirt+, cwd=CWD), chromium (11%) (user=brian, cwd=CWD), qemu-system-x86 (4.7%) (user=libvirt+, cwd=CWD), ghostty (3.3%) (user=brian, cwd=CWD), chromium (2.7%) (user=brian, cwd=CWD)',
  });
});

test('startCpuMetricsLogging no procfs', async () => {
  const logger = mockLogger({ fn: vi.fn });

  // No procfs mock.
  enableSensorsMock();
  enablePsMock();

  const metricsLogInterval = 1; // 1ms
  const metricsLogging = startCpuMetricsLogging(logger, {
    interval: metricsLogInterval,
  });
  let logCount = 0;

  await backendWaitFor(
    () => {
      // Verify `log` is called more than once.
      logCount = vi.mocked(logger.log).mock.calls.length;
      expect(logCount).toBeGreaterThanOrEqual(2);
    },
    { interval: metricsLogInterval * 10 }
  );

  // Verify that stopping metrics logging actually works.
  metricsLogging.stop();
  await sleep(metricsLogInterval * 10);
  expect(vi.mocked(logger.log).mock.calls).toHaveLength(logCount);

  // Check that the error is logged.
  expect(logger.log).toHaveBeenCalledWith('unknown-error', 'system', {
    disposition: 'failure',
    message: 'Failed to log CPU metrics',
    error: 'Unexpected file: /proc/loadavg',
  });
});

test('startCpuMetricsLogging bogus procfs', async () => {
  const logger = mockLogger({ fn: vi.fn });

  // Bogus procfs mock.
  enableProcfsMock({
    meminfo: DEFAULT_MEMINFO.replace(
      'MemAvailable:   13522448 kB',
      'MemAvailable:   kermit'
    ),
  });
  enableSensorsMock();
  enablePsMock();

  const metricsLogInterval = 1; // 1ms
  const metricsLogging = startCpuMetricsLogging(logger, {
    interval: metricsLogInterval,
  });
  let logCount = 0;

  await backendWaitFor(
    () => {
      // Verify `log` is called more than once.
      logCount = vi.mocked(logger.log).mock.calls.length;
      expect(logCount).toBeGreaterThanOrEqual(2);
    },
    { interval: metricsLogInterval * 10 }
  );

  // Verify that stopping metrics logging actually works.
  metricsLogging.stop();
  await sleep(metricsLogInterval * 10);
  expect(vi.mocked(logger.log).mock.calls).toHaveLength(logCount);

  // Check that the bogus data is ignored.
  expect(logger.log).toHaveBeenCalledWith(
    'diagnostic-complete',
    'system',
    expect.objectContaining({
      disposition: 'success',
      memoryAvailableBytes: 0,
    })
  );
});

test('startCpuMetricsLogging no sensors', async () => {
  const logger = mockLogger({ fn: vi.fn });

  // No sensors mock.
  enablePsMock();
  enableProcfsMock();

  const metricsLogInterval = 1; // 1ms
  const metricsLogging = startCpuMetricsLogging(logger, {
    interval: metricsLogInterval,
  });
  let logCount = 0;

  await backendWaitFor(
    () => {
      // Verify `log` is called more than once.
      logCount = vi.mocked(logger.log).mock.calls.length;
      expect(logCount).toBeGreaterThanOrEqual(2);
    },
    { interval: metricsLogInterval * 10 }
  );

  // Verify that stopping metrics logging actually works.
  metricsLogging.stop();
  await sleep(metricsLogInterval * 10);
  expect(vi.mocked(logger.log).mock.calls).toHaveLength(logCount);

  // Check that the log does not have any CPU temperature information.
  expect(logger.log).toHaveBeenCalledWith(
    'diagnostic-complete',
    'system',
    expect.objectContaining({
      disposition: 'success',
      message: expect.stringContaining('Temp: N/A'),
      temperatureCelsius: undefined,
    })
  );
});

test('startCpuMetricsLogging `sensors` data is bogus', async () => {
  const logger = mockLogger({ fn: vi.fn });

  // Bogus sensors mock.
  enableSensorsMock([]);
  enablePsMock();
  enableProcfsMock();

  const metricsLogInterval = 1; // 1ms
  const metricsLogging = startCpuMetricsLogging(logger, {
    interval: metricsLogInterval,
  });
  let logCount = 0;

  await backendWaitFor(
    () => {
      // Verify `log` is called more than once.
      logCount = vi.mocked(logger.log).mock.calls.length;
      expect(logCount).toBeGreaterThanOrEqual(2);
    },
    { interval: metricsLogInterval * 10 }
  );

  // Verify that stopping metrics logging actually works.
  metricsLogging.stop();
  await sleep(metricsLogInterval * 10);
  expect(vi.mocked(logger.log).mock.calls).toHaveLength(logCount);

  // Check that the log does not have any CPU temperature information.
  expect(logger.log).toHaveBeenCalledWith(
    'diagnostic-complete',
    'system',
    expect.objectContaining({
      disposition: 'success',
      message: expect.stringContaining('Temp: N/A'),
      temperatureCelsius: undefined,
    })
  );
});

test('startCpuMetricsLogging no ps', async () => {
  const logger = mockLogger({ fn: vi.fn });

  // No ps mock.
  enableSensorsMock();
  enableProcfsMock();

  const metricsLogInterval = 1; // 1ms
  const metricsLogging = startCpuMetricsLogging(logger, {
    interval: metricsLogInterval,
  });
  let logCount = 0;

  await backendWaitFor(
    () => {
      // Verify `log` is called more than once.
      logCount = vi.mocked(logger.log).mock.calls.length;
      expect(logCount).toBeGreaterThanOrEqual(2);
    },
    { interval: metricsLogInterval * 10 }
  );

  // Verify that stopping metrics logging actually works.
  metricsLogging.stop();
  await sleep(metricsLogInterval * 10);
  expect(vi.mocked(logger.log).mock.calls).toHaveLength(logCount);

  // Check that the log contains data from the expected commands and files.
  expect(logger.log).toHaveBeenCalledWith(
    'diagnostic-complete',
    'system',
    expect.objectContaining({
      disposition: 'success',
      topProcesses: 'none',
    })
  );
});

test('startCpuMetricsLogging VX_TEMPERATURE_FILE_PATH valid', async () => {
  const logger = mockLogger({ fn: vi.fn });
  vi.stubEnv('VX_TEMPERATURE_FILE_PATH', 'mock:VX_TEMPERATURE_FILE_PATH');

  readFileMockMatchers.push((file) => {
    if (file === 'mock:VX_TEMPERATURE_FILE_PATH') {
      return JSON.stringify(DEFAULT_SENSORS_DATA, (_, value) =>
        value === 39 ? 89 : value
      );
    }

    return undefined;
  });
  enablePsMock();
  enableProcfsMock();

  const metricsLogInterval = 1; // 1ms
  const metricsLogging = startCpuMetricsLogging(logger, {
    interval: metricsLogInterval,
  });
  let logCount = 0;

  await backendWaitFor(
    () => {
      // Verify `log` is called more than once.
      logCount = vi.mocked(logger.log).mock.calls.length;
      expect(logCount).toBeGreaterThanOrEqual(2);
    },
    { interval: metricsLogInterval * 10 }
  );

  // Verify that stopping metrics logging actually works.
  metricsLogging.stop();
  await sleep(metricsLogInterval * 10);
  expect(vi.mocked(logger.log).mock.calls).toHaveLength(logCount);

  // Check that the log contains data from the expected commands and files.
  expect(logger.log).toHaveBeenCalledWith('diagnostic-complete', 'system', {
    disposition: 'success',
    message:
      'System Metrics - Temp: 89°C, Load: 2.22/1.93/1.78, Mem: 8.9 GB used / 12.9 GB avail / 20.7 GB cached / 1.5 GB free',
    loadAverage15m: 1.78,
    loadAverage1m: 2.22,
    loadAverage5m: 1.93,
    memoryAvailableBytes: 13846986752,
    memoryCachedBytes: 22199435264,
    memoryFreeBytes: 1657679872,
    memoryUsedBytes: 9507823616,
    temperatureCelsius: 89,
    topProcesses:
      'qemu-system-x86 (46.3%) (user=libvirt+), chromium (11%) (user=brian), qemu-system-x86 (4.7%) (user=libvirt+), ghostty (3.3%) (user=brian), chromium (2.7%) (user=brian)',
  });
});

test('startCpuMetricsLogging bogus temperatures', async () => {
  const logger = mockLogger({ fn: vi.fn });

  enableSensorsMock(
    JSON.parse(
      JSON.stringify(DEFAULT_SENSORS_DATA, (_, value) =>
        value === 39 ? 900 : value
      )
    )
  );
  enablePsMock();
  enableProcfsMock();

  const metricsLogInterval = 1; // 1ms
  const metricsLogging = startCpuMetricsLogging(logger, {
    interval: metricsLogInterval,
  });
  let logCount = 0;

  await backendWaitFor(
    () => {
      // Verify `log` is called more than once.
      logCount = vi.mocked(logger.log).mock.calls.length;
      expect(logCount).toBeGreaterThanOrEqual(2);
    },
    { interval: metricsLogInterval * 10 }
  );

  // Verify that stopping metrics logging actually works.
  metricsLogging.stop();
  await sleep(metricsLogInterval * 10);
  expect(vi.mocked(logger.log).mock.calls).toHaveLength(logCount);

  // Check that the log contains data from the expected commands and files.
  expect(logger.log).toHaveBeenCalledWith(
    'diagnostic-complete',
    'system',
    expect.objectContaining({
      message: expect.stringContaining('Temp: N/A'),
      temperatureCelsius: undefined,
    })
  );
});

test('startCpuMetricsLogging VX_TEMPERATURE_FILE_PATH invalid', async () => {
  const logger = mockLogger({ fn: vi.fn });
  vi.stubEnv('VX_TEMPERATURE_FILE_PATH', 'mock:VX_TEMPERATURE_FILE_PATH');

  readFileMockMatchers.push((file) => {
    if (file === 'mock:VX_TEMPERATURE_FILE_PATH') {
      return JSON.stringify([]);
    }

    return undefined;
  });

  enableSensorsMock();
  enablePsMock();
  enableProcfsMock();

  const metricsLogInterval = 1; // 1ms
  const metricsLogging = startCpuMetricsLogging(logger, {
    interval: metricsLogInterval,
  });
  let logCount = 0;

  await backendWaitFor(
    () => {
      // Verify `log` is called more than once.
      logCount = vi.mocked(logger.log).mock.calls.length;
      expect(logCount).toBeGreaterThanOrEqual(2);
    },
    { interval: metricsLogInterval * 10 }
  );

  // Verify that stopping metrics logging actually works.
  metricsLogging.stop();
  await sleep(metricsLogInterval * 10);
  expect(vi.mocked(logger.log).mock.calls).toHaveLength(logCount);

  // Check that we fall back to invoking `sensors`.
  expect(logger.log).toHaveBeenCalledWith('diagnostic-complete', 'system', {
    disposition: 'success',
    message:
      'System Metrics - Temp: 39°C, Load: 2.22/1.93/1.78, Mem: 8.9 GB used / 12.9 GB avail / 20.7 GB cached / 1.5 GB free',
    loadAverage15m: 1.78,
    loadAverage1m: 2.22,
    loadAverage5m: 1.93,
    memoryAvailableBytes: 13846986752,
    memoryCachedBytes: 22199435264,
    memoryFreeBytes: 1657679872,
    memoryUsedBytes: 9507823616,
    temperatureCelsius: 39,
    topProcesses:
      'qemu-system-x86 (46.3%) (user=libvirt+), chromium (11%) (user=brian), qemu-system-x86 (4.7%) (user=libvirt+), ghostty (3.3%) (user=brian), chromium (2.7%) (user=brian)',
  });
});

test('getTopCpuProcesses returns results', async () => {
  enablePsMock();
  expect(await getTopCpuProcesses()).not.toHaveLength(0);
});

test('getTopCpuProcesses can limit results', async () => {
  enablePsMock();
  expect(await getTopCpuProcesses(1)).toHaveLength(1);
});

test('getTopCpuProcesses filters junk from ps output', async () => {
  enablePsMock(
    `#huh?\nthis is not process data\n${DEFAULT_PS_DATA}NOT A PS LINE`
  );
  expect(await getTopCpuProcesses(1)).toHaveLength(1);
});

test('getTopCpuProcesses can include cwd', async () => {
  enablePsMock();
  readlinkMockMatchers.push((file) =>
    typeof file === 'string' && /^\/proc\/\d+\/cwd$/.test(file)
      ? 'CWD'
      : undefined
  );
  expect(await getTopCpuProcesses(1)).toContainEqual(
    expect.objectContaining({ cwd: 'CWD' })
  );
});
