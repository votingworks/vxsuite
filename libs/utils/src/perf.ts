import { Debugger } from 'debug';

export function formatDurationNs(nanoseconds: bigint): string {
  if (nanoseconds < 1000) {
    return `${nanoseconds}ns`;
  }

  if (nanoseconds < 1_000_000) {
    // eslint-disable-next-line vx/gts-safe-number-parse
    return `${Number(nanoseconds / BigInt(10)) / 100}µs`;
  }

  if (nanoseconds < 1_000_000_000) {
    // eslint-disable-next-line vx/gts-safe-number-parse
    return `${Number(nanoseconds / BigInt(10_000)) / 100}ms`;
  }

  // eslint-disable-next-line vx/gts-safe-number-parse
  return `${Number(nanoseconds / BigInt(10_000_000)) / 100}s`;
}

export interface Timer {
  checkpoint(name: string): bigint;
  end(): bigint;
}

export function time(debugLogger: Debugger, label: string): Timer {
  const debug = debugLogger.extend('perf');

  debug('%s START', label);
  const start = process.hrtime.bigint();
  let lastCheckpoint = start;

  return {
    checkpoint(name: string): bigint {
      const currentTime = process.hrtime.bigint();
      const duration = currentTime - lastCheckpoint;

      debug(
        '%s CHECKPOINT:%s (took %s)',
        label,
        name,
        formatDurationNs(duration)
      );

      lastCheckpoint = currentTime;

      return duration;
    },
    end(): bigint {
      const end = process.hrtime.bigint();
      const duration = end - start;
      debug('%s END (took %s)', label, formatDurationNs(duration));
      return duration;
    },
  };
}
