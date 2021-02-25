import { createCanvas, createImageData, Image, loadImage } from 'canvas'
// import { resize } from '@votingworks/image-utils'
import * as fs from 'fs'
import { performance } from 'perf_hooks'
// import resize from 'resize-image-data'
import { Point, Size } from '../types'

function ensureImageData(imageData: ImageData): ImageData {
  return createImageData(imageData.data, imageData.width, imageData.height)
}

export async function loadImageData(path: string): Promise<ImageData>
export async function loadImageData(data: Buffer): Promise<ImageData>
export async function loadImageData(
  pathOrData: string | Buffer
): Promise<ImageData> {
  const img = await loadImage(pathOrData)
  const canvas = createCanvas(img.width, img.height)
  const context = canvas.getContext('2d')
  context.drawImage(img, 0, 0)
  return context.getImageData(0, 0, img.width, img.height)
}

export async function toPNG(imageData: ImageData): Promise<Buffer> {
  const canvas = createCanvas(imageData.width, imageData.height)
  const context = canvas.getContext('2d')
  context.putImageData(ensureImageData(imageData), 0, 0)
  return canvas.toBuffer()
}

export function resample(imageData: ImageData, size: Size): ImageData {
  performance.mark('resample start')
  if (imageData.width === size.width && imageData.height === size.height) {
    return imageData
  }

  // const resampled = createImageData(size.width, size.height)
  // const resampled = resize(imageData, size.width, size.height)
  const resampled = canvas()
    .drawImage(imageData, 0, 0, size.width, size.height)
    .render()
  performance.mark('resample end')
  performance.measure('resample', 'resample start', 'resample end')
  return resampled
}

function interpolate(
  k: number,
  kMin: number,
  kMax: number,
  vMin: number,
  vMax: number
) {
  return Math.round((k - kMin) * vMax + (kMax - k) * vMin)
}

function interpolateHorizontal(
  src: ImageData,
  offset: number,
  x: number,
  y: number,
  xMin: number,
  xMax: number
) {
  const vMin = src.data[(y * src.width + xMin) * 4 + offset]
  if (xMin === xMax) return vMin

  const vMax = src.data[(y * src.width + xMax) * 4 + offset]
  return interpolate(x, xMin, xMax, vMin, vMax)
}

function interpolateVertical(
  src: ImageData,
  offset: number,
  x: number,
  xMin: number,
  xMax: number,
  y: number,
  yMin: number,
  yMax: number
) {
  const vMin = interpolateHorizontal(src, offset, x, yMin, xMin, xMax)
  if (yMin === yMax) return vMin

  const vMax = interpolateHorizontal(src, offset, x, yMax, xMin, xMax)
  return interpolate(y, yMin, yMax, vMin, vMax)
}

function bilinearInterpolation(src: ImageData, dst: ImageData) {
  let pos = 0

  for (let y = 0; y < dst.height; y++) {
    for (let x = 0; x < dst.width; x++) {
      const srcX = (x * src.width) / dst.width
      const srcY = (y * src.height) / dst.height

      const xMin = Math.floor(srcX)
      const yMin = Math.floor(srcY)

      const xMax = Math.min(Math.ceil(srcX), src.width - 1)
      const yMax = Math.min(Math.ceil(srcY), src.height - 1)

      dst.data[pos++] = interpolateVertical(
        src,
        0,
        srcX,
        xMin,
        xMax,
        srcY,
        yMin,
        yMax
      ) // R
      dst.data[pos++] = interpolateVertical(
        src,
        1,
        srcX,
        xMin,
        xMax,
        srcY,
        yMin,
        yMax
      ) // G
      dst.data[pos++] = interpolateVertical(
        src,
        2,
        srcX,
        xMin,
        xMax,
        srcY,
        yMin,
        yMax
      ) // B
      dst.data[pos++] = interpolateVertical(
        src,
        3,
        srcX,
        xMin,
        xMax,
        srcY,
        yMin,
        yMax
      ) // A
    }
  }
}

export function myResize(
  imageData: ImageData,
  width: number,
  height: number
): ImageData {
  const dst = createImageData(width, height)
  bilinearInterpolation(imageData, dst)
  return dst
}

type Operation =
  | {
      type: 'line'
      x1: number
      y1: number
      x2: number
      y2: number
      stroke?: number
      color?: string
      dash?: readonly number[]
    }
  | {
      type: 'rect'
      x: number
      y: number
      width: number
      height: number
      stroke?: number
      color?: string
    }
  | {
      type: 'image'
      image: Image | ImageData
      x: number
      y: number
      width: number
      height: number
    }
  | {
      type: 'text'
      text: string
      x: number
      y: number
      width?: number
      height?: number
      stroke?: number
      color?: string
    }

export class QuickCanvas {
  private readonly ops: Operation[] = []
  private width?: number
  private height?: number
  private bg: string | ImageData = 'white'

  public size(width: number, height: number): this {
    this.width = width
    this.height = height
    return this
  }

  public background(color: string): this
  public background(imageData: ImageData): this
  public background(bg: string | ImageData): this {
    this.bg = bg
    return this
  }

  public drawImage(image: ImageData | Image, x: number, y: number): this
  public drawImage(
    image: ImageData | Image,
    x: number,
    y: number,
    width: number,
    height: number
  ): this
  public drawImage(
    image: ImageData | Image,
    x: number,
    y: number,
    width = image.width,
    height = image.height
  ): this {
    this.ops.push({ type: 'image', image, x, y, width, height })
    return this
  }

  public line(
    from: Point,
    to: Point,
    {
      stroke,
      color,
      dash,
    }: { stroke?: number; color?: string; dash?: readonly number[] } = {}
  ): this {
    this.ops.push({
      type: 'line',
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
      stroke,
      color,
      dash,
    })
    return this
  }

  public text(
    text: string,
    x: number,
    y: number,
    {
      stroke,
      color,
      width,
      height,
    }: {
      stroke?: number
      color?: string

      width?: number
      height?: number
    } = {}
  ): this {
    this.ops.push({ type: 'text', text, x, y, width, height, stroke, color })
    return this
  }

  public rect(
    x: number,
    y: number,
    width: number,
    height: number,
    { stroke, color }: { stroke?: number; color?: string } = {}
  ): this {
    this.ops.push({ type: 'rect', x, y, width, height, stroke, color })
    return this
  }

  public tap(callback: (canvas: this) => void): this {
    callback(this)
    return this
  }

  private getSize(): Size {
    let { width, height } = this

    if (width && height) {
      return { width, height }
    }

    if (this.bg && typeof this.bg !== 'string') {
      width = this.bg.width
      height = this.bg.height
    }

    width ??= 1
    height ??= 1

    for (const op of this.ops) {
      switch (op.type) {
        case 'image':
          width = Math.max(width, op.width)
          height = Math.max(height, op.height)
          break

        case 'line':
          width = Math.max(width, op.x1 + 1, op.x2 + 1)
          height = Math.max(height, op.y1 + 1, op.y2 + 1)
          break

        case 'rect':
          width = Math.max(width, op.x + op.width)
          height = Math.max(height, op.y + op.height)
          break

        case 'text':
          width = Math.max(width, op.x + (op.width ?? 0))
          height = Math.max(height, op.y + (op.height ?? 0))
          break
      }
    }

    return { width: Math.ceil(width), height: Math.ceil(height) }
  }

  public render(): ImageData
  public render(path: string): void
  public render(path?: string): ImageData | void {
    const { width, height } = this.getSize()
    const canvas = createCanvas(width, height)
    const context = canvas.getContext('2d')

    if (typeof this.bg === 'string') {
      context.fillStyle = this.bg
      context.fillRect(0, 0, width, height)
    } else if (this.bg) {
      context.putImageData(
        createImageData(this.bg.data, this.bg.width, this.bg.height),
        0,
        0
      )
    }

    for (const op of this.ops) {
      if (op.type === 'image') {
        if (op.image instanceof Image) {
          context.drawImage(op.image, op.x, op.y, op.width, op.height)
        } else if (
          op.width === op.image.width &&
          op.height === op.image.height
        ) {
          context.putImageData(op.image, op.x, op.y)
        } else {
          context.drawImage(toImage(op.image), op.x, op.y, op.width, op.height)
        }
      } else {
        context.fillStyle = op.color ?? 'black'
        context.strokeStyle = op.color ?? 'black'
        context.lineWidth = op.stroke ?? 4

        switch (op.type) {
          case 'line':
            context.beginPath()
            context.setLineDash([...(op.dash ?? [])])
            context.moveTo(op.x1, op.y1)
            context.lineTo(op.x2, op.y2)
            context.stroke()
            break

          case 'rect':
            context.strokeRect(op.x, op.y, op.width, op.height)
            break

          case 'text':
            context.fillText(op.text, op.x, op.y)
            break
        }
      }
    }

    if (path) {
      fs.writeFileSync(path, canvas.toBuffer())
    } else {
      return context.getImageData(0, 0, canvas.width, canvas.height)
    }
  }
}

export function canvas(): QuickCanvas {
  return new QuickCanvas()
}

function toImage(imageData: ImageData): Image {
  const canvas = createCanvas(imageData.width, imageData.height)
  const context = canvas.getContext('2d')
  context.putImageData(
    createImageData(imageData.data, imageData.width, imageData.height),
    0,
    0
  )
  const image = new Image()
  image.src = canvas.toBuffer()
  return image
}

export interface ImageDebug {
  (name: string): QuickCanvas
  render(): void
}

export function imdebug(basePath: string): ImageDebug {
  let nextId = 1
  const canvases: [number, string, QuickCanvas][] = []
  const imdebug = (name: string) => {
    const c = canvas()
    canvases.push([nextId++, name, c])
    return c
  }
  imdebug.render = () => {
    for (const [id, name, canvas] of canvases) {
      canvas.render(
        `${basePath}-debug${id.toString().padStart(2, '0')}-${name
          .replace(/[^-a-z0-9]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '')}.png`
      )
    }
    canvases.length = 0
  }
  return imdebug
}
