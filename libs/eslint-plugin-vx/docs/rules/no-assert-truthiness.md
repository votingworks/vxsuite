# Forbids truthiness checks in `assert` (vx/no-assert-truthiness)

`assert` can be useful to
[help TypeScript narrow down a type](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-7.html#assertion-functions).
However, coercing values to booleans to check truthiness can lead to bugs. This
rule enforces that the argument to `assert` must be a `boolean` value in cases
likely to cause bugs.

A common use of `assert` is to check that a value is not `undefined` when the
[`@typescript-eslint/no-non-null-assertion`](https://github.com/typescript-eslint/typescript-eslint/blob/master/packages/eslint-plugin/docs/rules/no-non-null-assertion.md)
rule is enabled and disallows the post-fix `!` operator. This rule helps you use
`assert` properly.

## Rule Details

Examples of **incorrect** code for this rule:

```ts
assert(stringValue)
assert(numberValue)
```

Examples of **correct** code for this rule:

```ts
assert(typeof stringValue !== 'undefined')
assert(typeof numberValue !== 'undefined')
```

## Rule Options

```js
...
"vx/no-assert-truthiness": [<enabled>, { "objects": <boolean> }]
...
```

### `objects` (default: `false`)

This rule defaults to allowing truthiness checks for object types, but if you'd
rather they be explicitly converted to a boolean then you should change this
value to `true`.

Examples of **incorrect** code for this rule, when `objects` is `true`:

```ts
assert(objectValue)
```

Examples of **correct** code for this rule, when `objects` is `true`:

```ts
assert(typeof objectValue !== 'undefined')
assert(!!objectValue)
```

### `asserts` (default: `["assert", "ok"]`)

Functions to consider to be assertion functions.
