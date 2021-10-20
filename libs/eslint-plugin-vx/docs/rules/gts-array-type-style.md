# Recommends using short form T[] for simple array types and long form Array<T> for complex array types (`vx/gts-array-type-style`)

This rule is from
[Google TypeScript Style Guide section "Array<T> Type"](https://google.github.io/styleguide/tsguide.html#arrayt-type):

> For simple types (containing just alphanumeric characters and dot), use the syntax sugar for arrays, T[], rather than the longer form Array<T>.
> For anything more complex, use the longer form Array<T>.
> This also applies for readonly T[] vs ReadonlyArray<T>.

## Rule Details

Examples of **incorrect** code for this rule:

```ts
const f: Array<string>;
const g: ReadonlyArray<string>;
const h: {n: number, s: string}[];
const i: (string|number)[];
const j: readonly (string|number)[];
```

Examples of **correct** code for this rule:

```ts
const a: string[];
const b: readonly string[];
const c: ns.MyObj[];
const d: Array<string|number>;
const e: ReadonlyArray<string|number>;
```
