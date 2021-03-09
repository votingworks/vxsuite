import otsu from '@votingworks/hmpb-interpreter/dist/src/utils/otsu'
import makeDebug from 'debug'

const debug = makeDebug('module-scan:threshold')

export interface Stats {
  threshold: number
  foreground: LuminosityCounts
  background: LuminosityCounts
}

export interface LuminosityCounts {
  count: number
  ratio: number
}

/**
 * Gets luminosity stats for image data, counting pixels as either
 * foreground or background based on `threshold`.
 */
export function stats(
  { data }: ImageData,
  { threshold = otsu(data) } = {}
): Stats {
  const start = Date.now()

  let foreground = 0
  for (let i = 0; i < data.length; i++) {
    if (data[i] < threshold) {
      foreground++
    }
  }
  const background = data.length - foreground

  const result: Stats = {
    threshold,
    foreground: {
      count: foreground,
      ratio: foreground / data.length,
    },
    background: {
      count: background,
      ratio: background / data.length,
    },
  }

  const end = Date.now()
  debug(
    'computed luminosity stats on %d pixels in %dms: %O',
    data.length,
    end - start,
    result
  )

  return result
}
