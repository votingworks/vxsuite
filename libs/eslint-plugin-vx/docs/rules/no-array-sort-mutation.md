# Requires `sort` be called on array copies (`vx/no-array-sort-mutation`)

`Array#sort` mutates the array it is called on. This is easy to forget, and can
sometimes cause bugs by mutating a shared data structure that is supposed to be
read-only. This rule prevents some incorrect uses of `sort`, but can't flag
every incorrect use. Care must still be taken.

## Rule Details

Examples of **incorrect** code for this rule:

```ts
arr.sort()
arr.prop.sort()
arrs[0].sort()
```

Examples of **correct** code for this rule:

```ts
// preferred array-copy technique
;[...arr].sort()

// alternative array-copy technique
Array.from(arr.prop).sort()

// non-idiomatic array-copy technique
arrs[0].slice().sort()
```
