# Requires type parameters are named appropriately (`vx/gts-type-parameters`)

This rule is from
[Google TypeScript Style Guide section "Identifiers"](https://google.github.io/styleguide/tsguide.html#identifiers):

> Type parameters, like in `Array<T>`, may use a single upper case character
> (`T`) or `UpperCamelCase`.

## Rule Details

Examples of **incorrect** code for this rule:

```ts
type Optional<t> = t | undefined;
type Optional<someType> = someType | undefined;
```

Examples of **correct** code for this rule:

```ts
type Optional<T> = T | undefined;
type Optional<SomeType> = SomeType | undefined;
```
