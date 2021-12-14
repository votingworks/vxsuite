import { transformSync } from '@babel/core';
import plugin from './safe_parse_helpers';

function check(input: string, output: string): void {
  expect(
    transformSync(input, {
      plugins: [plugin],
      parserOpts: { plugins: ['jsx', 'typescript'] },
    })?.code
  ).toEqual(output.trim());
}

test('transforms to unsafeParse', () => {
  check(
    `safeParse(Parser, value).unsafeUnwrap();`,
    `unsafeParse(Parser, value);`
  );
});

test('transforms to unsafeParse with imports', () => {
  check(
    [
      `import { safeParse, Translations } from '@votingworks/types';`,
      `safeParse(Parser, value).unsafeUnwrap();`,
    ].join('\n'),
    [
      `import { Translations, unsafeParse } from '@votingworks/types';`,
      `unsafeParse(Parser, value);`,
    ].join('\n')
  );
});

test('does not add duplicate imports', () => {
  check(
    [
      `import { safeParse, unsafeParse } from '@votingworks/types';`,
      `safeParse(Parser, value).unsafeUnwrap();`,
    ].join('\n'),
    [
      `import { unsafeParse } from '@votingworks/types';`,
      `unsafeParse(Parser, value);`,
    ].join('\n')
  );

  check(
    [
      `import { safeParse } from '@votingworks/types';`,
      `safeParse(Parser, value).unsafeUnwrap();`,
      `safeParse(Parser, value).unsafeUnwrap();`,
    ].join('\n'),
    [
      `import { unsafeParse } from '@votingworks/types';`,
      `unsafeParse(Parser, value);`,
      `unsafeParse(Parser, value);`,
    ].join('\n')
  );
});

test('ignores malformed safeParse call', () => {
  check(
    `safeParse(Parser).unsafeUnwrap();`,
    `safeParse(Parser).unsafeUnwrap();`
  );
});

test('ignores malformed unsafeUnwrap call', () => {
  check(
    `safeParse(Parser, value).unsafeUnwrap(arg);`,
    `safeParse(Parser, value).unsafeUnwrap(arg);`
  );
});

test('transforms to maybeParse', () => {
  check(`safeParse(Parser, value).ok();`, `maybeParse(Parser, value);`);
});

test('transforms to maybeParse with imports', () => {
  check(
    [
      `import { safeParse } from '@votingworks/types';`,
      `safeParse(Parser, value).ok();`,
    ].join('\n'),
    [
      `import { maybeParse } from '@votingworks/types';`,
      `maybeParse(Parser, value);`,
    ].join('\n')
  );
});

test('ignores other safeParse uses', () => {
  check(`safeParse(Parser, value).err();`, `safeParse(Parser, value).err();`);
});

test('ignores malformed safeParse call', () => {
  check(`safeParse(Parser).ok();`, `safeParse(Parser).ok();`);
});

test('ignores malformed ok call', () => {
  check(
    `safeParse(Parser, value).ok(arg);`,
    `safeParse(Parser, value).ok(arg);`
  );
});
