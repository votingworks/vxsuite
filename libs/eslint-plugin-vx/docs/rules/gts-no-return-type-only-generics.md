# Disallows generics in functions where the only use is in the return type (`vx/gts-no-return-type-generics`)

This rule is from
[Google TypeScript Style Guide section "Type System"](https://google.github.io/styleguide/tsguide.html#return-type-only-generics):

> Avoid creating APIs that have return type only generics. When working with
> existing APIs that have return type only generics always explicitly specify
> the generics.

## Exceptions

There may be times when it makes sense to disregard this rule. A simple example
of this is `deferred` from `@votingworks/utils`. Here's its type signature:

```ts
function deferred<T>(): Deferred<T>
```

This function violates this rule, but we consider it to be acceptable. Why? A
counterexample will help illustrate. Let's look at what this rule is trying to
prevent by examining a thin wrapper around `fetch` called `fetchJSON`:

```ts
async function fetchJSON<T>(url: string): Promise<T>
```

This function violates the rule and is **not** an example of a good exception.
Why? Because it allows TypeScript to infer `T` in a way that does not provide
type safety. For example, nothing here guarantees that `response` actually has
the shape of `MachineConfig`:

```ts
const response: MachineConfig = await fetchJSON('/machine-config')
```

This _looks_ like something TypeScript will validate, but it simply infers
`T = MachineConfig` and leaves it at that. Contrast that with this example use
of `deferred`:

```ts
function asyncRandomBoolean(): Promise<boolean> {
  const { promise, resolve } = deferred<boolean>()
  setTimeout(() => {
    resolve(Math.random() < 0.5)
  }, 10)
  return promise
}
```

Providing an explicit type parameter to `deferred` (as the secondary directive
of this rule says to do) means we get type checking when returning `promise` and
when calling `resolve`. If we just had `deferred` return `Deferred<unknown>`,
we'd instead have to do this:

```ts
function asyncRandomBoolean(): Promise<boolean> {
  const { promise, resolve } = deferred()
  setTimeout(() => {
    resolve(Math.random() < 0.5)
  }, 10)
  return promise as Promise<boolean>
}
```

The call to `resolve` is effectively no longer type-checked. If we make a
mistake and pass something other than a `boolean` TypeScript will not complain.
Likewise, we have to provide an explicit cast when using `promise`. Overall this
is worse than the version that violates this rule.

## Rule Details

Examples of **incorrect** code for this rule:

```ts
async function fetchJSON<T>(url: string): Promise<T> {
  // …
}

const anyValue = existingFnWithReturnTypeOnlyGenerics()
```

Examples of **correct** code for this rule:

```ts
async function fetchJSON(url: string): unknown {
  // …
}

const anyValue = existingFnWithReturnTypeOnlyGenerics<string>()
```
