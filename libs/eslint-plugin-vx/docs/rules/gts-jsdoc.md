# Enforces GTS JSDoc rules. (`vx/gts-jsdoc`)

This rule is from
[Google TypeScript Style Guide section "Documentation & Comments"](https://google.github.io/styleguide/tsguide.html#comments-documentation):

> ### Document all top-level exports of modules
>
> Use `/** JSDoc */` comments to communicate information to the users of your
> code. Avoid merely restating the property or parameter name. You _should_ also
> document all properties and methods (exported/public or not) whose purpose is
> not immediately obvious from their name, as judged by your reviewer.
>
> Exception: Symbols that are only exported to be consumed by tooling, such as
> `@NgModule` classes, do not require comments.
>
> ### Omit comments that are redundant with TypeScript
>
> For example, do not declare types in `@param` or `@return` blocks, do not
> write `@implements`, `@enum`, `@private` etc. on code that uses the
> `implements`, `enum`, `private` etc. keywords.
>
> ### Do not use `@override` in TypeScript source code
>
> `@override` is not enforced by the compiler, which is surprising and leads to
> annotations and implementation going out of sync. Including it purely for
> documentation purposes is confusing.

## Rule Details

Examples of **incorrect** code for this rule:

```ts
export class Foo extends Bar {
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
/**
 * A descriptive comment that doesn't simply restate the name of the export.
 */
export class Foo extends Bar {
  override doSomething(): void {
    // …
  }
}
```
