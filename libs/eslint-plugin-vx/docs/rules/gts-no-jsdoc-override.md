# Disallows `@override` JSDoc directive (`vx/gts-no-jsdoc-override`)

This rule is from
[Google TypeScript Style Guide section "Documentation & Comments"](https://google.github.io/styleguide/tsguide.html#do-not-use-override):

> Do not use `@override` in TypeScript source code.
>
> `@override` is not enforced by the compiler, which is surprising and leads to
> annotations and implementation going out of sync. Including it purely for
> documentation purposes is confusing.

## Rule Details

Examples of **incorrect** code for this rule:

```ts
class Foo extends Bar {
  /**
   * @override
   */
  doSomething(): void {
    // …
  }
}
```

Examples of **correct** code for this rule:

```ts
class Foo extends Bar {
  override doSomething(): void {
    // …
  }
}
```
