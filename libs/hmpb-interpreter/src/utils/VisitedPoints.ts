export class VisitedPoints {
  private data: Uint8Array[]

  constructor(private width: number, height: number) {
    this.data = Array.from({ length: height })
  }

  add(x: number, y: number, value = true): boolean {
    let row = this.data[y]

    if (!row) {
      if (!value) {
        return false
      }

      row = new Uint8Array(this.width)
      this.data[y] = row
    }

    const result = (row[x] === 0) === value
    row[x] = value ? 1 : 0
    return result
  }

  has(x: number, y: number): boolean {
    return this.data[y]?.[x] === 1
  }
}
