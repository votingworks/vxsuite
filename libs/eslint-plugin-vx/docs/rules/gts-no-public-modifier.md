# Disallows use of `public` accessibility modifiers on class properties (`vx/gts-no-public-modifiers`)

This rule is from
[Google TypeScript Style Guide section "Visibility"](https://google.github.io/styleguide/tsguide.html#visibility):

> TypeScript symbols are public by default. Never use the `public` modifier
> except when declaring non-readonly public parameter properties (in
> constructors).

## Rule Details

Examples of **incorrect** code for this rule:

```ts
class Foo {
  public bar = new Bar() // BAD: public modifier not needed

  constructor(public readonly baz: Baz) {} // BAD: readonly implies it's a property which defaults to public
}
```

Examples of **correct** code for this rule:

```ts
class Foo {
  bar = new Bar() // GOOD: public modifier not needed

  constructor(public baz: Baz) {} // public modifier allowed
}
```
