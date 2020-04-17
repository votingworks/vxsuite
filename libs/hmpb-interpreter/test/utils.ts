import { createCanvas, loadImage } from 'canvas'
import { promises as fs } from 'fs'
import { Rect } from '../src/types'

export async function readImageData(fileData: Buffer): Promise<ImageData>
export async function readImageData(filePath: string): Promise<ImageData>
export async function readImageData(
  filePathOrData: string | Buffer
): Promise<ImageData> {
  const fileData =
    typeof filePathOrData === 'string'
      ? await fs.readFile(filePathOrData)
      : filePathOrData
  const image = await loadImage(fileData)
  const canvas = createCanvas(image.width, image.height)
  const context = canvas.getContext('2d')
  context.drawImage(image, 0, 0)
  return context.getImageData(0, 0, image.width, image.height)
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
  context.putImageData(imageData, -(bounds?.x ?? 0), -(bounds?.y ?? 0))
  await fs.writeFile(filePath, canvas.toBuffer())
}
