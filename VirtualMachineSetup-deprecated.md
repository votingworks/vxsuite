# Virtual Machine Setup - Deprecated

## NOTE: This guide is deprecated and will be removed at some point in the future.

Follow the steps below to configure a Virtual Machine for development at VotingWorks. This guide assumes you are using macOS, if you are not modify the instructions as appropriate. 

## Create Debian Virtual Machine

1. Download and install [Parallels Pro](https://www.parallels.com/products/desktop/pro). For employees: You can expense this purchase. For small development tasks basic Parallels may be sufficient but we recommend Parallels Pro in order be able to increase the memory of the VM to higher levels, etc.

2. Download [Debian 11.2](https://www.debian.org/releases/bullseye/debian-installer/), bullseye. Download the `netinst CD image` appropriate for your processor. If your computer is has an ARM based processor, such as the MacBooks with M1 chips you **must** download the `arm64` image, otherwise you probably want the `amd64` image.

3. Create a new virtual machine in Parallels (File → New). Chose to install an OS from a image file and navigate to the `.iso` image you downloaded in step 2. 

4. Name your VM whatever you would like, and check the box to *Customize settings before installation*. Then click *Create*.

![Install Page - Name & Location](docs/setup_screenshots/name_and_location.png?raw=true)

5. Customize the settings to your liking. Some suggestions:

 - **Options/Sharing:** You can keep a shared folder between your VM and your home computer. This can be useful to transfer documents back and forth, etc. You can configure this how you wish, I recommend clicking Custom Folders... and creating a single shared folder. Shared folders will be found in your VM under `/media/psf/`.

- **Hardware/CPU & Memory:** Change Memory to at least 8GB. 16GB or more is preferred if your computer has enough RAM. 2 processors should be fine, but if you feel the need you can increase that as well.
 
 - **Hardware/Shared Printers:** Uncheck *Share Mac printers with Debian GNU/Linux*.

 - **Hardware/Sound & Camera:** Uncheck *Share Mac camera with Linux*

 - **Backup** Check the box for *SmartGuard* in order to enable automatic snapshots of your VM. This is highly recommended as long as you have the storage space. Note that you can also manually take snapshots at any time. Click *Details...* to customize how often snapshots are taken and how many are kept on your machine. If you aren't sure just keep the default settings.


Other settings that may not be present in newer versions of Parallels (in which case you can safely ignore)

- **Options/Applications:**  un-check Share Linux applications with Mac unless you enjoy clutter or have a specific need.
- **Options/More Options:** check Authenticate with macOS SSH public key.

When you are done, close the Configuration modal, and click *Continue*

## Installing Debian 

Once you boot your new virtual machine in Debian you will be prompted with the install guide. 

1. Chose either *Install* or *Graphical Install*, the latter will be used in this guide but it is just a slightly nicer UI, all of the steps and options are the same. 

![Debian Install Screen](docs/setup_screenshots/install_screen.png?raw=true)

2. Select your language, location, and keyboard layout on the next few screens. Debian will then begin installing. 

3. *Configure the network* You will be asked for a Hostname. Since we aren't running a network this doesn't really matter, you can leave the default `debian`.

![Debian Install Screen](docs/setup_screenshots/hostname.png?raw=true)

You will then be asked for a domain name, this can be left blank.

![Debian Install Screen](docs/setup_screenshots/domain_name.png?raw=true)

4. *Set up users and passwords* When prompted chose a password for your root user. Debian will create both a `root` user and another user account for you. This security measure is a bit of overkill for us since we are just developing on this VM, so it may simplify things to use the same password for both. 

Next you will be prompted to set up your non-root user account. You will be asked for the real name of the user, a username, and a password. It will make things slightly simpler to use the same username as your home computer's user account but you can chose anything you want here. 

Chose your timezone and click continue to continue the installation. 

6. *Partition Disks* You will be prompted on how to partition the disks. The production machines use LVM but for development it should be fine to just chose *Guided - use entire disk*. 

![Debian Install - Disk Partitioning Screen](docs/setup_screenshots/partitioning.png?raw=true)

Click continue on the next screen, confirming all data will be erased. 

When asked for what partitioning scheme to use select *All files in one partition*

![Debian Install - Disk Partitioning Screen](docs/setup_screenshots/partitioning2.png?raw=true)

Select *Finish partitioning and write changes to disk* on the next confirmation screen, and then click 'Yes' when asked if you want to *Write the changes to disk?*

7. After the install you will be asked if you want to *Scan extra installation media?* You can select **No**. 

8. You will then be asked to configure the package manager with a Debian archive mirror. Assuming you are in the US, chose *United States* and then *deb.debian.org*. When asked for http proxy information you can leave it blank. 

9. You'll be asked whether or not to share statistics through the package usage survey, feel free to chose whatever you like. 

10. Finally, you'll be given a choice of what software to install, with a mix of different desktop environments given. I recommend you check the boxes next to *Debian desktop environment*, *... GNOME*, *SSH server*, and *standard system utilities*.

Note: I have not extensively tested other options here, so if you chose a different desktop environment be aware that you may need to install other packages manually. I did briefly test just choosing Debian desktop environment without GNOME and needed to install a lot of other packages, such as `libjpeg`, `libgif` etc., in order to compile `vxsuite`.

![Software Install Screen](docs/setup_screenshots/software.png?raw=true) 

11. When installation is complete you will be prompted to reboot your system. 

## Install Parallels Tools

Before you can continue with the Debian Quickstart in the main README we will want to install the Parallels tools, this will allow all of the Parallels features, such as copy and pasting between your VM and home computer to work. 

 Log into your new user account, with the user password you set. Click Actions → Install Parallels Tools, and then click Continue on the pop-up. 

![Install Parallels Tools](docs/setup_screenshots/install_parallels_tools.png?raw=true) 

 Open a terminal (Activities -> Terminal). And enter the command: 

`su - ` _Note: the trailing `-` here is important!_

Then authenticate with the *root* password. You are now in a root shell. The installation CD will auto-mount in a non-readable manner, to fix this enter the command:

```sh
mount -t iso9660 -o ro,exec /dev/cdrom /media/cdrom
```

If you get an error about it already being mounted, first enter:

```sh
umount /media/cdrom
```

Then enter the following commands to start the installer: 

```sh
cd /media/cdrom
./install
``` 

Click continue through the prompts and your machine will automatically reboot at the end of this installation process. You can test that it works by copy and pasting things back and forth from the VM and your home machine. 

## Using the Terminal and VS Code on your home machine

If you would be like to develop from your home machine and use VS Code, you will need to do the following things. This assumes macOS.

On your home machine in the terminal open the ssh config file:
```sh
vim ~/.ssh/config
```
In your VM open the settings application. Click Network, then the gear icon next to the Wired Connected toggle. Copy the IPv4 address.
In that file add a new entry with a `<HOSTNAME>` placeholder for how to address the VM (e.g. `ssh vx` if `<HOSTNAME>` is `vx`), name it anything you like (we recommend `vx`):
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
