import { strict as assert } from 'assert'

export type InPlaceImageTransform<A extends unknown[], R> = (
  srcImageData: ImageData,
  dstImageData?: ImageData,
  ...args: A
) => R

export function makeInPlaceImageTransform<A extends unknown[], R>(
  gray: InPlaceImageTransform<A, R>,
  rgba: InPlaceImageTransform<A, R>
): InPlaceImageTransform<A, R> {
  return (srcImageData: ImageData, dstImageData?: ImageData, ...args: A): R => {
    const channels =
      srcImageData.data.length / (srcImageData.width * srcImageData.height)

    switch (channels) {
      case 1:
        return gray(srcImageData, dstImageData, ...args)

      case 4:
        return rgba(srcImageData, dstImageData, ...args)

      default:
        throw new Error(`unexpected ${channels}-channel image`)
    }
  }
}

export type ImageTransform<A extends unknown[], R> = (
  imageData: ImageData,
  ...args: A
) => R

export function makeImageTransform<A extends unknown[], R>(
  gray: ImageTransform<A, R>,
  rgba: ImageTransform<A, R>
): ImageTransform<A, R> {
  return (imageData: ImageData, ...args: A): R => {
    const channels =
      imageData.data.length / (imageData.width * imageData.height)

    switch (channels) {
      case 1:
        return gray(imageData, ...args)

      case 4:
        return rgba(imageData, ...args)

      default:
        throw new Error(`unexpected ${channels}-channel image`)
    }
  }
}

export function assertRGBAImage(imageData: ImageData): void {
  assert.equal(
    imageData.data.length,
    imageData.width * imageData.height * 4,
    'expected 4-channel RGBA image'
  )
}

export function assertGrayscaleImage(imageData: ImageData): void {
  assert.equal(
    imageData.data.length,
    imageData.width * imageData.height,
    'expected 1-channel grayscale image'
  )
}

export function assertRGBAOrGrayscaleImage(imageData: ImageData): void {
  if (!isRGBA(imageData) && !isGrayscale(imageData)) {
    assert.fail('expected 1-channel grayscale or 4-channel RGBA image')
  }
}

export function assertImageChannelsMatch(
  imageData1: ImageData,
  imageData2: ImageData
): void {
  assert.equal(
    getImageChannelCount(imageData1),
    getImageChannelCount(imageData2),
    'expected images to have the same number of channels'
  )
}

export function assertImageSizesMatch(
  imageData1: ImageData,
  imageData2: ImageData
): void {
  assert.deepEqual(
    { width: imageData1.width, height: imageData1.height },
    { width: imageData2.width, height: imageData2.height },
    'expected source and destination image sizes to be equal'
  )
}

export function getImageChannelCount(imageData: ImageData): number {
  return imageData.data.length / (imageData.width * imageData.height)
}

export function isGrayscale(imageData: ImageData): boolean {
  return getImageChannelCount(imageData) === 1
}

export function isRGBA(imageData: ImageData): boolean {
  return getImageChannelCount(imageData) === 4
}
