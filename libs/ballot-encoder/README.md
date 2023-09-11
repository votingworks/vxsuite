# Ballot Encoder

Provides encoding and decoding services for completed ballots.

## Setup

Follow the instructions in the [VxSuite README](../../README.md) to get set up,
then get started like so:

```sh
# test on changes
pnpm test:watch
```

## Example

```ts
import { decodeBallot, encodeBallot } from '@votingworks/ballot-encoder';
import { electionGeneral as election } from '@votingworks/fixtures';
import { CompletedBallot, getContests, vote } from '@votingworks/types';

const ballotStyle = election.ballotStyles[0];
const precinct = election.precincts[0];
const ballotId = 'abcde';
const contests = getContests({ ballotStyle, election });
const votes = vote(contests, {
  'judicial-robert-demergue': 'judicial-robert-demergue-option-yes'
  'judicial-elmer-hull': 'judicial-elmer-hull-option-yes',
  'question-a': 'question-a-option-yes',
  'question-b': 'question-b-option-no',
  'question-c': 'question-c-option-yes',
  'proposition-1': 'proposition-1-option-yes',
  'measure-101': 'measure-101-option-no',
  '102': '102-option-yes',
});
const ballot: CompletedBallot = {
  ballotId,
  ballotStyleId: ballotStyle.id,
  precinctId: precinct.id,
  votes,
};

console.log(encodeBallot(ballot));
/*
Uint8Array [
  86, 88,  1,  2,  49,  50,  2,
  50, 51,  0, 15, 254, 208, 86,
  22, 38, 54, 70,  80
]
*/

console.log(decodeBallot(election, encodeBallot(ballot)).votes);
/*
{
  '102': '102-option-yes',
  'judicial-robert-demergue': 'judicial-robert-demergue-option-yes',
  'judicial-elmer-hull': 'judicial-elmer-hull-option-yes',
  'question-a': 'question-a-option-yes',
  'question-b': 'question-b-option-no',
  'question-c': 'question-c-option-yes',
  'proposition-1': 'proposition-1-option-yes',
  'measure-101': 'measure-101-option-no'
}
*/
```

## License

AGPL-3.0
