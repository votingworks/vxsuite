import { Debugger, imageDebugger } from '@votingworks/image-utils';
import { Size } from '../src/types';

/**
 * Minimal information about a bubble position.
 */
export interface Bubble {
  readonly column: number;
  readonly row: number;
}

/**
 * Creates an ASCII art representation of the bubble grid.
 */
export function asciiBubbleGrid(bubbles: Iterable<Bubble>): string {
  const allBubbles = [...bubbles];
  const maxColumn = allBubbles.reduce(
    (max, bubble) => Math.max(max, bubble.column),
    0
  );
  const maxRow = allBubbles.reduce(
    (max, bubble) => Math.max(max, bubble.row),
    0
  );

  let result = '';
  for (let row = 0; row <= maxRow; row += 1) {
    for (let column = 0; column <= maxColumn; column += 1) {
      const bubble = allBubbles.find(
        (b) => b.column === column && b.row === row
      );
      if (bubble) {
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
