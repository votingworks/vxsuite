import { createCanvas } from 'canvas'
import { Rect } from '../../types'

export default function crop(imageData: ImageData, bounds: Rect): ImageData {
  const canvas = createCanvas(bounds.width, bounds.height)
  const context = canvas.getContext('2d')
  context.putImageData(imageData, -bounds.x, -bounds.y)
  return context.getImageData(0, 0, bounds.width, bounds.height)
}
