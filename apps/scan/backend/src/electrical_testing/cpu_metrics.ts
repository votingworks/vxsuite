import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { safeParseInt, safeParseNumber } from '@votingworks/types';
import { lines } from '@votingworks/basics';

const execFileAsync = promisify(execFile);

export interface MemoryStats {
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  freeBytes: number;
  cachedBytes: number;
  buffersBytes: number;
}

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
 * Parse temperature from sensors JSON format.
 * Extracts CPU temperature from coretemp sensor data.
 */
function parseTemperatureFromSensorsJson(sensorsData: unknown): number | null {
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
            if (!Number.isNaN(temp) && temp > 0 && temp < 150) {
              return temp;
            }
          }
        }
      }
    }
  }

  return null;
}

/**
 * Get CPU temperature in Celsius.
 * Returns null if temperature cannot be read.
 *
 * On Debian, we try multiple methods:
 * 1. File specified in VX_TEMPERATURE_FILE_PATH env var (for VMs without direct sensor access)
 * 2. sensors command with JSON output (lm-sensors package)
 * 3. /sys/class/thermal/thermal_zone* /temp (kernel thermal zones)
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
    } catch {
      // Fall through to other methods if file read/parse fails
    }
  }

  // Try sensors command (requires lm-sensors package)
  try {
    const { stdout } = await execFileAsync('sensors', ['-j']);
    const sensorsData: unknown = JSON.parse(stdout);
    const temp = parseTemperatureFromSensorsJson(sensorsData);
    if (temp !== null) {
      return temp;
    }
  } catch {
    // sensors command not available or JSON parsing failed
  }

  // Try reading from thermal zones as final fallback
  try {
    const { stdout } = await execFileAsync('find', [
      '/sys/class/thermal',
      '-name',
      'temp',
      '-type',
      'f',
    ]);
    const tempFiles = stdout.trim().split('\n').filter(Boolean);

    for (const tempFile of tempFiles) {
      try {
        const content = await readFile(tempFile, 'utf8');
        const tempMillicelsiusResult = safeParseInt(content.trim());
        if (tempMillicelsiusResult.isOk()) {
          const tempMillicelsius = tempMillicelsiusResult.ok();
          if (tempMillicelsius > 0) {
            // Convert from millidegrees to degrees
            return tempMillicelsius / 1000;
          }
        }
      } catch {
        // Try next file
      }
    }
  } catch {
    // Thermal zones not available
  }

  return null;
}

/**
 * Get load averages from /proc/loadavg
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
 * Get memory statistics from /proc/meminfo
 */
async function getMemoryStats(): Promise<MemoryStats> {
  const content = await readFile('/proc/meminfo', 'utf8');
  const meminfoLines = content.split('\n');

  // Parse meminfo format: "MemTotal:       19995316 kB"
  function getValue(key: string): number {
    const line = meminfoLines.find((l) => l.startsWith(key));
    if (!line) return 0;
    const match = line.match(/:\s+(\d+)/);
    if (!match) return 0;
    const valueResult = safeParseInt(match[1]);
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
 * Get current CPU metrics
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
 * Get top CPU-using processes
 */
export async function getTopCpuProcesses(
  limit = 5
): Promise<Array<{ pid: number; cpu: number; command: string }>> {
  try {
    const { stdout } = await execFileAsync('ps', [
      'aux',
      '--sort=-pcpu',
      '--no-headers',
    ]);
    const processes: Array<{ pid: number; cpu: number; command: string }> = [];

    for (const line of lines(stdout.trim()).take(limit)) {
      // ps aux format: USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 11) {
        const pidResult = safeParseInt(parts[1]);
        const cpuResult = safeParseNumber(parts[2]);
        if (pidResult.isOk() && cpuResult.isOk()) {
          const command = parts.slice(10).join(' ');
          processes.push({ pid: pidResult.ok(), cpu: cpuResult.ok(), command });
        }
      }
    }

    return processes;
  } catch {
    return [];
  }
}
