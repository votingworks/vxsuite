# hmpb

Lays out ballots based on templates and renders them as PDFs using a headless
Chromium browser.

## Ballot Preview

While developing ballot templates, it can be useful to preview them in a web
browser so you can use the developer tools to inspect the layout and styles.
Just run:

```sh
pnpm start
```

You may need to edit
[src/preview/browser_preview.ts](src/preview/browser_preview.ts) to use the
correct template file and template props.

## Test Ballots

The [fixtures](./fixtures) directory contains sample ballots for testing.

These ballots can be regenerated after code changes using the following command:

```sh
pnpm generate-fixtures
```
