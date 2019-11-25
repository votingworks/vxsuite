# VotingWorks Ballot Scanning Device (BSD) or VxScan

## Public Demo

- <https://bsd.votingworks.app>

Each [pull request](https://github.com/votingworks/bsd/pulls) will have a unique
demo url which can be found in the comments of the pull request.

## Install

Prerequisites:

- `git`
- `yarn`
- [`module-scan`](https://github.com/votingworks/module-scan/)
- [`module-smartcards`](https://github.com/votingworks/module-smartcards/)

Then…

```
git clone https://github.com/votingworks/bsd.git
cd bsd
yarn install
```

## Run

1. Start [`module-scan`](https://github.com/votingworks/module-scan/).
2. Start
   [`module-smartcards`](https://github.com/votingworks/module-smartcards/).
3. Start the app:

   ```
   yarn start
   ```

To display a batch of scanned ballots, add ballot images into the
`module-scan/ballot-images` directory, then click "Scan New Batch" button.

## Technical Implementation

This project was bootstrapped with
[Create React App](https://github.com/facebook/create-react-app).

[ESLint](https://eslint.org/) is configured to support TypeScript, additional
linting via [StyleLint](https://stylelint.io/) and formatting via
[Prettier](https://prettier.io/).
