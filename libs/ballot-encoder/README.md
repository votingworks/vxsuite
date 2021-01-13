# Ballot Encoder

Provides encoding and decoding services for completed ballots.

## Dev Install

To use within VS Code:

```
pnpm install
```

## Pubishing New NPM Version

1. Update the version and create a git tag: `npm version [major|minor|patch]`
2. Push branch for PR review. Once approved…
3. Generate the JavaScript files from TypeScript: `pnpm prepare` (or `pnpx tsc`)
4. Publish current version: `npm publish --access=public`

Optionally, deprecate a previous version. For example:
`npm deprecate -f '@votingworks/ballot-encoder@1.3.1' "Poor translations"`

## Example

```ts
import {
  CompletedBallot,
  decodeBallot,
  electionSample as election,
  encodeBallot,
  getContests,
  vote,
} from '@votingworks/ballot-encoder'

const ballotStyle = election.ballotStyles[0]
const precinct = election.precincts[0]
const ballotId = 'abcde'
const contests = getContests({ ballotStyle, election })
const votes = vote(contests, {
  'judicial-robert-demergue': 'yes',
  'judicial-elmer-hull': 'yes',
  'question-a': 'yes',
  'question-b': 'no',
  'question-c': 'yes',
  'proposition-1': 'yes',
  'measure-101': 'no',
  '102': 'yes',
})
const ballot: CompletedBallot = {
  ballotId,
  ballotStyle,
  precinct,
  votes,
}

console.log(encodeBallot(ballot))
/*
Uint8Array [
  86, 88,  1,  2,  49,  50,  2,
  50, 51,  0, 15, 254, 208, 86,
  22, 38, 54, 70,  80
]
*/

console.log(decodeBallot(election, encodeBallot(ballot)).ballot.votes)
/*
{
  '102': 'yes',
  'judicial-robert-demergue': 'yes',
  'judicial-elmer-hull': 'yes',
  'question-a': 'yes',
  'question-b': 'no',
  'question-c': 'yes',
  'proposition-1': 'yes',
  'measure-101': 'no'
}
*/
```

## Usage

To encode a ballot, simply pass an election and a completed ballot object to
`encodeBallot`. You'll get back a buffer that may be stored or transmitted and
later passed to `decodeBallot` with the same `election` data given to
`encodeBallot`.

There are multiple encoder versions and by default the latest will be used when
encoding. To specify the version, pass the `EncoderVersion` as the second
parameter to `encodeBallot`:

```ts
import { encodeBallot, EncoderVersion } from '@votingworks/ballot-encoder'

const encodedBallot = encodeBallot(ballot, EncoderVersion.v1)
```

When decoding, you may pass an `EncoderVersion` or you may allow `decodeBallot`
to detect the encoder version:

```ts
import { decodeBallot, EncoderVersion } from '@votingworks/ballot-encoder'

// automatically detect version
const result = decodeBallot(election, encodedBallot)
console.log('Ballot version:', result.version)
console.log('Ballot:', result.ballot)

// specify version
const result = decodeBallot(election, encodedBallot, EncoderVersion.v0)
console.log('Ballot version:', result.version)
console.log('Ballot:', result.ballot)
```

If you only want to detect the version, you can simply use `detect`:

```ts
import { detect } from '@votingworks/ballot-encoder'

const version = detect(encodedBallot)
console.log('Ballot version:', version)
```

## Publish

This project uses the
[Angular Commit Message Format convention](https://gist.github.com/brianclements/841ea7bffdb01346392c).
How to publish a new version:

1. Determine what the appropriate version bump is (i.e. patch, minor, or major).
   Let's assume this is stored in the environment variable `BUMP`.
2. Create a branch for publishing the new version.
3. Bump the version: `npm version $BUMP`.
4. Publish the package to NPM: `pnpm publish:npm`.
5. Push the branch and the new tag:
   `git push -u origin HEAD && git push --tags`.
6. Create a pull request for your newly pushed branch. Note that this pull
   request should only have the version bump commit, nothing else.
7. Get the pull request approved and merged.
