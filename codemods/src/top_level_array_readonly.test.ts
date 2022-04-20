import { transformSync } from '@babel/core';
import plugin from './top_level_array_readonly';

function check(input: string, output: string): void {
  expect(
    transformSync(input, {
      plugins: [plugin],
      parserOpts: { plugins: ['jsx', 'typescript'] },
    })?.code
  ).toEqual(output.trim());
}

test('ignores arrays without a type annotation', () => {
  check(
    `
const a = [1, 2, 3];
`,
    `
const a = [1, 2, 3];
`
  );
});

test('converts top-level `const` arrays to be readonly', () => {
  check(
    `
const a: number[] = [1, 2, 3];
`,
    `
const a: readonly number[] = [1, 2, 3];
`
  );
});

test('converts top-level `const` `Array` to `ReadonlyArray`', () => {
  check(
    `
const a: Array<number> = [1, 2, 3];
`,
    `
const a: ReadonlyArray<number> = [1, 2, 3];
`
  );
});

test('leaves top-level `let` arrays alone', () => {
  check(
    `
let a: number[] = [1, 2, 3];
`,
    `
let a: number[] = [1, 2, 3];
`
  );
});

test('leaves top-level `var` arrays alone', () => {
  check(
    `
var a: number[] = [1, 2, 3];
`,
    `
var a: number[] = [1, 2, 3];
`
  );
});

test('leaves `ReadonlyArray` alone', () => {
  check(
    `
const a: ReadonlyArray<number> = [1, 2, 3];
`,
    `
const a: ReadonlyArray<number> = [1, 2, 3];
`
  );
});
