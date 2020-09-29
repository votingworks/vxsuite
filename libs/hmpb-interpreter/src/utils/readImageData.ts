import sharp from 'sharp'

export async function readImageData(fileData: Buffer): Promise<ImageData>
export async function readImageData(filePath: string): Promise<ImageData>
export async function readImageData(
  filePathOrData: string | Buffer
): Promise<ImageData> {
  const img = await sharp(filePathOrData)
    .raw()
    .ensureAlpha()
    .toBuffer({ resolveWithObject: true })
  return {
    data: Uint8ClampedArray.from(img.data),
    width: img.info.width,
    height: img.info.height,
  }
}
