# Requires `Result` values to be handled appropriately (`vx/no-floating-results`)

Rather than throwing exceptions, some of our APIs return a `Result<T, E>` object
which is either `Ok<T>` on success or `Err<E>` on failure. If the `Result` value
is unused, this could indicate a failure to handle an error appropriately.
Instead, something must be done to learn about the success/failure of the action
that produced the `Result`.

## Rule Details

Examples of **incorrect** code for this rule:

```ts
ok(0)
err('fail')
getSomethingReturningResult()
```

Examples of **correct** code for this rule:

```ts
// assign to a variable to use later
const result = ok(0)

// throw on failure, essentially an assertion
err('fail').unsafeUnwrap()

// optionally get the value ignoring the error
getSomethingReturningResult().ok()

// check for success/failure
getSomethingReturningResult().isOk()
```

## Rule Options

```js
...
"vx/no-floating-results": [<enabled>, { "ignoreVoid": <boolean> }]
...
```

### `ignoreVoid` (default: `true`)

Allows ignoring a `Result` if it is the value of a unary `void` operation. This
is an explicit way to ignore the `Result` value and should mostly be used in
tests.

Examples of **correct** code for this rule, when `ignoreVoid` is `true`:

```ts
void ok(0)
void err('fail')
void getSomethingReturningResult()
```
