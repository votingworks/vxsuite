# Disallow manual sleep implementations (`vx/no-manual-sleep`)

Constructing a sleep promise manually via
`new Promise((resolve) => setTimeout(resolve, ms))` is verbose and easy to get
wrong. Use `sleep` from `@votingworks/basics` instead, which is clearer and
easier to grep for.

## Rule Details

Examples of **incorrect** code for this rule:

```ts
await new Promise((resolve) => setTimeout(resolve, 100));
await new Promise((resolve) => {
  setTimeout(resolve, 100);
});
new Promise(function (resolve) {
  setTimeout(resolve, ms);
});
```

Examples of **correct** code for this rule:

```ts
import { sleep } from '@votingworks/basics';

await sleep(100);
await sleep(ms);
```

## Suggestions

This rule provides a suggestion (not an autofix) to replace the pattern with
`sleep(duration)`. It is not an autofix because the `import` statement cannot be
added automatically.
