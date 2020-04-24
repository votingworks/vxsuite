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
