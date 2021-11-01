# Disallows default exports (`vx/gts-no-default-exports`)

This rule is from
[Google TypeScript Style Guide section "Exports"](https://google.github.io/styleguide/tsguide.html#exports):

> Use named exports in all code. Do not use default exports. This ensures that
> all imports follow a uniform pattern. Default exports provide no canonical name,
> which makes central maintenance difficult with relatively little benefit to code
> owners, including potentially decreased readability.

## Rule Details

Examples of **incorrect** code for this rule:

```ts
export default class Foo { ... } // BAD!
```

Examples of **correct** code for this rule:

```ts
export class Foo { ... } // GOOD!
```
