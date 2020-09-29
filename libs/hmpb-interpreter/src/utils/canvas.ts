const RGBA_CHANNEL_COUNT = 4

export function createImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number
): ImageData
export function createImageData(width: number, height: number): ImageData
export function createImageData(...args: unknown[]): ImageData {
  let data: Uint8ClampedArray
  let width: number
  let height: number

  if (
    args.length === 2 &&
    typeof args[0] === 'number' &&
    typeof args[1] === 'number'
  ) {
    ;[width, height] = args
    data = new Uint8ClampedArray(width * height * RGBA_CHANNEL_COUNT)
  } else if (
    args.length === 3 &&
    args[0] instanceof Uint8ClampedArray &&
    typeof args[1] === 'number' &&
    typeof args[2] === 'number'
  ) {
    ;[data, width, height] = args
  } else {
    throw new TypeError('unexpected arguments given to createImageData')
  }

  return { data, width, height }
}
