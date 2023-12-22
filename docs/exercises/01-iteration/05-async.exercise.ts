// 04-async.ts
//
// Task: Complete the `countNonBlankLines` function using `lines` to count the
// number of non-blank lines in the the file at a given path.
//
// Note: `lines` returns an `AsyncIterablePlus<string>`, which is an async
// iterable. You can use the same set of methods on the async version as with
// the sync version, but they return and accept promises instead of values.

import { lines } from '@votingworks/basics';
import { readFile } from 'fs/promises';
import { TODO } from '../src/todo';
import { run } from '../src/example';

async function countNonBlankLines(path: string): Promise<number> {
  TODO();
}

async function countNonBlankLinesReference(path: string): Promise<number> {
  return (await readFile(path, 'utf8'))
    .split('\n')
    .filter((line) => line.trim() !== '').length;
}

run({
  makeInput: () => __filename,
  referenceImplementation: countNonBlankLinesReference,
  exerciseImplementation: countNonBlankLines,
  solutionImplementation: countNonBlankLinesSolution,
});

// Scroll down for solutions. ↓
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
// Solutions ↓

import { createReadStream } from 'fs';

async function countNonBlankLinesSolution(path: string): Promise<number> {
  return lines(createReadStream(path, 'utf8'))
    .filter((line) => line.trim() !== '')
    .count();
}
