export interface LineSegment {
  x1: number
  x2: number
  y1: number
  y2: number
  width: number
}

declare function lsd(imageData: ImageData): LineSegment[]

export = lsd