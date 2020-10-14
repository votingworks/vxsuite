import makeDebug from 'debug'

const debug = makeDebug('module-scan:perf')

export function formatDurationNs(nanoseconds: bigint): string {
  if (nanoseconds < 1000) {
    return `${nanoseconds}ns`
  } else if (nanoseconds < 1_000_000) {
    return `${Number(nanoseconds / BigInt(10)) / 100}µs`
  } else if (nanoseconds < 1_000_000_000) {
    return `${Number(nanoseconds / BigInt(10_000)) / 100}ms`
  } else {
    return `${Number(nanoseconds / BigInt(10_000_000)) / 100}s`
  }
}

export interface Timer {
  end(): BigInt
}

export function time(label: string): Timer {
  debug('%s START', label)
  const start = process.hrtime.bigint()

  return {
    end(): BigInt {
      const end = process.hrtime.bigint()
      const duration = end - start
      debug('%s END (took %s)', label, formatDurationNs(duration))
      return duration
    },
  }
}
