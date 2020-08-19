import otsu from '@votingworks/hmpb-interpreter/dist/src/utils/otsu'
import makeDebug from 'debug'

const debug = makeDebug('module-scan:threshold')

export interface ThresholdInfo {
  threshold: number
  foreground: { count: number; ratio: number }
  background: { count: number; ratio: number }
}

/**
 * Gets threshold information for image data, counting pixels as either
 * foreground or background.
 *
 * @param data grayscale (1-channel) image data
 */
export default function threshold(data: ArrayLike<number>): ThresholdInfo {
  const start = Date.now()
  const threshold = otsu(data as Uint8Array)

  let foreground = 0
  for (let i = 0; i < data.length; i++) {
    if (data[i] < threshold) {
      foreground++
    }
  }
  const background = data.length - foreground

  const result: ThresholdInfo = {
    threshold,
    foreground: { count: foreground, ratio: foreground / data.length },
    background: { count: background, ratio: background / data.length },
  }

  const end = Date.now()
  debug(
    'computed threshold info on %d pixels in %dms: %O',
    data.length,
    end - start,
    result
  )

  return result
}
