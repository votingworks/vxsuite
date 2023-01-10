# Configuring Git commit signing with 1Password

## Overview

This document describes how to configure Git commit signing with 1Password. Git
v2.34 introduced support for signing commits with SSH keys. Combined with
1Password's support for SSH keys and biometric unlock, this allows us to use
1Password as a secure, centralized store for SSH keys and use them to sign
commits easily.

This guide assumes that you want to use the SSH key you create for both commit
signing and authentication. It also assumes you have a macOS host and a Debian
Linux VM.

### Official documentation:

- https://developer.1password.com/docs/ssh/git-commit-signing/

## Setup

1. [Host] Install 1Password.
2. [Host] Enable 1Password SSH agent and add the snippet to `~/.ssh/config` (use
   the "Edit Automatically" button).
3. [Host] Create an SSH key inside 1Password.
4. [Host] Add your SSH key to GitHub at https://github.com/settings/ssh/new
   **TWICE**, once as a signing key and once as an authentication key. If you
   have the 1Password extension for your browser it should offer to fill in the
   details.
5. [VM] Install Git v2.34+:
   1. Create and `cd` to a temp directory.
   2. Download Git v2.39.0 source code:
      `wget https://www.kernel.org/pub/software/scm/git/git-2.39.0.tar.gz`.
   3. Unpack the source code: `tar -xzf git-2.39.0.tar.gz`.
   4. `cd` into the unpacked directory: `cd git-2.39.0`.
   5. Install dependencies:
      `sudo apt-get install libcurl4-openssl-dev gettext -y`.
   6. Make and install to your home directory: `make && make install` (see
      `INSTALL` for more options, or ensure `~/bin` is in your `PATH`).
   7. Verify the installation: `git --version` (should be `2.39.0`).
6. [Host] If you want to be able to sign commits in macOS, configure Git commit
   signing from the info screen of the SSH key you just created (the header will
   prompt you).
7. [VM] Add something like this to your `~/.gitconfig` with appropriate values:

   ```ini
   [commit]
   gpgsign = true

   [gpg]
   format = ssh

   [gpg "ssh"]
   defaultKeyCommand = "ssh-add -L"
   allowedSignersFile = ~/.ssh/allowed_signers
   ```

8. [Host] Forward your SSH agent to the VM by adding this to your
   `~/.ssh/config`, substituting the hostname of your VM for `vx`:

   ```ini
   Host vx
     ForwardAgent yes
   ```

9. [VM] Create `~/.ssh/allowed_signers` and add the fingerprint of the SSH key
   you created in 1Password prefixed by your email address. This step is not
   needed for signing, but is required for verifying signatures with
   `git verify-commit`.

10. [VM] Test it out in a git repo:

    ```bash
    $ git commit --allow-empty -m "Test commit"
    [main 3ef1f28b0] WIP
    $ git verify-commit HEAD
    Good "git" signature for …
    ```

11. [VM] Update all your repositories to use SSH instead of HTTPS for the origin
    remote, i.e. `git@github.com:…` instead of `https://github.com/…`.
