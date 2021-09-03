# Disallows using the `Array` constructor. (`vx/gts-no-array-constructor`)

This rule is from
[Google TypeScript Style Guide section "Array Constructor"](https://google.github.io/styleguide/tsguide.html#array-constructor):

> TypeScript code must not use the `Array()` constructor, with or without `new`.
> It has confusing and contradictory usage.

## Rule Details

Examples of **incorrect** code for this rule:

```ts
const a = new Array(2) // [undefined, undefined]
const b = new Array(2, 3) // [2, 3];
```

Examples of **correct** code for this rule:

```ts
const a = [2]
const b = [2, 3]

// Equivalent to Array(2):
const c = []
c.length = 2

// Equivalent to Array(5).fill(0), i.e. [0, 0, 0, 0, 0]:
Array.from<number>({ length: 5 }).fill(0)

// Equivalent to Array<Uint8>(1, 2, 3):
const d = Array.of<Uint8>(1, 2, 3)
```
