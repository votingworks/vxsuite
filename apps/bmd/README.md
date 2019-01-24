# VotingWorks Ballot Marking Device

The BMD (Ballot Marking Device) app will be used in the following ways:

- An election offical can configured the app with an election file to define all
  possible ballots.
- A voter can:
  - load their ballot using a code provided by a poll worker.
  - cast a vote for each contest/prop/measure of their ballot.
  - view a summary of their votes and print their offical paper ballot.

## Demo the BMD App

The master branch of this repo will be auto-deployed to:

- <https://bmd.votingworks.app>

Each PR has a unique demo url which can be found in the comments of the PR.

## Technical Implementation

This project was bootstrapped with
[Create React App](https://github.com/facebook/create-react-app) for TypeScript.

[ESLint](https://eslint.org/), [TSLint](https://palantir.github.io/tslint/), and
[Prettier](https://prettier.io/) are used to maintain clean code.

We use [Styled Components](https://www.styled-components.com/docs/) for our
`CSS`.

# Original Create React App Instructions

## Available Scripts

In the project directory, you can run:

### `yarn start`

Runs the app in the development mode.<br> Open
[http://localhost:3000](http://localhost:3000) to view it in the browser.

The page will reload if you make edits.<br> You will also see any lint errors in
the console.

### `yarn test`

Launches the test runner in the interactive watch mode.<br> See the section
about
[running tests](https://facebook.github.io/create-react-app/docs/running-tests)
for more information.

### `yarn run build`

Builds the app for production to the `build` folder.<br> It correctly bundles
React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.<br> Your app is
ready to be deployed!

See the section about
[deployment](https://facebook.github.io/create-react-app/docs/deployment) for
more information.

### `yarn run eject`

**Note: this is a one-way operation. Once you `eject`, you can’t go back!**

If you aren’t satisfied with the build tool and configuration choices, you can
`eject` at any time. This command will remove the single build dependency from
your project.

Instead, it will copy all the configuration files and the transitive
dependencies (Webpack, Babel, ESLint, etc) right into your project so you have
full control over them. All of the commands except `eject` will still work, but
they will point to the copied scripts so you can tweak them. At this point
you’re on your own.

You don’t have to ever use `eject`. The curated feature set is suitable for
small and middle deployments, and you shouldn’t feel obligated to use this
feature. However we understand that this tool wouldn’t be useful if you couldn’t
customize it when you are ready for it.

## Learn More

You can learn more in the
[Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

## TSLint Setup:

- https://codeburst.io/five-tips-i-wish-i-knew-when-i-started-with-typescript-c9e8609029db
