# Disallows use of `const enum`; use `enum` instead. (`vx/gts-no-const-enum`)

This rule is from
[Google TypeScript Style Guide section "Enums"](https://google.github.io/styleguide/tsguide.html#enums):

> Always use `enum` and not `const enum`. TypeScript enums already cannot be
> mutated; `const enum` is a separate language feature related to optimization
> that makes the `enum` invisible to JavaScript users of the module.

## Rule Details

Examples of **incorrect** code for this rule:

```ts
const enum BallotType {
  Standard = 0,
  Absentee = 1,
}
```

Examples of **correct** code for this rule:

```ts
enum BallotType {
  Standard = 0,
  Absentee = 1,
}
```
