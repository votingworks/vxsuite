# VxSuite Development Guide

Instructions for setting up a development environment and building VxSuite.

## Development

Building VxSuite for development has several dependencies. Due to increasingly
complex requirements related to how voting software is built, we now provide
[vxsuite-build-system](https://github.com/votingworks/vxsuite-build-system).

That process is detailed later in this guide.

Most of the code is written in
[TypeScript](./development/best_practices/typescript.md) and
[Rust](./development/best_practices/rust.md).

### Developing on a VM

We strongly recommend development in this repo on a VM running Debian. Our
production machines are configured with Debian so this will allow for you to
develop in the environment most similar to production. Additionally VM features
such as snapshots make development much more straightforward.

For macOS, we recommend using [Parallels](https://www.parallels.com/) to run a
Debian VM. For Linux, we recommend using
[virt-manager](https://virt-manager.org/). Note that your Linux host OS can be
anything you like–it doesn't have to be Debian.

### Debian Quickstart

#### Install Debian

> Note: If you're a VotingWorks employee, you can skip this section and use our
> automated build process. See
> [#vxsuite-build](https://votingworks.slack.com/archives/C04RWBCCTCZ).

VxSuite expects Debian 12.1, though it may work on other versions.

Most of our scripts assume your user account has sudo access.

If you use our automated build process to create your VM, your user account will
have passwordless sudo enabled by default.

If you build your VM on your own, you will need to grant sudo access to your
account. You can do this with the following commands.

```sh
su - # this will prompt for the root password
echo "USERNAME ALL=NOPASSWD: ALL" > /etc/sudoers.d/USERNAME # use your user account username
exit
```

Verify your account has sudo privileges by running `sudo whoami` in the
terminal. You should see `root`.

#### SSH Setup

> Note: You may wish to set up SSH access and commit signing as described in
> [Configuring Git commit signing with 1Password](./commit_signing.md) rather
> than following the SSH key & GPG instructions below.

Next, create an SSH key following the
[GitHub guide](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/generating-a-new-ssh-key-and-adding-it-to-the-ssh-agent).
You will need to add the key to your GitHub account.

Alternatively, you can use an existing SSH key. You will need to import it to
your VM. The instructions below assume creating a new key.

```sh
echo "export PATH=\${PATH}:/usr/sbin" >> ~/.bashrc # Only for debian, add sbin to your path
ssh-keygen -t ed25519 -C "your_github_email@example.com" # Save to the default location, and chose a passphrase
eval "$(ssh-agent -s)" # start the ssh agent
ssh-add ~/.ssh/id_ed25519 # add your ssh key to the agent
cat ~/.ssh/id_ed25519.pub # Copy the public key and add it to your github account
ssh -T git@github.com # This should return `Hi username! You've successfully authenticated, but GitHub does not provide shell access.
```

If you are using our automated build process, we automatically clone our primary
github repositories in the `~/code` directory for you. Please note: these are
https clones, which will not work with SSH authentication. You can tell git to
use SSH authentication for a repo by adding this to your `~/.gitconfig` file:

```ini
[url "git@github.com:votingworks"]
    insteadOf = https://github.com/votingworks
```

If you are not using our automated build process, you can clone manually.

```sh
# install git if it's not already installed
which git >/dev/null 2>&1 || sudo apt install git -y
# clone the main repository
mkdir ~/code
cd ~/code
git clone git@github.com:votingworks/vxsuite.git
# If you are doing a lot of development in vxsuite you will likely eventually need the following repos.
# kiosk-browser is an electron-based browser where our apps run in production.
git clone git@github.com:votingworks/kiosk-browser.git
# vxsuite-complete-system packages vxsuite and kiosk-browser for running in production with various setup scripts for production machines. If you want to test your code through kiosk-browser without needing to develop on kiosk-browser it is recommended you run kiosk-browser through the instructions in this repo.
git clone git@github.com:votingworks/vxsuite-complete-system.git
```

Once you finish setting up your VM, and before you start developing, you should
also set up [GPG Keys](#setting-up-gpg-keys) for your github account.

To install the base set of tools you'll need, you can use our build system:

```sh
mkdir -p ~/code
cd ~/code
git clone git@github.com:votingworks/vxsuite-build-system
cd ~/code/vxsuite-build-system
./scripts/setup-localdev.sh
```

Once that completes, return to the vxsuite directory:

```sh
cd ~/code/vxsuite
```

Automatically install and build all dependencies in the vxsuite repo with the
following command:

```sh
./script/bootstrap
```

Test that you can run the code:

```sh
cd apps/admin/frontend
pnpm start
```

If you have VS Code open and connected to your VM remotely it should
automatically forward the port for you, and you can visit
`http://localhost:3000` on your home machine as well.

See the individual README documents for more information on how to run the
individual services.

See the [README](https://github.com/votingworks/vxsuite-complete-system) in
`vxsuite-complete-system` for information on how to test the apps in this repo
through kiosk-browser (electron-based browser that runs our apps in production).

### Setting up GPG Keys

> Note: This is only required if you plan to contribute to the repo.
> Additionally, you may wish to use 1Password to facilitate this process. See
> [Configuring Git commit signing with 1Password](./commit_signing.md).

Setting up GPG keys with your GitHub account will allow you to sign tags and
commits locally. These are verified by GitHub which gives everyone confidence
about the origin of changes you've made. You can follow the
[steps in the GitHub docs](https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification)
to set this up. Note that this is a step that happens in ADDITION to ssh keys,
not in substitute of them. Debian comes with gpg installed so you can skip the
first step about installing GPG tools if you are on your Debian machine. You
will want to follow the instructions in _Generating a new GPG key_, _Add a new
GPG key_, _Tell Git your signing key_. Then follow the steps in _Signing
commits_ to test signing a commit and pushing to GitHub to make sure it is
**verified**.

## Contributing

See [contributing.md](./development/contributing.md) for more information on how
to contribute to this project.
