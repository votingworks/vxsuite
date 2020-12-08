import { Edge, Edges } from '../hmpb/shapes'
import { Point, Rect } from '../types'
import { PIXEL_BLACK } from './binarize'
import { lineSegmentPixels } from './geometry'
import { getImageChannelCount } from './imageFormatUtils'

export function findInsetEdges(imageData: ImageData, bounds: Rect): Edges {
  const { width, height, data } = imageData
  const left: Edge = new Int32Array(height).fill(width)
  const top: Edge = new Int32Array(width).fill(height)
  const right: Edge = new Int32Array(height).fill(-1)
  const bottom: Edge = new Int32Array(width).fill(-1)
  const channels = getImageChannelCount(imageData)

  for (let xOffset = 0; xOffset < bounds.width; xOffset++) {
    const x = bounds.x + xOffset

    for (let yOffset = 0; yOffset < bounds.height; yOffset++) {
      const y = bounds.y + yOffset
      if (data[channels * (x + y * width)] === PIXEL_BLACK) {
        top[x] = y
        break
      }
    }

    for (let yOffset = bounds.height - 1; yOffset >= 0; yOffset--) {
      const y = bounds.y + yOffset
      if (data[channels * (x + y * width)] === PIXEL_BLACK) {
        bottom[x] = y
        break
      }
    }
  }

  for (let yOffset = 0; yOffset < bounds.height; yOffset++) {
    const y = bounds.y + yOffset

    for (let xOffset = 0; xOffset < bounds.width; xOffset++) {
      const x = bounds.x + xOffset
      if (data[channels * (x + y * width)] === PIXEL_BLACK) {
        left[y] = x
        break
      }
    }

    for (let xOffset = bounds.width - 1; xOffset >= 0; xOffset--) {
      const x = bounds.x + xOffset
      if (data[channels * (x + y * width)] === PIXEL_BLACK) {
        right[y] = x
        break
      }
    }
  }

  return { left, top, right, bottom }
}

export function findEdgeWithin(
  imageData: ImageData,
  rects: readonly Rect[],
  edge: 'top' | 'left' | 'right' | 'bottom'
): Edge {
  const result = new Int32Array(
    edge === 'top' || edge === 'bottom' ? imageData.width : imageData.height
  ).fill(
    edge === 'left' ? imageData.width : edge === 'top' ? imageData.height : -1
  )
  const channels = getImageChannelCount(imageData)
  const { data, width } = imageData

  for (const rect of rects) {
    const left = rect.x
    const right = rect.x + rect.width - 1
    const top = rect.y
    const bottom = rect.y + rect.height - 1

    for (const outside of lineSegmentPixels(
      {
        x: edge === 'right' ? right : left,
        y: edge === 'bottom' ? bottom : top,
      },
      {
        x: edge === 'left' ? left : right,
        y: edge === 'top' ? top : bottom,
      }
    )) {
      const inside: Point = {
        x: edge === 'left' ? right : edge === 'right' ? left : outside.x,
        y: edge === 'top' ? bottom : edge === 'bottom' ? top : outside.y,
      }
      for (const { x, y } of lineSegmentPixels(outside, inside)) {
        if (data[channels * (x + y * width)] === PIXEL_BLACK) {
          result[edge === 'top' || edge === 'bottom' ? x : y] =
            edge === 'top' || edge === 'bottom' ? y : x
          break
        }
      }
    }
  }

  return result
}
