# Forbits `assert` or `expect` on `Result::isOk` et al (vx/no-assert-result-predicates)

`Result` wraps either a successful value or an error. You may want to check if
the result is successful before proceeding or to narrow the type of the result.
However, asserting on the `isOk` or `isErr` methods yields unhelpful error
messages such as `expected true, got false`. Instead, in tests you should either
`expect` the `Result` to equal another `Result` or simply unwrap the result and
let it throw the `Err` value if it is one.

Note that if your code is _not_ in a test file, you should be checking the
`Result` value and handling the `Err` case appropriately rather than crashing
with `unsafeUnwrap`.

## Rule Details

Examples of **incorrect** code for this rule:

```ts
assert(result.isOk());
expect(result.isOk()).toBe(true);
```

Examples of **correct** code for this rule:

```ts
expect(result).toEqual(ok('value'));
result.unsafeUnwrap();
```
