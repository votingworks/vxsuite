# Disallows use of private fields aka private identifiers (`vx/gts-no-private-fields`)

This rule is from
[Google TypeScript Style Guide section "No `#private` fields"](https://google.github.io/styleguide/tsguide.html#private-fields):

> Private identifiers cause substantial emit size and performance regressions
> when down-leveled by TypeScript, and are unsupported before ES2015. They can
> only be downleveled to ES2015, not lower. At the same time, they do not offer
> substantial benefits when static type checking is used to enforce visibility.

## Rule Details

Examples of **incorrect** code for this rule:

```ts
class Clazz {
  #ident = 1
}
```

Examples of **correct** code for this rule:

```ts
class Clazz {
  private ident = 1
}
```
