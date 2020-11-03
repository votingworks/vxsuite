# VotingWorks Ballot Scanner

Previously known as Ballot Scanning Device (BSD) or VxScan.

## Public Demo

- <https://bsd.votingworks.app>

Each [pull request](https://github.com/votingworks/bsd/pulls) will have a unique
demo url which can be found in the comments of the pull request.

## Install

Prerequisites:

- `git`
- `yarn`
- [`module-scan`](https://github.com/votingworks/vxsuite/tree/main/apps/module-scan)
- [`module-smartcards`](https://github.com/votingworks/vxsuite/tree/main/apps/module-smartcards)

Then…

```
git clone https://github.com/votingworks/bsd.git
cd bsd
yarn install
```

## Run

1. Start [`module-scan`](https://github.com/votingworks/vxsuite/tree/main/apps/module-scan).
2. Start
   [`module-smartcards`](https://github.com/votingworks/vxsuite/tree/main/apps/module-smartcards).
3. Start the app:

   ```
   yarn start
   ```

To set the election configuration you will either need to scan a smartcard (you can use the mockCardReader script in module-smartcards for this), load an election.json file, or load a ballot export zip file. You should load a ballot export zip if you intend to test actually scanning images.

To display a batch of scanned ballots use the MOCK_SCANNER_FILES environment variable set as described in [`module-scan`](https://github.com/votingworks/vxsuite/tree/main/apps/module-scan).

## Technical Implementation

This project was bootstrapped with
[Create React App](https://github.com/facebook/create-react-app).

[ESLint](https://eslint.org/) is configured to support TypeScript, additional
linting via [StyleLint](https://stylelint.io/) and formatting via
[Prettier](https://prettier.io/).
