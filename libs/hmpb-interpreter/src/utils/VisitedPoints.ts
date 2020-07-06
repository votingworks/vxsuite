export class VisitedPoints {
  private data: Uint8Array[]

  public constructor(private width: number, private height: number) {
    this.data = new Array(height)
  }

  public add(x: number, y: number, value = true): boolean {
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

  public has(x: number, y: number): boolean {
    return this.data[y]?.[x] === 1
  }
}
