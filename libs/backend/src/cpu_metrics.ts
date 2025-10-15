import { readFile, readlink } from 'node:fs/promises';
import { safeParseInt, safeParseNumber } from '@votingworks/types';
import { extractErrorMessage, lines, Optional } from '@votingworks/basics';
import { BaseLogger, LogEventId } from '@votingworks/logging';
import { format } from '@votingworks/utils';
import { execFile } from './exec';

// Temperature validation constants
const MIN_REALISTIC_TEMP_C = 0;
const MAX_REALISTIC_TEMP_C = 150;

/**
 * Current memory usage stats.
 */
export interface MemoryStats {
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  freeBytes: number;
  cachedBytes: number;
  buffersBytes: number;
}

/**
 * Current CPU usage, temperature, and load average stats.
 */
export interface CpuMetrics {
  temperatureCelsius: number | null;
  loadAverage: {
    oneMinute: number;
    fiveMinute: number;
    fifteenMinute: number;
  };
  memory: MemoryStats;
  timestamp: Date;
}

/**
 * Process information relevant to CPU utilization logging.
 */
export interface ProcessInfo {
  pid: number;
  cpu: number;
  command: string;
  user: string;
  cwd?: string;
}

/**
 * Parse temperature from sensors JSON format.
 * Extracts CPU temperature from coretemp sensor data.
 */
function parseTemperatureFromSensorsJson(sensorsData: unknown): number | null {
  // istanbul ignore next @preserve
  if (typeof sensorsData !== 'object' || sensorsData === null) {
    return null;
  }

  // Look for coretemp data (typical CPU sensor)
  for (const [sensorKey, sensorValue] of Object.entries(sensorsData)) {
    if (sensorKey.includes('coretemp') && typeof sensorValue === 'object') {
      const sensor = sensorValue as Record<string, unknown>;
      // Try to get Package temperature first, then any core temperature
      for (const value of Object.values(sensor)) {
        if (typeof value === 'object' && value !== null) {
          const tempData = value as Record<string, unknown>;
          if (typeof tempData['temp1_input'] === 'number') {
            const temp = tempData['temp1_input'];
            // Filter out anything that is very unlikely to be a realistic temperature.
            if (
              !Number.isNaN(temp) &&
              temp > MIN_REALISTIC_TEMP_C &&
              temp < MAX_REALISTIC_TEMP_C
            ) {
              return temp;
            }
          }
        }
      }
    }
  }

  // istanbul ignore next @preserve
  return null;
}

/**
 * Get CPU temperature in Celsius.
 * Returns null if temperature cannot be read.
 *
 * On Debian, we use the `sensors` CLI from `lm-sensors` if available. For
 * testing in a VM, you can specify the VX_TEMPERATURE_FILE_PATH env var to be
 * read instead, which can be updated via a shared file system mount or periodic
 * `scp` or however you'd like.
 */
async function getCpuTemperature(): Promise<number | null> {
  // Try reading from environment variable file first (for VMs)
  const tempFilePath = process.env['VX_TEMPERATURE_FILE_PATH'];
  if (tempFilePath) {
    try {
      const content = await readFile(tempFilePath, 'utf8');
      const sensorsData: unknown = JSON.parse(content);
      const temp = parseTemperatureFromSensorsJson(sensorsData);
      if (temp !== null) {
        return temp;
      }
    } catch (e) {
      // Fall through to other methods if file read/parse fails
    }
  }

  // Try sensors command (requires lm-sensors package)
  try {
    const { stdout } = await execFile('sensors', ['-j']);
    const sensorsData: unknown = JSON.parse(stdout);
    const temp = parseTemperatureFromSensorsJson(sensorsData);
    if (temp !== null) {
      return temp;
    }
  } catch {
    // sensors command not available or JSON parsing failed
  }

  return null;
}

/**
 * Get load averages from /proc/loadavg.
 */
async function getLoadAverage(): Promise<{
  oneMinute: number;
  fiveMinute: number;
  fifteenMinute: number;
}> {
  const content = await readFile('/proc/loadavg', 'utf8');
  const parts = content.trim().split(/\s+/);
  return {
    oneMinute: safeParseNumber(parts[0]).unsafeUnwrap(),
    fiveMinute: safeParseNumber(parts[1]).unsafeUnwrap(),
    fifteenMinute: safeParseNumber(parts[2]).unsafeUnwrap(),
  };
}

/**
 * Get memory statistics from /proc/meminfo.
 */
async function getMemoryStats(): Promise<MemoryStats> {
  const content = await readFile('/proc/meminfo', 'utf8');
  const meminfoLines = content.split('\n');

  // Parse meminfo format: "MemTotal:       19995316 kB"
  function getValue(key: string): number {
    const line = meminfoLines.find((l) => l.startsWith(key));
    // istanbul ignore next @preserve
    if (!line) return 0;
    const match = line.match(/:\s+(\d+)/);
    // istanbul ignore next @preserve
    if (!match) return 0;
    const valueResult = safeParseInt(match[1]);
    // istanbul ignore next @preserve
    return valueResult.isOk() ? valueResult.ok() * 1024 : 0; // Convert kB to bytes
  }

  const totalBytes = getValue('MemTotal');
  const freeBytes = getValue('MemFree');
  const availableBytes = getValue('MemAvailable');
  const cachedBytes = getValue('Cached');
  const buffersBytes = getValue('Buffers');

  // Calculate used memory: total - free - buffers - cached
  const usedBytes = totalBytes - freeBytes - buffersBytes - cachedBytes;

  return {
    totalBytes,
    usedBytes,
    availableBytes,
    freeBytes,
    cachedBytes,
    buffersBytes,
  };
}

/**
 * Get current CPU metrics.
 */
export async function getCpuMetrics(): Promise<CpuMetrics> {
  const [temperature, loadAverage, memory] = await Promise.all([
    getCpuTemperature(),
    getLoadAverage(),
    getMemoryStats(),
  ]);

  return {
    temperatureCelsius: temperature,
    loadAverage,
    memory,
    timestamp: new Date(),
  };
}

/**
 * Get top CPU-using processes with user and working directory information.
 */
export async function getTopCpuProcesses(
  limit = Infinity
): Promise<ProcessInfo[]> {
  try {
    // Use 'comm' and 'user' format specifiers to get executable name and user
    const { stdout } = await execFile('ps', [
      '-eo',
      'pid,%cpu,user,comm',
      '--sort=-pcpu',
      '--no-headers',
    ]);
    const processes: ProcessInfo[] = [];
    const remainingLines = lines(stdout.trim()).toArray();

    while (processes.length < limit) {
      const line = remainingLines.shift();
      if (!line) {
        break;
      }

      // ps -eo format: PID %CPU USER COMMAND
      // Note: USER and COMMAND (comm) can contain spaces, so we use a regex to parse
      // Match: PID (non-whitespace), whitespace, CPU (non-whitespace), whitespace, USER (non-whitespace), whitespace, COMMAND (everything else)
      const match = line.trim().match(/^(\S+)\s+(\S+)\s+(\S+)\s+(.+)$/);
      if (match) {
        const pidResult = safeParseInt(match[1]);
        const cpuResult = safeParseNumber(match[2]);
        if (pidResult.isOk() && cpuResult.isOk()) {
          const pid = pidResult.ok();
          const user = match[3] as string;
          const command = match[4] as string;

          let cwd: Optional<string>;
          try {
            cwd = await readlink(`/proc/${pid}/cwd`);
          } catch {
            // Can't read cwd (e.g., permission denied or process ended), leave as null
          }

          processes.push({ pid, cpu: cpuResult.ok(), command, user, cwd });
        }
      }
    }

    return processes;
  } catch {
    return [];
  }
}

/**
 * Start periodic logging of CPU metrics.
 *
 * @param logger - Logger instance to use for logging metrics
 */
export function startCpuMetricsLogging(
  logger: BaseLogger,
  {
    interval = 30_000, // 30 seconds
    topProcessCount = 5,
  } = {}
): { stop(): void } {
  async function logCpuMetrics(): Promise<void> {
    try {
      const [metrics, topProcesses] = await Promise.all([
        getCpuMetrics(),
        getTopCpuProcesses(topProcessCount),
      ]);

      const processInfo = topProcesses
        .map((p) => {
          const cwdInfo = p.cwd ? ` [${p.cwd}]` : '';
          return `${p.command} (${p.user}, ${p.cpu}%)${cwdInfo}`;
        })
        .join(', ');

      const memUsed = format.bytes(metrics.memory.usedBytes);
      const memAvail = format.bytes(metrics.memory.availableBytes);
      const memCached = format.bytes(metrics.memory.cachedBytes);
      const memFree = format.bytes(metrics.memory.freeBytes);

      logger.log(LogEventId.DiagnosticComplete, 'system', {
        disposition: 'success',
        message: `System Metrics - Temp: ${
          metrics.temperatureCelsius ?? 'N/A'
        }°C, Load: ${metrics.loadAverage.oneMinute.toFixed(
          2
        )}/${metrics.loadAverage.fiveMinute.toFixed(
          2
        )}/${metrics.loadAverage.fifteenMinute.toFixed(
          2
        )}, Mem: ${memUsed} used / ${memAvail} avail / ${memCached} cached / ${memFree} free`,
        temperatureCelsius:
          metrics.temperatureCelsius !== null
            ? metrics.temperatureCelsius
            : undefined,
        loadAverage1m: metrics.loadAverage.oneMinute,
        loadAverage5m: metrics.loadAverage.fiveMinute,
        loadAverage15m: metrics.loadAverage.fifteenMinute,
        memoryUsedBytes: metrics.memory.usedBytes,
        memoryAvailableBytes: metrics.memory.availableBytes,
        memoryCachedBytes: metrics.memory.cachedBytes,
        memoryFreeBytes: metrics.memory.freeBytes,
        topProcesses: processInfo || 'none',
      });
    } catch (error) {
      logger.log(LogEventId.UnknownError, 'system', {
        disposition: 'failure',
        message: 'Failed to log CPU metrics',
        error: extractErrorMessage(error),
      });
    }
  }

  // Log immediately on startup
  void logCpuMetrics();

  // Then log periodically
  const logCpuMetricsTimeout = setInterval(() => {
    void logCpuMetrics();
  }, interval);

  return {
    stop() {
      clearTimeout(logCpuMetricsTimeout);
    },
  };
}
