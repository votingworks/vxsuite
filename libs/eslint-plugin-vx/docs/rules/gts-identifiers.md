# Enforces the rules for identifiers from GTS (`vx/gts-identifiers`)

This rule is from
[Google TypeScript Style Guide section "Identifiers"](https://google.github.io/styleguide/tsguide.html#identifiers):

> Identifiers must use only ASCII letters, digits, underscores (for constants
> and structured test method names), and the '\(' sign. Thus each valid
> identifier name is matched by the regular expression `[\)\w]+`.
>
> Treat abbreviations like acronyms in names as whole words, i.e. use
> `loadHttpUrl`, not `loadHTTPURL`, unless required by a platform name (e.g.
> `XMLHttpRequest`).
>
> Identifiers should not generally use `$`, except when aligning with naming
> conventions for third party frameworks.

## Rule Details

Examples of **incorrect** code for this rule:

```ts
loadHTTPURL();
const illegalnÀme = 12;
const $button = useRef<HTMLButtonElement>(null);
```

Examples of **correct** code for this rule:

```ts
loadHttpUrl();
const legalName = 12;
const buttonRef = useRef<HTMLButtonElement>(null);
```

## Rule Options

```js
...
"vx/no-identifiers": [<enabled>, { "allowedNames": Array<string> }]
...
```

### `allowedNames` (default: `[]`)

Allow names that would otherwise be disallowed. For example, with
`"allowedNames": ["loadURL"]` then `loadURL` is allowed as a name. To use a
regex, surround the value in `/`: `"allowedNames": ["/setX.*/"]` would allow
`setXOffset` or `setXValue` etc.
