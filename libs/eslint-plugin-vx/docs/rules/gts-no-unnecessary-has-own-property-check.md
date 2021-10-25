# Flags unnecessary hasOwnProperty checks inside for-of loops (`vx/gts-no-unnecessary-has-own-property-check`)

This rule is a supporting rule for `vx/gts-no-for-in-loop`, which comes from
[Google TypeScript Style Guide section "Iterating objects"](https://google.github.io/styleguide/tsguide.html#iterating-objects):

After running the autofixer for `vx/gts-no-for-in-loop`, which replaces `for-in` loops with `for-of` loops, there may be residual `hasOwnProperty` checks that are inside of `for-of` loops. This rule flags them for manual removal.

## Rule Details

Examples of **incorrect** code for this rule:

```ts
for (const x of Object.keys(obj)) {
    if (obj.hasOwnProperty(x)) {
        ...
    }
}
```

Examples of **correct** code for this rule:

```ts
for (const x of Object.keys(obj)) {
    ...
}
```
