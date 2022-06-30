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
✅ (44.47%) Donald J. Trump  and Michael R. Pence
❓ (10.81%) Joseph R. Biden  and Kamala D. Harris
✅ (15.78%) Jo Jorgensen  and Jeremy Cohen
✅ (77.27%) Write-In #1

Governor
✅ (15.03%) Chris Sununu
…

# customize the mark threshold to 5% for both marginal & definite
$ ./bin/interpret \
    test/fixtures/hudson-2020-11-03/election.json \
    test/fixtures/hudson-2020-11-03/scan-marked-{front,back}.jpeg \
    -t 5%
…
State Representatives
✅ ( 6.46%) Tony Lekas
✅ ( 7.58%) Hershel Nunez
⬜️ ( 3.98%) Lynne Ober
✅ (24.47%) Russell Ober
✅ (21.61%) Andrew Prout
✅ (20.50%) Andrew Renzullo
✅ ( 8.07%) Kimberly Rice
✅ ( 5.09%) Denise Smith
✅ (13.42%) Jordan Ulery
…

# customize the mark thresholds to 4% for marginal & 7% for definite
$ ./bin/interpret \
    test/fixtures/hudson-2020-11-03/election.json \
    test/fixtures/hudson-2020-11-03/scan-marked-{front,back}.jpeg \
    -t 4%,7%
…
Representative in Congress
✅ (31.55%) Steven Negron
✅ ( 7.70%) Ann McLane Kuster
✅ (36.77%) Andrew Olding
✅ (18.14%) Write-In #1

Executive Councilor
✅ (71.30%) Dave Wheeler
✅ ( 7.70%) Debora B. Pignatelli
✅ (13.79%) Write-In #1
…
```

## License

AGPL-3.0
