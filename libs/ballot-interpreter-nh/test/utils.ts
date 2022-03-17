/**
 * Minimal information about an oval position.
 */
export interface Oval {
  readonly column: number;
  readonly row: number;
}

/**
 * Creates an ASCII art representation of the oval grid.
 */
export function asciiOvalGrid(ovals: Iterable<Oval>): string {
  const allOvals = [...ovals];
  const maxColumn = allOvals.reduce(
    (max, oval) => Math.max(max, oval.column),
    0
  );
  const maxRow = allOvals.reduce((max, oval) => Math.max(max, oval.row), 0);

  let result = '';
  for (let row = 0; row <= maxRow; row += 1) {
    for (let column = 0; column <= maxColumn; column += 1) {
      const oval = allOvals.find((o) => o.column === column && o.row === row);
      if (oval) {
        result += 'O';
      } else {
        result += ' ';
      }
    }
    result += '\n';
  }
  return result;
}
