# Requires using a safe number parser (`vx/gts-safe-number-parse`)

This rule is from
[Google TypeScript Style Guide section "Type coercion"](https://google.github.io/styleguide/tsguide.html#type-coercion):

> Code must use `Number()` to parse numeric values, and must check its return
> for `NaN` values explicitly, unless failing to parse is impossible from
> context.
>
> Code must not use unary plus (`+`) to coerce strings to numbers. Parsing
> numbers can fail, has surprising corner cases, and can be a code smell
> (parsing at the wrong layer). A unary plus is too easy to miss in code reviews
> given this.
>
> Code must also not use `parseInt` or `parseFloat` to parse numbers, except for
> non-base-10 strings (see below). Both of those functions ignore trailing
> characters in the string, which can shadow error conditions (e.g. parsing
> `12 dwarves` as `12`).

## Rule Details

Examples of **incorrect** code for this rule:

```ts
const x = +y;
const n = parseInt(someString, 10); // Error prone,
const f = parseFloat(someString); // regardless of passing a radix.
```

Examples of **correct** code for this rule:

```ts
const parsed = safeParseInt(y);
if (parsed.isOk()) {
  doSomething(parsed.ok());
}
```
