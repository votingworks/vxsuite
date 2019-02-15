# VotingWorks Ballot Marking Device

The BMD (Ballot Marking Device) app will be used in the following ways:

- An election offical can:
  - [x] configure the BMD app with an election file which supports:
    - [ ] single seat contests.
    - [ ] multiple seat contest.
    - [ ] stack rank contest.
    - [ ] yes/no measures and propositions.
    - [ ] specify location-based ballot content.
    - and more TBD…
- A voter can:
  - [ ] load their ballot using a code provided by a poll worker.
  - [x] cast a vote for each contest/prop/measure of their ballot.
  - [x] view a summary of their votes and print their offical paper ballot.

## Public Demo

The `master` branch of this repo is auto-deployed to:

- <https://bmd.votingworks.app>

Each [pull request](https://github.com/votingworks/bmd/pulls) will have a unique
demo url which can be found in the comments of the pull request.

## Install and Run App Locally

This assumes you have `git` and `yarn` installed.

1. Clone the repo:

   ```
   git clone https://github.com/votingworks/bmd.git
   ```

2. Install dependencies:

   ```
   yarn install
   ```

3. Run the app in your local browser:

   ```
   yarn start
   ```

## Contributing

Hey, we’re stoked that you’d like to contribute. Please let us know how we can
help you contribute.

1. Fork this repo: <https://github.com/votingworks/bmd>
1. Clone the repo locally:

   ```
   git clone https://github.com/YOUR_GITHUB_USERNAME/bmd.git
   ```

   Optionally, if you already cloned the main repo, you can update your local
   repo to have two remotes, `votingworks` for the main repo and `origin` for
   your fork:

   ```
   git remote rename origin votingworks
   git remote add origin https://github.com/YOUR_GITHUB_USERNAME/bmd.git
   ```

1. Create a branch for the feature/bug/etc:

   ```
   git checkout -b name-of-your-branch
   ```

1. Run the app:

   ```
   yarn start
   ```

1. In a second console window, run the tests:

   ```
   yarn test
   ```

   Tests default to watch-mode: only tests related to changed code will run. Use
   the available commands in watch-mode to run the tests you want.

1. Add features, fix bugs, etc. and then use `git` to commit your changes in
   logical commits.

   There is a pre-commit hook which will run linting and code formatting
   scripts. You can run these manually with these three commands which are found
   in the `package.json` scripts:

   ```
   yarn eslint:base
   tslint:base
   yarn prettier:write
   ```

   **Using Visual Studio Code?** Autorun linting and code formatting by
   installing/enabling the following plugins (which will pick up their
   respective config files in this project):

   - `TSLint` for TypeScript linting
   - `ESLint` for (ECMAScript) JavaScript linting
   - `Prettier - Code formatter` for code formatting

1. Check for test coverage. When you push your branch to github, CircleCI will
   run all the tests and check for test coverage. To check this yourself, run:

   ```
   yarn test:coverage
   ```

   In the root of the project there is a `coverage` directory. Open
   `coverage/lcov-report/index.html` in a browser to navigate the files to view
   test coverage.

1. Push your branch to your fork on Github.
1. Create a pull request to merge your branch into `voingworks/bmd/master`. Once
   the pull request is created CircleCI will automatically run all the tests to
   ensure the app is working correctly.
1. The VotingWorks maintainers will

## Local Development Scripts

- `yarn install` - Install the dependencies.
- `yarn start` - Run the app locally.
- `yarn test`- Run tests in interactive mode.
- `yarn test:coverage` - Run all tests and update test coverage report.

See `package.json` for all available scripts.

## Technical Implementation

This project was bootstrapped with
[Create React App](https://github.com/facebook/create-react-app) for TypeScript.
It uses [Styled Components](https://www.styled-components.com/docs/) for styles
(and some `css` files too). [ESLint](https://eslint.org/),
[TSLint](https://palantir.github.io/tslint/), and
[Prettier](https://prettier.io/) are used to maintain clean code.
[Jest](https://jestjs.io/), [dom-testing-library](https://testing-library.com)
and [react-testing-library](https://github.com/kentcdodds/react-testing-library)
are used to test components and end-to-end user flows.
[jest-axe](https://github.com/nickcolley/jest-axe) is used to test for basic web
accessibility.
