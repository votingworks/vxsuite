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
correct template file and template props. The preview server will be available
at [http://localhost:5173](http://localhost:5173). Use the search params to
customize the preview:

- `election-url`: relative URL to the election JSON file
- `paper-size`: size of the ballot, e.g. `letter`, `legal`, `custom-8.5x21`,
  etc.
- `lang`: language code(s), e.g. `en`, `es`, etc. (may be used multiple times)

For example,
[here is the Famous Names ballot preview in letter size](http://localhost:5173/?election-url=/libs-fixtures/electionFamousNames2021/electionBase.json&paper-size=letter).

## Test Ballots

The [fixtures](./fixtures) directory contains sample ballots for testing.

These ballots can be regenerated after code changes using the following command:

```sh
pnpm generate-fixtures
```
