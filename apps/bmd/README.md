# VotingWorks Ballot Marking Device

## Live Demo

The `main` branch of this repo is auto-deployed to:

- <https://bmd.votingworks.app>

Each [pull request](https://github.com/votingworks/bmd/pulls) will have a unique
demo url which can be found in the comments of the pull request.

## Install and Run App Locally

This assumes you have `git` and `yarn` installed.

1. Clone the repo:

   ```sh
   git clone https://github.com/votingworks/bmd.git
   ```

2. Install dependencies:

   ```sh
   yarn install
   ```

3. Run the app in your local browser:

   ```sh
   # Run VxMark by default
   yarn start

   # Or run VxPrint
   VX_APP_MODE=VxPrint yarn start
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

   There is a pre-commit hook (see `lint-staged` in package.json) which will run
   linting and code formatting scripts. You can run these manually with these
   commands which are found in the `package.json` scripts:

   ```
   yarn lint
   yarn format
   ```

   **Using Visual Studio Code?** Autorun linting and code formatting by
   installing/enabling/disabling the following plugins (which will pick up the
   respective config files in this project):

   - disable `TSLint` as ESLint handles this functionality
   - install/enable `ESLint` for (ECMAScript) JavaScript linting
   - install/enable `stylelint` for modern CSS linting
   - install/enable `Prettier - Code formatter` for code formatting

1. Check for test coverage. When you push your branch to github, CircleCI will
   run all the tests and check for test coverage. To check this yourself, run:

   ```
   yarn test:coverage
   ```

   In the root of the project there is a `coverage` directory. Open
   `coverage/lcov-report/index.html` in a browser to navigate the files to view
   test coverage.

1. Push your branch to your fork on Github.
1. Create a pull request to merge your branch into `voingworks/bmd/main`. Once
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
(and some `css` files too). [ESLint](https://eslint.org/) is configured to lint
Javascript and TypeScript files, and format code using
[Prettier](https://prettier.io/). [stylelint](https://stylelint.io/) is used to
lint modern css. [Jest](https://jestjs.io/),
[dom-testing-library](https://testing-library.com),
[react-testing-library](https://github.com/kentcdodds/react-testing-library),
and [Cypress](https://www.cypress.io/) are used to test components and
end-to-end user flows.

## Credits

Center for Civic Design and Oxide Design consulted on the initial design of this
project. Thanks CCD and Oxide!
