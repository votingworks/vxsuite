# VotingWorks Ballot Marking Device

The BMD (Ballot Marking Device) app will be used in the following ways:

- An election offical can:
  - [x] configure the app with an election file.
- A voter can:
  - [ ] load their ballot using a code provided by a poll worker.
  - [x] cast a vote for each contest/prop/measure of their ballot.
  - [x] view a summary of their votes and print their offical paper ballot.

## Public Demo

The `master` branch of this repo is auto-deployed to:

- <https://bmd.votingworks.app>

Each [pull request](https://github.com/votingworks/bmd/pulls) will have a unique
demo url which can be found in the comments of the pull request.

## Local Development

- `yarn install` - Install the dependencies.
- `yarn start` - Run the app locally.
- `yarn test`- Run tests in interactive mode.
- `yarn test:coverage` - Run all tests and update test coverage report.

See `package.json` for all available scripts.

### Visual Studio Code

Autorun code formatting and linting by installing the following VS Code plugins:

- "ESLint"
- "Prettier - Code formatter"

## Technical Implementation

This project was bootstrapped with
[Create React App](https://github.com/facebook/create-react-app) for TypeScript.
It uses [Styled Components](https://www.styled-components.com/docs/) instead of
`css` directly.

[ESLint](https://eslint.org/), [TSLint](https://palantir.github.io/tslint/), and
[Prettier](https://prettier.io/) are used to maintain clean code.

[Jest](https://jestjs.io/), [dom-testing-library](https://testing-library.com)
and [react-testing-library](https://github.com/kentcdodds/react-testing-library)
are used to test components and end-to-end user flows.

A pre-commit hook will run all lint and test scripts. View `package.json` for
all available scripts.
