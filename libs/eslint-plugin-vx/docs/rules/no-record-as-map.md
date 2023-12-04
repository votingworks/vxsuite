# Prevents the use of the `Record` type with arbitrary string keys (`vx/no-record-as-map`)

The `Record` type is just an instance of `Object`. Using it as a map is fairly
easy because many of JavaScript's language features make it easy to use objects
as maps. However, using `Record` as a map with arbitrary string keys can lead to
bugs because the keys may overlap with the keys of the `Object` prototype. This
rule prevents the use of `Record` as a map with arbitrary string keys.

## Rule Details

Examples of **incorrect** code for this rule:

```ts
function getValueOrDefault<K extends string, V>(
  map: Record<K, V>,
  key: K,
  defaultValue: V
): V {
  return map[key] ?? defaultValue;
}

// this works fine:
getValueOrDefault({ a: 1 }, 'a', 0) // 1

// this is a bug:
getValueOrDefault({ a: 1 }, 'toString', 0) // [Function: toString], not 0!
```

Examples of **correct** code for this rule:

```ts
// with non-arbitrary string keys, you can use `Record`:
type IssueType = 'error' | 'warning' | 'info';

const issueTypeToSeverity: Record<IssueType, number> = {
  error: 2,
  warning: 1,
  info: 0,
};

// use `Map` if you need arbitrary string keys:
function getValueOrDefault<K extends string, V>(
  map: Map<K, V>,
  key: K,
  defaultValue: V
): V {
  return map.get(key) ?? defaultValue;
}

// this works fine:
getValueOrDefault(new Map([['a', 1]]), 'a', 0) // 1

// and now so does this:
getValueOrDefault(new Map([['a', 1]]), 'toString', 0) // 0

```
