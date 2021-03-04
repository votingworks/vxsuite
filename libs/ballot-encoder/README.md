# Ballot Encoder

Provides encoding and decoding services for completed ballots.

## Development

```sh
# setup
pnpm install
# automatically build changes for other monorepo projects
pnpm dev
# test on changes
pnpm test:watch
```

## Example

```ts
import { decodeBallot, encodeBallot } from '@votingworks/ballot-encoder'
import { electionSample as election } from '@votingworks/fixtures'
import { CompletedBallot, getContests, vote } from '@votingworks/types'

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
  ballotStyleId: ballotStyle.id,
  precinctId: precinct.id,
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

console.log(decodeBallot(election, encodeBallot(ballot)).votes)
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
