# Use `Array.from` instead of spread `...` for mapping over iterables (vx/use-array-from-with-map)

This rule enforces Airbnb's JavaScript Style Guide section 4.5:

> Use `Array.from` instead of spread `...` for mapping over iterables, because
> it avoids creating an intermediate array.

## Rule Details

Examples of **incorrect** code for this rule:

```ts
const baz = [...foo].map(bar)
```

Examples of **correct** code for this rule:

```ts
const baz = Array.from(foo, bar)
```
