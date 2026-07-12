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

> **Working from remote/headless sessions?** The 1Password approach below relies
> on a GUI prompt (and optionally a hardware touch) to approve each signing and
> authentication operation. If you connect to your VM over SSH without access to
> its GUI — where the 1Password prompt appears on a screen you can't reach and
> commits hang — see
> [Alternative: on-machine key + HTTPS (no GUI or agent)](#alternative-on-machine-key--https-no-gui-or-agent)
> instead.

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
5. [VM] Install Git:
   1. `sudo apt-get update && sudo apt-get install git -y`
   2. Verify the installation: `git --version` (should be `2.34` or newer).
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

## Alternative: on-machine key + HTTPS (no GUI or agent)

The 1Password approach keeps your private key off disk and gates every use
behind a biometric/GUI prompt, but that prompt must be answered on the host's
GUI. When you drive the VM entirely over SSH (e.g. remote editor sessions,
`tmux`, or tooling like Claude Code), that prompt appears on a screen you can't
reach and Git operations hang.

This alternative keeps the signing key **on the VM** so signing and pushing
never require a GUI, an SSH agent, agent forwarding, or a hardware touch.

**Security tradeoff:** the private key lives unencrypted on disk (a passphrase
would reintroduce a prompt), so it is only as protected as the machine's file
permissions and disk encryption — weaker than 1Password's hardware/biometric
gating. Prefer it only for a VM you control with full-disk encryption, and
generate a **distinct** key per machine so you can revoke one without affecting
the others. This key is used for signing only; GitHub authentication goes
through a Personal Access Token over HTTPS.

All steps run on the VM.

1. Generate a dedicated, passphrase-less signing key (empty `-N ""` = no
   passphrase, so signing never prompts):

   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N "" -C "you@example.com git signing"
   ```

2. Configure Git to sign with that key file directly. The crucial difference
   from the 1Password setup is that there is **no `defaultKeyCommand`** — that
   command (`ssh-add -L`) is what queries the SSH agent and, via forwarding,
   triggers the 1Password prompt. Setting `user.signingkey` to the key file
   bypasses the agent entirely:

   ```ini
   [user]
   signingkey = ~/.ssh/id_ed25519.pub

   [commit]
   gpgsign = true

   [gpg]
   format = ssh

   [gpg "ssh"]
   allowedSignersFile = ~/.ssh/allowed_signers
   ```

3. Create `~/.ssh/allowed_signers` so `git verify-commit` and
   `git log --show-signature` can verify locally. Format is
   `<email> namespaces="git" <public key>`:

   ```bash
   printf 'you@example.com namespaces="git" %s\n' "$(cat ~/.ssh/id_ed25519.pub)" \
     > ~/.ssh/allowed_signers
   ```

4. Add the **public** key to GitHub at https://github.com/settings/ssh/new as a
   **Signing Key** (only once — you do not also need it as an authentication
   key, since auth uses HTTPS). Paste the contents of `~/.ssh/id_ed25519.pub`.

5. Set up HTTPS authentication with a Personal Access Token instead of SSH:

   ```bash
   gh auth login          # choose HTTPS; paste a PAT with at least `repo` scope
   ```

   `gh` installs a credential helper so Git pushes over HTTPS use the token. To
   make any existing `git@github.com:…` remotes transparently use HTTPS (so you
   don't have to edit each remote), add a global rewrite:

   ```bash
   git config --global url."https://github.com/".insteadOf "git@github.com:"
   ```

6. Test it in a repo:

   ```bash
   $ git commit --allow-empty -m "Test commit"
   $ git verify-commit HEAD
   Good "git" signature for …
   $ git push        # over HTTPS, using the PAT — no SSH, no prompt
   ```

   After pushing, the commit should show as **Verified** on GitHub.

If you previously used the 1Password/agent-forwarding setup, remove any
`SSH_AUTH_SOCK`/agent-forwarding shell customizations that were added to keep
signing working, and drop `ForwardAgent yes` from the host's `~/.ssh/config`
entry for the VM — none of it is needed anymore. Leave your 1Password signing
key registered on GitHub so commits you signed with it previously stay Verified.
