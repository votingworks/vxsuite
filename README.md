# vxsuite

The VotingWorks in-person voting system.

## About

Includes software for a [ballot-marking device (BMD)](./apps/bmd), a
[ballot activation system (BAS)](./apps/bas), a
[ballot scanning device (BSD)](./apps/bsd), and an
[election manager](./apps/election-manager). See https://voting.works for more
information about VotingWorks.

## Development

Building VxSuite for development requires git, [NodeJS](https://nodejs.org/)
v12.19.0 and [pnpm](https://pnpm.js.org).

### Ubuntu Quickstart

This expects Ubuntu 18.0.4, though it may work on other versions. This installs
the right version of NodeJS manually. You can use a tool like
[nvm](https://github.com/nvm-sh/nvm) or [volta](https://volta.sh) to do this in
a nicer way.

```sh
# change this to wherever you want:
NODE_ROOT="${HOME}/usr/local/nodejs"

# download and install:
mkdir -p "$NODE_ROOT"
curl -sLo- https://nodejs.org/dist/v12.19.0/node-v12.19.0-linux-x64.tar.gz | \
    tar xz --strip-components 1 -C "${NODE_ROOT}"

# configure your shell; this assumes bash:
echo "export PATH=\$PATH:${NODE_ROOT}/bin" >> ~/.bashrc
export PATH="${PATH}:${NODE_ROOT}"
node -v # should print "v12.19.0"

# install pnpm:
npm i -g pnpm

# clone the repository:
sudo apt install git -y # in case you don't have git
mkdir -p ~/src && cd ~/src
git clone https://github.com/votingworks/vxsuite.git

# install dependencies:
cd vxsuite
pnpm install

# try out BMD:
cd apps/bmd
pnpm start
# if it worked, go to http://localhost:3000/
```

See the individual README documents for more information on how to run the individual services.

### Adding a monorepo project

This repository is a multi-package repository, or "monorepo". Most of them are NPM packages for NodeJS. Here's how to add a library:

```sh
# put the real name here
LIB=replace-me

# create the library directory
cd vxsuite
mkdir -p "libs/${LIB}"
cd "libs/${LIB}"

mkdir src
echo /lib >> .gitignore

# initialize it
pnpm init "@votingworks/${LIB}"
pnpm i -D typescript jest ts-jest @types/jest @types/node
pnpx tsc --init
pnpx ts-jest config:init
```

- Edit `package.json` as needed, i.e. set `"scripts"` → `"test"` to `"jest"` and `"main"` and `"types"` as appropriate. See existing `libs` for examples.
- Edit `tsconfig.json` as needed, i.e. set `"composite": true` and `"outDir": "./lib"`. See existing `libs` for examples.
- Edit `jest.config.js` as needed, i.e. set coverage thresholds and watch ignore globs. See existing `libs` for examples.

To add a workspace package `foo` as a dependency, do this:
1. Add `"@votingworks/foo": "workspace:*"` to `dependencies` or `devDependencies` as appropriate.
2. Run `pnpm i`.

If you need to add a `@types/` package it's easier to just copy one of the existing `libs/@types` directories than to do the above.

## License

GPLv3
