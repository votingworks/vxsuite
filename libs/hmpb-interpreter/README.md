# hmpb-interpreter

Interprets VotingWorks ballots marked by hand and scanned into images.

## Install

```sh
$ yarn add @votingworks/hmpb-interpreter
$ npm install @votingworks/hmpb-interpreter # or, with npm
```

## Usage

```ts
import { Interpreter } from '@votingworks/hmpb-interpreter'

// Configure contests via an election.json. Contests on printed ballots must
// appear in the same order they appear in this configuration.
const interpreter = new Interpreter(election)

while (interpreter.hasMissingTemplates()) {
  // Templates are images of blank ballots.
  await interpreter.addTemplate(await getNextImage())
}

console.log('Interpreter has templates for all ballot styles and contests!')

const imageData = await getNextImage()
const interpretedBallot = await interpreter.interpretBallot(imageData)

console.log('Interpreted ballot:', interpretedBallot)
```

## License

Apache-2.0
