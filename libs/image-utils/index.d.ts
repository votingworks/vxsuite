export function resize(src: ImageData, dst: ImageData): void
export function grayscale(src: ImageData, dst: ImageData, options?: { background: number }): void
export function assertImageData(imageData: unknown): asserts imageData is ImageData
export function getChannelCount(imageData: ImageData): number
