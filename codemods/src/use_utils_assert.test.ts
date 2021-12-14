import { transformSync } from '@babel/core';
import plugin from './use_utils_assert';

function check(input: string, output: string): void {
  expect(
    transformSync(input, {
      plugins: [plugin],
      parserOpts: { plugins: ['jsx', 'typescript'] },
    })?.code
  ).toEqual(output.trim());
}

test('handles default export', () => {
  check(
    `
import assert from "assert";
`,
    `
import { assert } from "@votingworks/utils";
`
  );
});

test('renames non-assert default export binding', () => {
  check(
    `
import ok from "assert";
ok(true);
`,
    `
import { assert } from "@votingworks/utils";
assert(true);
`
  );
});

test('ignores default export helpers', () => {
  check(
    `
import assert from "assert";
assert.ok(true);
`,
    `
import assert from "assert";
assert.ok(true);
`
  );
});

test('ignores non-ok named export helpers', () => {
  check(
    `
import { strictEqual } from "assert";
strictEqual(true, true);
`,
    `
import { strictEqual } from "assert";
strictEqual(true, true);
`
  );
});

test('ignores non-ok namespace export helpers', () => {
  check(
    `
import { strict as assert } from "assert";
assert.equal(true, true);
`,
    `
import { strict as assert } from "assert";
assert.equal(true, true);
`
  );
});

test('ignores namespace imports', () => {
  check(
    `
import * as assert from "assert";
assert;
`,
    `
import * as assert from "assert";
assert;
`
  );
});

test('handles ok named export helper', () => {
  check(
    `
import { ok } from "assert";
ok(true);
`,
    `
import { assert } from "@votingworks/utils";
assert(true);
`
  );
});

test('handles mix and match', () => {
  check(
    `
import assert, { ok, strict } from "assert";
assert(true);
ok(true);
strict(true);
`,
    `
import { assert } from "@votingworks/utils";
assert(true);
assert(true);
assert(true);
`
  );
});

test('ignores unused import specifiers', () => {
  check(
    `
import { ok } from "assert";
`,
    `
import { assert } from "@votingworks/utils";
`
  );
});

test('adds to an existing import', () => {
  check(
    `
import { foo } from "@votingworks/utils";
import assert, { ok, strict } from "assert";
assert(true);
ok(true);
strict(true);
`,
    `
import { assert, foo } from "@votingworks/utils";
assert(true);
assert(true);
assert(true);
`
  );
});
