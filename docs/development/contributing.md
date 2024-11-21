# VxSuite Contributing Guide

Instructions for contributing to VxSuite. See the
[Setup Guide](../development.md) for instructions on setting up a development
environment.

> Note: If you only want to make minor changes such as fixing typos, you can
> [edit the file directly in GitHub](https://docs.github.com/en/github/managing-files-in-a-repository/editing-files-in-your-repository)
> without needing to set up a development environment.

We’re stoked that you’d like to contribute. Please let us know how we can help
you.

1. Fork this repo: <https://github.com/votingworks/vxsuite>
2. Clone the repo locally:

   ```sh
   git clone git@github.com:YOUR_GITHUB_USERNAME/vxsuite.git
   ```

   Optionally, if you already cloned the main repo, you can update your local
   repo to have two remotes, `votingworks` for the main repo and `origin` for
   your fork:

   ```sh
   git remote rename origin votingworks
   git remote add origin git@github.com:YOUR_GITHUB_USERNAME/vxsuite.git
   ```

3. Ensure you're set up for development by following the instructions in
   [Development](./development.md).

4. Create a branch for the feature/bug/etc:

   ```sh
   git checkout -b name-of-your-branch
   ```

5. For an app, run the app:

   ```sh
   pnpm start
   ```

   Or, for a library, run the build watcher:

   ```sh
   pnpm build:watch
   ```

6. In a second console window, run the tests:

   ```sh
   pnpm test
   ```

   Tests default to watch-mode: only tests related to changed code will run. Use
   the available commands in watch-mode to run the tests you want.

7. Add features, fix bugs, etc. Follow the best practices described below. Then
   use `git` to commit your changes in logical commits.

   You may wish to run this before committing to fix code styling:

   ```sh
   pnpm lint:fix
   ```

   **Using Visual Studio Code?** Open the `vxsuite.code-workspace` file in the
   root of the project. This will open all the projects in the workspace. There
   are suggested extensions that will help you with linting and formatting.

8. Check for test coverage. When you push your branch to GitHub, CircleCI will
   run all the tests and check for test coverage. To check this yourself, run:

   ```sh
   pnpm test:coverage
   ```

   In the root of the project there is a `coverage` directory. Open
   `coverage/lcov-report/index.html` in a browser to navigate the files to view
   test coverage.

   > **NOTE:** You can probably run `python3 -m http.server` to serve the files,
   > then view them at http://localhost:8080/.

9. Run integration tests. You will need to make sure to have Playwright
   dependencies installed (see: https://playwright.dev/docs/intro). You will
   also need to have chrome installed. While the server is running in another
   terminal window run:

   ```
   cd path/to/integration-tests
   pnpm test:watch
   ```

10. Push your branch to your fork on GitHub.
11. Create a pull request to merge your branch into `votingworks/vxsuite/main`.
    Once the pull request is created CircleCI will automatically run all the
    tests to ensure the app is working correctly.
12. @votingworks/eng will review the pull request and ask questions, request
    changes, or just merge right away.

## Setting up Commit Signing

We require that all commits are signed. Such commits are verified by GitHub
which gives everyone confidence about the origin of changes you've made. If you
only plan to contribute once or non-regularly, you can skip this if you don't
already have it working. We will sign your commits using our own signing keys if
we decide to accept your pull request. There are two ways to sign commits: SSH
keys or GPG keys. Whichever you pick, you may want to make a test commit to test
signing and pushing to GitHub to make sure it is **verified**.

### Signing with SSH Keys

The easiest way to use SSH keys to sign your commits is to use 1Password and a
recent version of git. See
[Configuring Git commit signing with 1Password](./commit_signing.md).

### Signing with GPG Keys

You can follow the
[steps in the GitHub docs](https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification)
to set this up. Note that this is a step that happens _in addition_ to ssh keys,
not in substitute of them. Debian comes with gpg installed so you can skip the
first step about installing GPG tools if you are on your Debian machine. You
will want to follow the instructions in _Generating a new GPG key_, _Add a new
GPG key_, _Tell Git your signing key_.

## Adding a monorepo project

This repository is a multi-package repository, or "monorepo". Most of them are
NPM packages for NodeJS linked together in a
[pnpm workspace](https://pnpm.io/workspaces). The easiest way to add a new
package is to copy an existing one and modify it. Be sure to remove any
dependencies that are not needed.

## Best Practices

- [TypeScript](./best_practices/typescript.md)
- [Rust](./best_practices/rust.md)
