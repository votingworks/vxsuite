# Ballot Encoder

Provides encoding and decoding services for completed ballots.

## Dev Install

To use within VS Code:

```
yarn install
yarn pnpify --sdk
```

## Developing Alongside another Project

In dev `ballot-encoder` dir, run `yarn tsc` to generate JavaScript files.

In the PROJECT you wish to use this dev version of `ballot-encoder`:

1. `cd path/to/PROJECT/node_modules/@votingworks`
2. `rm -rf ballot-encoder`
3. `ln -s path/to/ballot-encoder ballot-encoder`
4. restart project server if applicable

## Example

```ts
import {
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
const ballot = {
  election,
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

To encode a ballot, simply pass a completed ballot object to `encodeBallot`.
You'll get back a buffer that may be stored or transmitted and later passed to
`decodeBallot` with the same `election` data that was part of the completed
ballot object.

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
