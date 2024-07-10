# converter-nh-accuvote

Converts XML/PDF ballot definitions as used by the state of New Hampshire into a
VotingWorks election definition.

## Setup

Follow the instructions in the [VxSuite README](../../README.md) to get set up.

## API Usage

```ts
import { convertElectionDefinition } from '@votingworks/converter-nh-accuvote';
import { loadImageData } from '@votingworks/image-utils';
import { DOMParser } from '@xmldom/xmldom';

const front = await loadImageData('./template-front.jpeg');
const back = await loadImageData('./template-back.jpeg');
const definition = new DOMParser().parseFromString(
  await fs.readFile('./election.xml', 'utf8'),
  'text/xml'
);
const convertResult = convertElectionDefinition({
  front,
  back,
  definition,
});

if (convertResult.isErr()) {
  console.error(`error: ${JSON.stringify(convertResult.err())}`);
} else {
  console.log('Converted election result:', convertResult.ok().election);
}
```

## CLI Usage

```sh
$ ./bin/convert \
  ../fixtures/data/electionGridLayoutNewHampshireTestBallot/{definition.xml,template.pdf} \
  -o ../fixtures/data/electionGridLayoutNewHampshireTestBallot/
warning: conversion completed with issues:
- Template images do not match expected sizes. The XML definition says the template images should be "legal", but the template images are front="letter" and back="letter".
```

## License

AGPL-3.0
