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

## License

GPLv3
