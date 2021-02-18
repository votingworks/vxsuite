import { createCanvas, createImageData, Image, loadImage } from 'canvas'
import * as fs from 'fs'
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

type Operation =
  | {
      type: 'line'
      x1: number
      y1: number
      x2: number
      y2: number
      stroke?: number
      color?: string
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
    { stroke, color }: { stroke?: number; color?: string } = {}
  ): this {
    this.ops.push({
      type: 'line',
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
      stroke,
      color,
    })
    return this
  }

  public text(
    text: string,
    x: number,
    y: number,
    width?: number,
    height?: number,
    { stroke, color }: { stroke?: number; color?: string } = {}
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
