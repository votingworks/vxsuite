import { PIXEL_BLACK } from './binarize'
import { getImageChannelCount } from './imageFormatUtils'

export interface FindLinesResult {
  xCounts: Int32Array
  yCounts: Int32Array
}

export function findLines(
  imageData: ImageData,
  { minimumConsecutivePixels = 100 } = {}
): FindLinesResult {
  const { width, height, data } = imageData
  const channels = getImageChannelCount(imageData)
  const xCounts = new Int32Array(height)
  const yCounts = new Int32Array(width)

  for (let y = 0; y < height; y++) {
    let xCount = 0
    let streak = 0
    let yMaximumConsecutivePixels = 0
    for (let x = 0; x < width; x++) {
      if (data[channels * (x + y * width)] === PIXEL_BLACK) {
        xCount++
        streak += 1
      } else {
        if (streak > 1) {
          xCount += streak
        }
        if (streak > yMaximumConsecutivePixels) {
          yMaximumConsecutivePixels = streak
        }
        streak = 0
      }
    }
    if (streak > 1) {
      xCount += streak
    }
    if (streak > yMaximumConsecutivePixels) {
      yMaximumConsecutivePixels = streak
    }
    xCounts[y] =
      yMaximumConsecutivePixels >= minimumConsecutivePixels
        ? xCount * yMaximumConsecutivePixels
        : 0
  }

  for (let x = 0; x < width; x++) {
    let yCount = 0
    let streak = 0
    let xMaximumConsecutivePixels = 0
    for (let y = 0; y < height; y++) {
      if (data[channels * (x + y * width)] === PIXEL_BLACK) {
        yCount++
        streak += 1
      } else {
        if (streak > 1) {
          yCount += streak
        }
        if (streak > xMaximumConsecutivePixels) {
          xMaximumConsecutivePixels = streak
        }
        streak = 0
      }
    }
    if (streak > 1) {
      yCount += streak
    }
    if (streak > xMaximumConsecutivePixels) {
      xMaximumConsecutivePixels = streak
    }
    yCounts[x] =
      xMaximumConsecutivePixels >= minimumConsecutivePixels ? yCount : 0
  }

  return { xCounts, yCounts }
}
