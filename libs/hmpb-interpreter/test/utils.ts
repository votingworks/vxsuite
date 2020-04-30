import { createCanvas, createImageData } from 'canvas'
import { promises as fs } from 'fs'
import { Rect } from '../src/types'
import { toRGBA } from '../src/utils/convert'
import { randomBytes } from 'crypto'

export function randomImage({
  width = 0,
  height = 0,
  minWidth = 1,
  maxWidth = 10,
  minHeight = 1,
  maxHeight = 10,
  channels = 4,
} = {}): ImageData {
  if (!width) {
    width = (minWidth + Math.random() * (maxWidth - minWidth + 1)) | 0
  }
  if (!height) {
    height = (minHeight + Math.random() * (maxHeight - minHeight + 1)) | 0
  }
  const data = new Uint8ClampedArray(randomBytes(width * height * channels))
  return createImageData(data, width, height)
}

export function randomInset(
  rect: Rect,
  { min = 0, max = Math.min(rect.width, rect.height) } = {}
): Rect {
  const leftInset =
    Math.max(min, Math.min(max, rect.width / 2 - 1, randomInt(min, max))) | 0
  const rightInset =
    Math.max(min, Math.min(max, rect.width / 2 - 1, randomInt(min, max))) | 0
  const topInset =
    Math.max(min, Math.min(max, rect.height / 2 - 1, randomInt(min, max))) | 0
  const bottomInset =
    Math.max(min, Math.min(max, rect.width / 2 - 1, randomInt(min, max))) | 0

  return {
    x: rect.x + leftInset,
    y: rect.y + topInset,
    width: rect.width - leftInset - rightInset,
    height: rect.height - topInset - bottomInset,
  }
}

export function randomInt(min: number, max: number): number {
  return (min + Math.random() * (max - min + 1)) | 0
}

export async function writeImageToFile(
  imageData: ImageData,
  filePath: string,
  bounds?: Rect
): Promise<void> {
  const canvas = createCanvas(
    bounds?.width ?? imageData.width,
    bounds?.height ?? imageData.height
  )
  const context = canvas.getContext('2d')
  context.putImageData(toRGBA(imageData), -(bounds?.x ?? 0), -(bounds?.y ?? 0))
  await fs.writeFile(filePath, canvas.toBuffer())
}
