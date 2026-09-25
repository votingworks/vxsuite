# Use parameter properties for concise class initializers (`vx/gts-parameter-properties`)

> [!NOTE]
>
> The `recommended` config enables this rule with
> `{ "useParameterProperties": "never" }`. Parameter properties are not erasable
> syntax, so using them prevents enabling TypeScript's
> [`erasableSyntaxOnly`](https://www.typescriptlang.org/tsconfig/#erasableSyntaxOnly)
> option. Declare fields explicitly and assign them in the constructor instead.

This rule is from
[Google TypeScript Style Guide section "Parameter properties"](https://google.github.io/styleguide/tsguide.html#parameter-properties):

> Rather than plumbing an obvious initializer through to a class member, use a
> TypeScript parameter property.

## Rule Details

Examples of **incorrect** code for this rule:

```ts
class Foo {
  private readonly barService: BarService;

  constructor(barService: BarService) {
    this.barService = barService;
  }
}
```

Examples of **correct** code for this rule:

```ts
class Foo {
  constructor(private readonly barService: BarService) {}
}
```

## Options

### `useParameterProperties`

- `"always"` (default): require parameter properties for plain constructor
  initializers, as shown above.
- `"never"`: disallow parameter properties entirely.

Examples of **incorrect** code with `{ "useParameterProperties": "never" }`:

```ts
class Foo {
  constructor(private readonly barService: BarService) {}
}
```

Examples of **correct** code with `{ "useParameterProperties": "never" }`:

```ts
class Foo {
  private readonly barService: BarService;

  constructor(barService: BarService) {
    this.barService = barService;
  }
}
```
