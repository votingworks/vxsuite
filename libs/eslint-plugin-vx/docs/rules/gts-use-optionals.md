# Use optional fields (on interfaces or classes) and parameters rather than a `|undefined` type. (`vx/gts-use-optionals`)

This rule is from
[Google TypeScript Style Guide section "Optionals vs `|undefined` type"](https://google.github.io/styleguide/tsguide.html#optionals-vs-undefined-type):

> TypeScript supports a special construct for optional parameters and fields,
> using `?`. Optional parameters implicitly include |undefined in their type.
> However, they are different in that they can be left out when constructing a
> value or calling a method. Use optional fields (on interfaces or classes) and
> parameters rather than a `|undefined` type.

## Rule Details

Examples of **incorrect** code for this rule:

```ts
interface CoffeeOrder {
  sugarCubes: number
  milk: Whole | LowFat | HalfHalf | undefined
}

function pourCoffee(volume: Milliliter | undefined) {
  /* … */
}
```

Examples of **correct** code for this rule:

```ts
interface CoffeeOrder {
  sugarCubes: number
  milk?: Whole | LowFat | HalfHalf
}

function pourCoffee(volume?: Milliliter) {
  /* … */
}
```
