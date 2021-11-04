# Disallows public class fields. (`vx/gts-no-public-class-fields`)

This rule is derived from
[Google TypeScript Style Guide section "Class Members"](https://google.github.io/styleguide/tsguide.html#use-readonly):

> Mark properties that are never reassigned outside of the constructor with the
> readonly modifier (these need not be deeply immutable).

This rule doesn't actually enforce the rule from GTS, but in combination with
`@typescript-eslint/prefer-readonly` it effectively does.

## Rule Details

Examples of **incorrect** code for this rule:

```ts
class Box<T> {
  value?: T;

  constructor(value: T) {
    this.value = value;
  }
}
```

Examples of **correct** code for this rule:

```ts
class Box<T> {
  constructor(private value: T) {}

  get(): T {
    return value;
  }

  set(newValue: T) {
    this.value = newValue;
  }
}
```
