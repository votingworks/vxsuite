import { Debugger, imageDebugger } from '@votingworks/image-utils';
import { Size } from '../src/types';

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

function getCurrentTestPath(): string {
  const { testPath, currentTestName } = expect.getState();
  return `${testPath}-debug-${currentTestName.replace(/[^-_\w]+/g, '-')}`;
}

/**
 * Gets a file name for the current test.
 */
export function getDebugImageForCurrentTest(): string {
  const fileNameRoot = getCurrentTestPath();
  return `${fileNameRoot}.png`;
}

/**
 * Returns an image debugger for the current test.
 */
export function testImageDebugger(baseImage: ImageData): Debugger;
/**
 * Returns an image debugger for the current test.
 */
export function testImageDebugger(size: Size): Debugger;
/**
 * Returns an image debugger for the current test.
 */
export function testImageDebugger(baseImageOrSize: ImageData | Size): Debugger {
  return imageDebugger(getCurrentTestPath(), baseImageOrSize);
}
