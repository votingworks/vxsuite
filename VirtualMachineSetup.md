# Virtual Machine Setup

Follow the steps below to configure a Virtual Machine for development at VotingWorks. This guide assumes you are using macOS, if you are not modify the instructions as appropriate. 

## Create Debian Virtual Machine

In an effort to simplify the development process on Macs, we now provide an automated build system for Parallels VMs. You can find instructions on creating a Debian VM for Parallels in the `vxsuite-build-system` repository: https://github.com/votingworks/vxsuite-build-system

Once you've successfully created your VM, return to this guide for steps to configure ssh and VS Code access.

(Note: If you would like to create your Debian VM manually, you can refer to our previous documentation here <link>. Please be aware we are no longer maintaining that guide, and it will eventually be removed entirely.)

## Using the Terminal and VS Code on your home machine

If you would be like to develop from your home machine and use VS Code, you will need to do the following things. This assumes macOS.

On your home machine in the terminal open the ssh config file:
```sh
vim ~/.ssh/config
```
In your VM open the settings application. Click Network, then the gear icon next to the Wired Connected toggle. Copy the IPv4 address. (You can also find this IP address in the output of the `packer build` command run from the `vxsuite-build-system` repo.)
In the `~/.ssh/config` file on your Mac, add a new entry with a `<HOSTNAME>` placeholder for how to address the VM (e.g. `ssh vx` if `<HOSTNAME>` is `vx`), name it anything you like (we recommend `vx`):
```
Host <HOSTNAME> 
  HostName <HOST_IPv4_ADDRESS>
  ForwardAgent yes
```
If your username on the VM is different than your home computer you will also need to add a line:
```
  User <VM_USERNAME>
```

Save the file and test the connection by typing the following command on your home machine:
```
ssh <HOSTNAME>
```

If the above command prompted you for a password, run this on your home machine: 
```
ssh-copy-id <HOSTNAME>
```
Then try the `ssh` command again. It should complete without prompting for a password.

If running the above results in an `ERROR: No identities found`, you likely don't have any SSH keys on your home machine. You can generate one using:
```
ssh-keygen
```
You can hit enter without typing anything on all prompts to generate an SSH key at the default location without a passphrase. If you generate an SSH key with a passphrase and copy that over to your VM, you'll still be prompted for a password when you run `ssh <HOSTNAME>` (you'll just be prompted for your SSH key passphrase instead of your VM password).

Download and install [VS Code](https://code.visualstudio.com/) if desired for development.
Install the [Remote SSH extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-ssh) within VS Code. You may need to restart VS Code.

Open *Remote Explorer* on the left sidebar. 

Click the + button in the row with the VM hostname/alias to open a new remote window. Once connected, it should say "SSH: <HOSTNAME>" in the bottom left of the window. It may take a moment to install tools the first time you do this. 

Once that is complete you can continue the setup process with the [Debian Quickstart](./README.md#debian-quickstart) in the main README file. 
