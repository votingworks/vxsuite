# ballot-interpreter-nh

Interprets ballots as used by the state of New Hampshire, marked by hand and
scanned into images.

## Setup

This package is private and is not intended to be published to NPM, but is for
use within the `vxsuite` monorepo. To use it from a library or app within the
monorepo, run `pnpm i -S '@votingworks/ballot-interpreter-vx@workspace:*'` in
the library/app root.

Follow the instructions in the [VxSuite README](../../README.md) to get set up,
then get started like so:

```sh
# automatically build changes
pnpm build:watch

# test on changes
pnpm test:watch
```

## API Usage

```ts
import { interpret } from '@votingworks/ballot-interpreter-nh';

const interpretResult = await interpret(electionDefinition, [
  frontImagePath,
  backImagePath,
]);

if (interpretResult.isErr()) {
  console.error(`error: ${interpretResult.err().message}`);
} else {
  console.log('Interpreted ballot:', interpretResult.ok());
}
```

## CLI Usage

Run these examples from the root of `ballot-interpreter-nh`. The percentages
shown are the mark score for each bubble. Output from each example is truncated
for clarity.

```sh
# use the default mark thresholds
$ ./bin/interpret \
    test/fixtures/hudson-2020-11-03/election.json \
    test/fixtures/hudson-2020-11-03/scan-marked-{front,back}.jpeg
test/fixtures/hudson-2020-11-03/scan-marked-front.jpeg:
President and Vice-President of the United States
✅ (42.68%) Donald J. Trump  and Michael R. Pence
✅ (10.49%) Joseph R. Biden  and Kamala D. Harris
✅ (14.88%) Jo Jorgensen  and Jeremy Cohen
✅ (76.10%) Write-In #1

Governor
✅ (13.66%) Chris Sununu
…

# customize the mark threshold to 5% for both marginal & definite
$ ./bin/interpret \
    test/fixtures/hudson-2020-11-03/election.json \
    test/fixtures/hudson-2020-11-03/scan-marked-{front,back}.jpeg \
    -t 5%
…
State Representatives
⬜️ ( 4.88%) Tony Lekas
✅ ( 5.85%) Hershel Nunez
✅ ( 6.34%) Lynne Ober
✅ (23.41%) Russell Ober
✅ (20.98%) Andrew Prout
✅ (18.05%) Andrew Renzullo
✅ ( 7.07%) Kimberly Rice
⬜️ ( 4.63%) Denise Smith
✅ (12.20%) Jordan Ulery
…

# customize the mark thresholds to 4% for marginal & 7% for definite
$ ./bin/interpret \
    test/fixtures/hudson-2020-11-03/election.json \
    test/fixtures/hudson-2020-11-03/scan-marked-{front,back}.jpeg \
    -t 4%,7%
…
Representative in Congress
✅ (30.98%) Steven Negron
❓ ( 6.34%) Ann McLane Kuster
✅ (34.63%) Andrew Olding
✅ (16.59%) Write-In #1

Executive Councilor
✅ (70.49%) Dave Wheeler
❓ ( 6.83%) Debora B. Pignatelli
✅ (11.71%) Write-In #1
…
```

## License

AGPL-3.0
