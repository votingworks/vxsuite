export interface LineSegment {
  x1: number
  x2: number
  y1: number
  y2: number
  width: number
}

export default function lsd(imageData: ImageData): LineSegment[]
