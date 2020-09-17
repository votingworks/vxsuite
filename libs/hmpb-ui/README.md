# hmpb-ui

Provides a React component and required assets for rendering hand-marked paper
ballots.

## Usage

This package is only intended to be used within the VxSuite monorepo. To use it,
you'll need to configure the tooling to resolve the package modules and its
assets correctly. See election-manager (in particular `config-overrides.js`) for
an example. A possibly incomplete list of steps:

- configure Jest module resolver using `moduleNameMapper`
- configure eslint's `import` plugin using `eslint-import-resolver-typescript`
- configure webpack using `tsconfig-paths-webpack-plugin` for modules, and
  `copy-webpack-plugin` for assets

If you've configured your tooling as described above, your webpack dev server
should respond to e.g. `/hmpb-ui.css` with the basic CSS needed to render a
HMPB. You'll need to include the following in your app's `index.html`:

```html
<link rel="stylesheet" href="%PUBLIC_URL%/hmpb-ui.css" />
```

Then, import the component to use it in your app:

```ts
import { HandMarkedPaperBallot } from '@votingworks/hmpb-ui'
```

You'll need to provide a few things for it to work properly:

- an `Election` and its accompanying sha256 hash
- ballot style & precinct configuration
- settings for ballot type and test/live mode
- i18n information:
  - `Trans` component and `t` helper from `react-i18next`, configured with
    strings for the election you wish to render
  - `locales` describing the primary and (optional) secondary locales for the
    ballot
- `printBallotRef` with a reference to a DOM node to render into
- (optional) votes to pre-populate the ballot with
- (optional) callback for when rendering has finished

```ts
import React from 'react'
import { Election } from '@votingworks/ballot-encoder'
import { useTranslation, Trans } from 'react-i18next'

const HMPB = ({
  election,
  electionHash,
  printBallotRef,
}: {
  election: Election
  electionHash: string
  printBallotRef: React.RefObject<HTMLElement>
}) => {
  const { t, i18n } = useTranslation()
  const ballotStyle = election.ballotStyles[0]
  const precinctId = ballotStyle.precincts[0]
  const locales = { primary: 'en-US', secondary: 'es-US' }
  const localeElection = locales.secondary
    ? withLocale(election, locales.secondary)
    : undefined

  // Add strings to i18next.
  i18n.addResources(locales.primary, 'translation', election.ballotStrings)
  if (localeElection && locales.secondary) {
    i18n.addResources(
      locales.secondary,
      'translation',
      localeElection.ballotStrings
    )
  }

  return (
    <HandMarkedPaperBallot
      // election info
      election={election}
      electionHash={electionHash}
      // ballot style & precinct config
      ballotStyleId={ballotStyle.id}
      precinctId={precinctId}
      // ballot type etc
      isLiveMode={false}
      isAbsenteeMode={true}
      absenteeTintColor="#ff00ff"
      // i18n
      locales={locales}
      t={t}
      Trans={Trans}
    />
  )
}
```
